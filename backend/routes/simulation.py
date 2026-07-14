"""Sample Trucker Simulation.

Endpoints:
  POST /api/simulation/start         — create a fresh demo trucker + first load,
                                       return a login token, kick off a background
                                       task that animates the trip end-to-end.
  POST /api/simulation/stop          — stop the sim & optionally delete the account
  GET  /api/simulation/status        — sim state for the caller's driver

Each tick (every 5 real seconds ≈ 30 sim minutes):
  - Position advances toward destination
  - Sometimes fires a cabin event
  - Sometimes fires an alert
  - Auto-completes workflow steps at appropriate progress % milestones
  - Updates trip status; marks DELIVERED at 100 %
"""
from __future__ import annotations

import asyncio
import logging
import random
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

log = logging.getLogger("jadeos.simulation")

# Static demo route: Fort Worth TX → Phoenix AZ, ~1050 miles
ROUTE = [
    {"mi": 0,    "lat": 32.7555, "lng": -97.3308, "city": "Fort Worth",   "state": "TX"},
    {"mi": 150,  "lat": 32.4487, "lng": -99.7331, "city": "Abilene",      "state": "TX"},
    {"mi": 320,  "lat": 31.7619, "lng": -102.3626, "city": "Odessa",      "state": "TX"},
    {"mi": 500,  "lat": 31.4638, "lng": -104.5230, "city": "Van Horn",    "state": "TX"},
    {"mi": 610,  "lat": 31.7619, "lng": -106.4850, "city": "El Paso",     "state": "TX"},
    {"mi": 800,  "lat": 32.2226, "lng": -110.9747, "city": "Tucson",      "state": "AZ"},
    {"mi": 1050, "lat": 33.4484, "lng": -112.0740, "city": "Phoenix",     "state": "AZ"},
]
TOTAL_MI = 1050

CABIN_EVENTS_POOL = ["drowsiness", "distraction", "phone_use", "lane_drift", "harsh_brake", "speeding", "tailgating"]
ALERT_POOL = [
    {"kind": "weather", "severity": "warning", "title": "Wind gusts ahead", "body": "Crosswinds picking up to 35 mph in ~20 miles. Grip the wheel firm."},
    {"kind": "traffic", "severity": "warning", "title": "Slowdown reported", "body": "Google Maps flagged a 12-min slowdown ahead. JADE watching for a re-route."},
    {"kind": "route",   "severity": "info",    "title": "Prime fuel window", "body": "Love's #204 in 38 mi at $3.71/gal — 20¢ under card average."},
    {"kind": "hos",     "severity": "warning", "title": "Break window opening", "body": "Mandatory break in 90 min. Cleanest stop is a Pilot in 65 mi."},
]

WORKFLOW_MILESTONES = [
    # mile-percent completed → step key to auto-complete
    (0.02, "pre_trip"),
    (0.05, "arrive_shipper"),
    (0.08, "load_secured"),
    (0.10, "bol_pickup"),
    (0.12, "hos_start"),
    (0.40, "mid_check"),
    (0.55, "fuel_scan"),
    (0.92, "arrive_consignee"),
    (0.97, "unload"),
    (1.00, "close_load"),
]


class SimStartRequest(BaseModel):
    new_trucker: bool = True  # if False, uses the caller's account
    name: Optional[str] = None


def _position_at(mi: float) -> dict:
    if mi <= 0:
        return ROUTE[0].copy()
    if mi >= TOTAL_MI:
        return ROUTE[-1].copy()
    for i in range(len(ROUTE) - 1):
        a, b = ROUTE[i], ROUTE[i + 1]
        if a["mi"] <= mi < b["mi"]:
            span = b["mi"] - a["mi"]
            k = (mi - a["mi"]) / span if span else 0
            return {
                "mi": mi,
                "lat": a["lat"] + (b["lat"] - a["lat"]) * k,
                "lng": a["lng"] + (b["lng"] - a["lng"]) * k,
                "city": b["city"] if k > 0.5 else a["city"],
                "state": b["state"] if k > 0.5 else a["state"],
            }
    return ROUTE[-1].copy()


def make_router(db, current_user, utcnow_iso, jwt_secret: str, jwt_alg: str, make_token, emergent_llm_key: str = ""):
    router = APIRouter()

    # Import workflow template so we can pre-seed all 10 steps up-front.
    from routes.companion import WORKFLOW_TEMPLATE as _WF_TEMPLATE

    async def _seed_profile_workflow(email: str, name: str):
        """Populate a realistic driver profile + reset workflow with all 10 steps."""
        await db.driver_profiles.update_one(
            {"email": email},
            {"$set": {
                "email": email,
                "name": name,
                "home_base": "Fort Worth, TX",
                "home_lat": 32.7555,
                "home_lng": -97.3308,
                "dietary": "halal",
                "sleep_hours": 7.0,
                "coffee_habit": "1 large before 09:00",
                "family_status": "home Fri PM · wife + 1 kid",
                "faith_notes": "5x daily prayer, appreciates quiet stops",
                "safety_notes": "Prone to fatigue on long night hauls",
                "hobbies": "fishing, chess",
                "callsign": "SIM-77",
                "license": "TX-CDL-SIM-777",
                "updated_at": utcnow_iso(),
            }, "$setOnInsert": {"created_at": utcnow_iso()}},
            upsert=True,
        )
        # Reset workflow steps for this driver — full 10-step template
        await db.driver_workflow.delete_many({"driver_email": email})
        docs = []
        for i, tpl in enumerate(_WF_TEMPLATE):
            docs.append({
                "id": str(uuid.uuid4()),
                "driver_email": email,
                "order": i,
                "key": tpl["key"],
                "title": tpl["title"],
                "detail": tpl["detail"],
                "action": tpl["action"],
                "status": "pending",
                "notes": "",
                "completed_at": None,
                "created_at": utcnow_iso(),
            })
        await db.driver_workflow.insert_many(docs)
        # Reset alerts & cabin events for a clean sim
        await db.driver_alerts.delete_many({"driver_email": email})
        await db.cabin_events.delete_many({"driver_email": email})

    async def _sim_loop(email: str, name: str, sim_id: str):
        """Run the scripted route sim. Cancelled via the sim state doc."""
        completed_keys = set()
        try:
            # Seed the trip
            trip_id = str(uuid.uuid4())
            await db.trips.insert_one({
                "id": trip_id,
                "email": email,
                "name": f"SIM · Fort Worth → Phoenix",
                "origin": "Fort Worth, TX",
                "destination": "Phoenix, AZ",
                "commodity": "frozen produce",
                "status": "in_transit",
                "started_at": utcnow_iso(),
                "planned_start": utcnow_iso(),
            })

            step_seconds = 5     # 1 tick = 5 real seconds
            miles_per_tick = 55  # ~30 sim minutes @ 55 mph
            miles = 0.0
            ticks_since_event = 0
            ticks_since_alert = 0
            while miles < TOTAL_MI:
                sim = await db.simulation_state.find_one({"id": sim_id})
                if not sim or sim.get("status") == "stopped":
                    break

                miles += miles_per_tick
                pos = _position_at(miles)
                progress = miles / TOTAL_MI

                await db.simulation_state.update_one({"id": sim_id}, {"$set": {
                    "miles": miles, "progress": round(progress, 3),
                    "lat": pos["lat"], "lng": pos["lng"],
                    "city": pos["city"], "state": pos["state"],
                    "updated_at": utcnow_iso(),
                }})

                # Auto-complete workflow steps at their milestone marks
                for pct, key in WORKFLOW_MILESTONES:
                    if progress >= pct and key not in completed_keys:
                        # Seed the checklist first if not present
                        await db.driver_workflow.count_documents({"driver_email": email})
                        # Try to update-if-exists — otherwise create the step
                        step = await db.driver_workflow.find_one({"driver_email": email, "key": key})
                        if step:
                            await db.driver_workflow.update_one(
                                {"driver_email": email, "key": key},
                                {"$set": {"status": "completed", "notes": "auto — simulation", "completed_at": utcnow_iso()}},
                            )
                        else:
                            # If workflow not seeded yet, create minimum step
                            await db.driver_workflow.insert_one({
                                "id": str(uuid.uuid4()),
                                "driver_email": email,
                                "order": len(completed_keys),
                                "key": key,
                                "title": key.replace("_", " ").title(),
                                "detail": "Auto-completed by simulation",
                                "action": "checkbox",
                                "status": "completed",
                                "notes": "auto — simulation",
                                "completed_at": utcnow_iso(),
                                "created_at": utcnow_iso(),
                            })
                        completed_keys.add(key)

                # Fire a cabin event every ~3 ticks
                ticks_since_event += 1
                if ticks_since_event >= 3 and random.random() < 0.7:
                    ticks_since_event = 0
                    ev = {
                        "id": str(uuid.uuid4()),
                        "event_type": random.choice(CABIN_EVENTS_POOL),
                        "label": random.choice(["Lane drift", "Eyes off road", "Harsh brake", "Speeding", "Phone-in-hand"]),
                        "severity": random.choices([1, 2, 3, 4], weights=[1, 4, 3, 1])[0],
                        "driver_email": email,
                        "driver_name": name,
                        "location": {"lat": pos["lat"], "lng": pos["lng"], "city": pos["city"], "state": pos["state"]},
                        "speed_mph": random.randint(58, 72),
                        "notes": "SIM",
                        "thumb_url": "https://images.unsplash.com/photo-1601584115197-04ecc0da31ba?w=200&h=120&fit=crop",
                        "occurred_at": utcnow_iso(),
                        "status": "new",
                        "ingested_by": "simulation",
                    }
                    await db.cabin_events.insert_one(ev)

                # Fire an alert every ~6 ticks (was 4)
                ticks_since_alert += 1
                if ticks_since_alert >= 6 and random.random() < 0.5:
                    ticks_since_alert = 0
                    tpl = random.choice(ALERT_POOL).copy()
                    await db.driver_alerts.insert_one({
                        "id": str(uuid.uuid4()),
                        "driver_email": email,
                        "kind": tpl["kind"],
                        "severity": tpl["severity"],
                        "title": tpl["title"],
                        "body": tpl["body"],
                        "ack": False,
                        "created_by": "simulation",
                        "created_at": utcnow_iso(),
                    })

                await asyncio.sleep(step_seconds)

            # Mark trip delivered
            await db.trips.update_one({"id": trip_id}, {"$set": {"status": "delivered", "delivered_at": utcnow_iso()}})
            await db.simulation_state.update_one({"id": sim_id}, {"$set": {"status": "delivered", "finished_at": utcnow_iso()}})
            # Final delivery alert
            await db.driver_alerts.insert_one({
                "id": str(uuid.uuid4()),
                "driver_email": email,
                "kind": "dispatch",
                "severity": "info",
                "title": "Load DELIVERED · Phoenix",
                "body": "Great haul. Signed BOL uploaded. Detention timer stopped. Payout queued.",
                "ack": False,
                "created_by": "simulation",
                "created_at": utcnow_iso(),
            })
        except Exception as e:  # noqa: BLE001
            log.warning("sim loop failed: %s", e)
            await db.simulation_state.update_one({"id": sim_id}, {"$set": {"status": "error", "error": str(e)}})

    @router.post("/simulation/start")
    async def start_simulation(req: SimStartRequest):
        if req.new_trucker:
            # Generate a fresh demo trucker account
            suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
            email = f"trucker-{suffix}@jadeos.demo"
            password = "sim1234"
            name = req.name or random.choice([
                "Marcus Reyes", "Aisha Patel", "Diego Alvarez", "Naomi Chen",
                "Hassan Kimathi", "Sofia Petrov", "Jake Whitehorse",
            ])
            pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
            result = await db.users.insert_one({
                "email": email,
                "password_hash": pw_hash,
                "name": name,
                "role": "driver",
                "callsign": "SIM-77",
                "license": "TX-CDL-SIM-777",
                "rating": 5.0,
                "avatar": "",
                "created_at": utcnow_iso(),
                "is_simulation": True,
            })
            token = make_token(email, "driver")
            user_email = email
        else:
            # Shouldn't reach without auth — but simple guard
            raise HTTPException(400, "new_trucker=false requires an auth token — use header path")

        await _seed_profile_workflow(user_email, name)

        sim_id = str(uuid.uuid4())
        await db.simulation_state.insert_one({
            "id": sim_id,
            "email": user_email,
            "name": name,
            "status": "running",
            "miles": 0,
            "progress": 0.0,
            "lat": ROUTE[0]["lat"],
            "lng": ROUTE[0]["lng"],
            "city": ROUTE[0]["city"],
            "state": ROUTE[0]["state"],
            "total_mi": TOTAL_MI,
            "started_at": utcnow_iso(),
        })
        # Kick off background loop
        asyncio.get_event_loop().create_task(_sim_loop(user_email, name, sim_id))

        return {
            "token": token,
            "user": {
                "id": str(result.inserted_id),
                "email": user_email,
                "name": name,
                "role": "driver",
                "callsign": "SIM-77",
                "license": "TX-CDL-SIM-777",
                "rating": 5.0,
                "avatar": "",
            },
            "sim_id": sim_id,
        }

    @router.get("/simulation/status")
    async def get_status(user: dict = Depends(current_user)):
        doc = await db.simulation_state.find_one(
            {"email": user["email"]}, sort=[("started_at", -1)]
        )
        if not doc:
            return {"active": False}
        doc.pop("_id", None)
        return {"active": doc.get("status") == "running", **doc}

    @router.post("/simulation/stop")
    async def stop_simulation(user: dict = Depends(current_user)):
        r = await db.simulation_state.update_many(
            {"email": user["email"], "status": "running"},
            {"$set": {"status": "stopped", "stopped_at": utcnow_iso()}},
        )
        return {"stopped": r.modified_count}

    @router.get("/broker/watch")
    async def broker_watch(user: dict = Depends(current_user)):
        """Live fleet dashboard for the broker. Returns every active driver
        (running sim or in-transit trip) with position + live metrics."""
        if user["role"] != "broker":
            raise HTTPException(403, "Broker only")

        sims = await db.simulation_state.find(
            {"status": {"$in": ["running", "delivered"]}},
        ).sort("started_at", -1).limit(60).to_list(length=60)

        now = datetime.now(timezone.utc)
        watch_since = (now - timedelta(minutes=5)).isoformat()

        drivers = []
        for s in sims:
            email = s.get("email")
            if not email:
                continue
            # Live rolling metrics
            recent_events = await db.cabin_events.count_documents({
                "driver_email": email,
                "occurred_at": {"$gte": watch_since},
            })
            recent_alerts = await db.driver_alerts.count_documents({
                "driver_email": email,
                "created_at": {"$gte": watch_since},
                "ack": False,
            })
            events_total = await db.cabin_events.count_documents({"driver_email": email})
            flagged = await db.cabin_events.count_documents({"driver_email": email, "status": "flagged_for_review"})
            wf = await db.driver_workflow.find({"driver_email": email}).to_list(length=20)
            wf_done = sum(1 for w in wf if w.get("status") == "completed")

            # HOS efficiency approximation (same model as recap)
            lost_min = 2 * flagged + 3 * recent_alerts
            drive_min = max(30, (s.get("total_mi", 1050) / 60) * 60)
            hos_eff = round(100 * drive_min / (drive_min + lost_min), 1)

            drivers.append({
                "email": email,
                "name": s.get("name"),
                "sim_id": s.get("id"),
                "status": s.get("status"),
                "origin": "Fort Worth, TX",
                "destination": "Phoenix, AZ",
                "current_city": s.get("city"),
                "current_state": s.get("state"),
                "lat": s.get("lat"),
                "lng": s.get("lng"),
                "miles": round(s.get("miles", 0)),
                "total_mi": s.get("total_mi", 1050),
                "progress": round(s.get("progress", 0), 3),
                "events_total": events_total,
                "events_recent": recent_events,
                "events_flagged": flagged,
                "alerts_open": recent_alerts,
                "workflow_done": wf_done,
                "workflow_total": len(wf),
                "hos_efficiency": hos_eff,
                "started_at": s.get("started_at"),
                "updated_at": s.get("updated_at") or s.get("started_at"),
            })

        # Aggregate KPI strip
        active = [d for d in drivers if d["status"] == "running"]
        kpis = {
            "active_loads": len(active),
            "total_watched": len(drivers),
            "events_5m": sum(d["events_recent"] for d in drivers),
            "alerts_open": sum(d["alerts_open"] for d in drivers),
            "avg_hos": round(sum(d["hos_efficiency"] for d in drivers) / max(1, len(drivers)), 1),
            "avg_progress": round(sum(d["progress"] for d in active) / max(1, len(active)) * 100, 1),
        }

        return {"kpis": kpis, "drivers": drivers}

    @router.get("/broker/watch/{driver_email}")
    async def watch_driver_detail(driver_email: str, user: dict = Depends(current_user)):
        """Full detail for one driver — workflow, last events, active alerts, sim state."""
        if user["role"] != "broker":
            raise HTTPException(403, "Broker only")
        email = driver_email.lower().strip()

        sim = await db.simulation_state.find_one({"email": email}, sort=[("started_at", -1)])
        if sim:
            sim.pop("_id", None)

        # user record for avatar
        user_doc = await db.users.find_one({"email": email})
        avatar = user_doc.get("avatar", "") if user_doc else ""

        events = await db.cabin_events.find({"driver_email": email}).sort("occurred_at", -1).limit(10).to_list(length=10)
        for e in events:
            e.pop("_id", None)

        alerts = await db.driver_alerts.find({"driver_email": email, "ack": False}).sort("created_at", -1).limit(10).to_list(length=10)
        for a in alerts:
            a.pop("_id", None)

        workflow = await db.driver_workflow.find({"driver_email": email}).sort("order", 1).to_list(length=20)
        for w in workflow:
            w.pop("_id", None)
        wf_completed = sum(1 for w in workflow if w.get("status") == "completed")

        # Recent broker→driver pings (from driver_nudges by this broker)
        recent_pings = await db.driver_nudges.find({"driver_email": email, "created_by": {"$exists": True}}).sort("created_at", -1).limit(6).to_list(length=6)
        for p in recent_pings:
            p.pop("_id", None)

        return {
            "driver": {
                "email": email,
                "name": (user_doc.get("name") if user_doc else None) or (sim.get("name") if sim else email),
                "avatar": avatar,
                "callsign": user_doc.get("callsign", "") if user_doc else "",
            },
            "sim": sim,
            "events": events,
            "alerts": alerts,
            "workflow": {"steps": workflow, "completed": wf_completed, "total": len(workflow)},
            "recent_pings": recent_pings,
        }

    @router.post("/broker/ping-driver")
    async def ping_driver(payload: dict, user: dict = Depends(current_user)):
        """Broker sends a message + optional TTS voice nudge to a driver's
        JADE companion inbox. Creates two driver_nudges docs (message + voice)."""
        if user["role"] != "broker":
            raise HTTPException(403, "Broker only")
        driver_email = (payload.get("driver_email") or "").lower().strip()
        message = (payload.get("message") or "").strip()
        with_voice = bool(payload.get("with_voice", True))
        if not driver_email or not message:
            raise HTTPException(400, "driver_email and message are required")

        created = []
        # Message
        msg_doc = {
            "id": str(uuid.uuid4()),
            "driver_email": driver_email,
            "kind": "message",
            "title": f"Broker · {user.get('name','Dispatch')}",
            "text": message,
            "event_id": None,
            "rule_id": None,
            "ack": False,
            "created_by": user["email"],
            "created_at": utcnow_iso(),
        }
        await db.driver_nudges.insert_one(msg_doc)
        msg_doc.pop("_id", None)
        created.append(msg_doc)

        if with_voice:
            voice_doc = {**msg_doc, "id": str(uuid.uuid4()), "kind": "voice", "title": "Broker · voice ping"}
            await db.driver_nudges.insert_one(voice_doc)
            voice_doc.pop("_id", None)
            created.append(voice_doc)

        # Also inject a dispatch alert so it pops up in the driver's popup surface
        alert_doc = {
            "id": str(uuid.uuid4()),
            "driver_email": driver_email,
            "kind": "dispatch",
            "severity": "info",
            "title": f"Message from {user.get('name','Dispatch')}",
            "body": message,
            "ack": False,
            "created_by": user["email"],
            "created_at": utcnow_iso(),
        }
        await db.driver_alerts.insert_one(alert_doc)

        return {"created": created, "alert_id": alert_doc["id"]}

    @router.get("/simulation/recap")
    async def get_recap(user: dict = Depends(current_user)):
        """Aggregate stats + Claude-drafted debrief for the driver's latest sim run."""
        sim = await db.simulation_state.find_one({"email": user["email"]}, sort=[("started_at", -1)])
        if not sim:
            raise HTTPException(404, "No simulation for this driver")

        events = await db.cabin_events.find({"driver_email": user["email"]}).to_list(length=500)
        alerts = await db.driver_alerts.find({"driver_email": user["email"]}).to_list(length=200)
        coaching = await db.coaching_sessions.find({"driver_email": user["email"]}).to_list(length=100)
        workflow = await db.driver_workflow.find({"driver_email": user["email"]}).to_list(length=50)

        events_by_type = {}
        events_by_severity = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        for e in events:
            events_by_type[e["event_type"]] = events_by_type.get(e["event_type"], 0) + 1
            events_by_severity[e.get("severity", 2)] = events_by_severity.get(e.get("severity", 2), 0) + 1

        started = sim.get("started_at")
        finished = sim.get("finished_at") or sim.get("stopped_at") or utcnow_iso()
        try:
            t0 = datetime.fromisoformat(started.replace("Z", "+00:00"))
            t1 = datetime.fromisoformat(finished.replace("Z", "+00:00"))
            elapsed_seconds = max(1, (t1 - t0).total_seconds())
        except Exception:
            elapsed_seconds = 60

        # HOS efficiency: (sim miles / (sim miles + est detention miles)) rough model
        # Since sim doesn't model detention explicitly, we approximate:
        # events lost 2 min each · alerts >warning lost 3 min each
        lost_min = 2 * sum(events_by_severity[s] for s in (3, 4, 5)) + 3 * sum(1 for a in alerts if a.get("severity") in ("warning", "critical"))
        # sim total_mi represents "worked" time. We estimate HOS = drive time / (drive + lost)
        drive_min = max(30, (sim.get("total_mi", TOTAL_MI) / 60) * 60)  # ~1 hr per 60 mi
        hos_efficiency = round(100 * drive_min / (drive_min + lost_min), 1)

        stats = {
            "driver": {"name": sim.get("name"), "email": user["email"]},
            "route": {"origin": "Fort Worth, TX", "destination": "Phoenix, AZ",
                      "miles": round(sim.get("miles", 0)), "total_mi": sim.get("total_mi", TOTAL_MI)},
            "status": sim.get("status"),
            "elapsed_seconds": round(elapsed_seconds),
            "events": {
                "total": len(events),
                "by_type": events_by_type,
                "by_severity": events_by_severity,
                "flagged": sum(1 for e in events if e.get("status") == "flagged_for_review"),
            },
            "alerts": {
                "total": len(alerts),
                "acknowledged": sum(1 for a in alerts if a.get("ack")),
                "critical": sum(1 for a in alerts if a.get("severity") == "critical"),
                "warning": sum(1 for a in alerts if a.get("severity") == "warning"),
            },
            "coaching": {
                "sessions_created": len(coaching),
                "completed": sum(1 for c in coaching if c.get("status") == "completed"),
            },
            "workflow": {
                "completed": sum(1 for w in workflow if w.get("status") == "completed"),
                "total": len(workflow),
            },
            "hos_efficiency": hos_efficiency,
        }

        # Claude debrief
        debrief = None
        if emergent_llm_key:
            try:
                from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
                system = (
                    "You are JADE, the in-cab AI copilot. Write a 4-part post-load debrief for the driver, "
                    "warm and human, respectful never lecturing. Keep it under 200 words. Sections (with markdown "
                    "headers): ## Route summary, ## What went well, ## What to sharpen next haul, ## JADE's send-off. "
                    "Use their first name once in the send-off. Reference specific numbers from the stats."
                )
                first = (sim.get("name") or "Driver").split()[0]
                summary = (
                    f"Driver: {first}\n"
                    f"Route: Fort Worth → Phoenix ({stats['route']['miles']} mi / {stats['route']['total_mi']} mi, status: {stats['status']})\n"
                    f"Cabin events: {stats['events']['total']} total, {stats['events']['flagged']} flagged, by type: {events_by_type}\n"
                    f"Alerts: {stats['alerts']['total']} total ({stats['alerts']['critical']} critical, {stats['alerts']['warning']} warning), {stats['alerts']['acknowledged']} acknowledged\n"
                    f"Coaching sessions triggered: {stats['coaching']['sessions_created']}\n"
                    f"Workflow: {stats['workflow']['completed']}/{stats['workflow']['total']} steps complete\n"
                    f"HOS efficiency: {hos_efficiency}%\n\n"
                    "Compose the debrief now."
                )
                chat = LlmChat(
                    api_key=emergent_llm_key,
                    session_id=f"recap-{sim['id']}",
                    system_message=system,
                ).with_model("anthropic", "claude-sonnet-4-5-20250929")
                result = await chat.send_message(UserMessage(text=summary))
                debrief = result if isinstance(result, str) else (getattr(result, "text", None) or str(result))
                debrief = (debrief or "").strip()
            except Exception as e:  # noqa: BLE001
                log.warning("recap debrief failed: %s", e)

        if not debrief:
            first = (sim.get("name") or "Driver").split()[0]
            debrief = (
                f"## Route summary\nFort Worth → Phoenix · {stats['route']['miles']} of {stats['route']['total_mi']} miles.\n\n"
                f"## What went well\n{stats['workflow']['completed']}/{stats['workflow']['total']} workflow steps closed. "
                f"HOS efficiency held at {hos_efficiency}%.\n\n"
                f"## What to sharpen next haul\n{stats['events']['flagged']} flagged cabin events — worth reviewing at the yard.\n\n"
                f"## JADE's send-off\nSolid haul, {first}. Rest up — the next one is on the board."
            )

        return {"stats": stats, "debrief": debrief}

    return router
