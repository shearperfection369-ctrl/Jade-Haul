"""Cabin-camera safety automations for Jade Haul.

This module powers broker-side automated responses to in-cab camera events.

Concepts:
  - CabinEvent: a safety/behavior event captured by the dashcam (drowsiness,
    distraction, phone-use, lane-drift, harsh-brake, speeding, tailgating,
    no-seatbelt). Each carries severity 1..5, GPS, occurred_at, driver, status.
  - SafetyRule: broker-defined trigger. When N events of types T at severity
    >= S occur within W minutes, fire a list of actions.
  - SafetyAction (audit log): every fired action — auto in-app message,
    auto JADE voice nudge, auto coaching session, auto flag-for-review.
  - CoachingSession: a record for the driver-facing coaching inbox.
  - DriverNudge: a queued voice/text nudge surfaced inside the driver app.

Event ingestion happens via POST /api/cabin/events. Each insert runs the
rule engine synchronously and records every triggered action.

A background simulator injects ~1 event per 35–55s for the demo driver so
the broker sees a live feed without real hardware. Disable via
DISABLE_CABIN_SIMULATOR=1 in env.
"""
from __future__ import annotations

import asyncio
import logging
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

log = logging.getLogger("jadeos.safety")

EVENT_TYPES = [
    "drowsiness", "distraction", "phone_use", "lane_drift",
    "harsh_brake", "speeding", "tailgating", "no_seatbelt",
]

EVENT_LABELS = {
    "drowsiness": "Drowsiness detected",
    "distraction": "Eyes off road",
    "phone_use": "Phone-in-hand",
    "lane_drift": "Lane drift",
    "harsh_brake": "Harsh brake",
    "speeding": "Speeding",
    "tailgating": "Following too close",
    "no_seatbelt": "Seatbelt unfastened",
}

ACTION_TYPES = ["message", "jade_voice", "coach", "flag"]

DEMO_DRIVER_EMAIL = "driver@jadeos.com"


# ---------- Pydantic ----------
class CabinEventCreate(BaseModel):
    event_type: str
    severity: int = Field(ge=1, le=5)
    driver_email: Optional[str] = None
    driver_name: Optional[str] = None
    location: Optional[dict] = None  # {lat, lng, city, state}
    speed_mph: Optional[float] = None
    notes: Optional[str] = ""


class RuleAction(BaseModel):
    type: str  # message | jade_voice | coach | flag
    template: Optional[str] = None  # if blank, use Claude draft at fire-time
    use_ai: bool = True


class SafetyRuleCreate(BaseModel):
    name: str
    event_types: list[str]
    min_severity: int = 2
    threshold_count: int = 1
    window_minutes: int = 30
    actions: list[RuleAction]
    enabled: bool = True


class SafetyRuleUpdate(BaseModel):
    name: Optional[str] = None
    event_types: Optional[list[str]] = None
    min_severity: Optional[int] = None
    threshold_count: Optional[int] = None
    window_minutes: Optional[int] = None
    actions: Optional[list[RuleAction]] = None
    enabled: Optional[bool] = None


class CoachingAck(BaseModel):
    status: str  # acknowledged | completed


# ---------- Helpers ----------
def _utc():
    return datetime.now(timezone.utc)


def _serialise(doc):
    if not doc:
        return doc
    if "_id" in doc:
        doc.pop("_id", None)
    return doc


def make_router(db, current_user, utcnow_iso, emergent_llm_key: str):
    router = APIRouter()

    # -------- Default rules + indexes seeded at startup --------
    async def seed_defaults():
        try:
            await db.cabin_events.create_index([("occurred_at", -1)])
            await db.cabin_events.create_index("driver_email")
            await db.safety_rules.create_index("created_at")
            await db.coaching_sessions.create_index([("created_at", -1)])
            await db.driver_nudges.create_index([("created_at", -1)])
            await db.safety_actions.create_index([("created_at", -1)])
        except Exception as e:  # noqa: BLE001
            log.warning("safety index init: %s", e)

        if await db.safety_rules.count_documents({}) == 0:
            now = utcnow_iso()
            await db.safety_rules.insert_many([
                {
                    "id": str(uuid.uuid4()),
                    "name": "Drowsiness · auto-coach + voice nudge",
                    "event_types": ["drowsiness"],
                    "min_severity": 2,
                    "threshold_count": 1,
                    "window_minutes": 60,
                    "actions": [
                        {"type": "jade_voice", "template": "", "use_ai": True},
                        {"type": "message", "template": "", "use_ai": True},
                        {"type": "coach", "template": "Fatigue management refresher", "use_ai": True},
                        {"type": "flag", "template": "", "use_ai": False},
                    ],
                    "enabled": True,
                    "created_at": now,
                },
                {
                    "id": str(uuid.uuid4()),
                    "name": "Phone use · message + coach",
                    "event_types": ["phone_use", "distraction"],
                    "min_severity": 2,
                    "threshold_count": 1,
                    "window_minutes": 30,
                    "actions": [
                        {"type": "message", "template": "", "use_ai": True},
                        {"type": "coach", "template": "Distraction-free driving", "use_ai": True},
                    ],
                    "enabled": True,
                    "created_at": now,
                },
                {
                    "id": str(uuid.uuid4()),
                    "name": "Repeated harsh brake (2 in 30 min)",
                    "event_types": ["harsh_brake", "tailgating"],
                    "min_severity": 3,
                    "threshold_count": 2,
                    "window_minutes": 30,
                    "actions": [
                        {"type": "jade_voice", "template": "", "use_ai": True},
                        {"type": "flag", "template": "", "use_ai": False},
                    ],
                    "enabled": True,
                    "created_at": now,
                },
                {
                    "id": str(uuid.uuid4()),
                    "name": "No seatbelt · immediate voice + flag",
                    "event_types": ["no_seatbelt"],
                    "min_severity": 1,
                    "threshold_count": 1,
                    "window_minutes": 5,
                    "actions": [
                        {"type": "jade_voice", "template": "Fasten your seatbelt now — federal compliance.", "use_ai": False},
                        {"type": "flag", "template": "", "use_ai": False},
                    ],
                    "enabled": True,
                    "created_at": now,
                },
            ])
            log.info("Seeded 4 default safety rules")

    asyncio.get_event_loop().create_task(seed_defaults())

    # -------- AI message drafter --------
    async def _ai_draft(event: dict, action_kind: str, fallback_template: str) -> str:
        """Use Claude to draft a personalised coaching message. Falls back to
        template substitution if the LLM is unreachable."""
        first_name = (event.get("driver_name") or "Driver").split()[0]
        label = EVENT_LABELS.get(event["event_type"], event["event_type"])
        severity = event.get("severity", 2)
        loc = event.get("location") or {}
        loc_str = ""
        if loc.get("city") or loc.get("state"):
            loc_str = f" near {loc.get('city','')} {loc.get('state','')}".strip()

        if fallback_template:
            # Lightweight variable substitution
            return (fallback_template
                    .replace("{driver}", first_name)
                    .replace("{event}", label)
                    .replace("{location}", loc_str.strip() or "your current location")
                    .replace("{severity}", str(severity)))

        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
            system = (
                "You are JADE, the in-cab AI safety coach for Jade Haul. Write extremely concise, "
                "respectful coaching messages to drivers. Never lecture, never shame. Tone: calm, "
                "data-driven, supportive. Always 1–2 short sentences. Use the driver's first name. "
                "End with a clear next action."
            )
            if action_kind == "jade_voice":
                instruction = (
                    f"Driver {first_name} just triggered a {label} event (severity {severity}/5){loc_str}. "
                    "Speak directly to them in 1 sentence (max ~22 words). It will be spoken aloud by TTS."
                )
            else:
                instruction = (
                    f"Driver {first_name} just triggered a {label} event (severity {severity}/5){loc_str}. "
                    "Write a 1–2 sentence in-app message a broker would send. Include one specific next step."
                )
            chat = LlmChat(
                api_key=emergent_llm_key,
                session_id=f"safety-{event['id']}",
                system_message=system,
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")
            result = await chat.send_message(UserMessage(text=instruction))
            text = result if isinstance(result, str) else (getattr(result, "text", None) or str(result))
            return (text or "").strip().strip('"').strip("'")
        except Exception as e:  # noqa: BLE001
            log.warning("AI draft failed, falling back: %s", e)
            return f"{first_name}, we just flagged {label.lower()}{loc_str}. Take a moment, reset, and check in with dispatch."

    # -------- Rule engine --------
    async def _evaluate_rules(event: dict):
        rules = await db.safety_rules.find({"enabled": True}).to_list(length=200)
        fired = []
        for rule in rules:
            if event["event_type"] not in rule.get("event_types", []):
                continue
            if event["severity"] < rule.get("min_severity", 1):
                continue
            window_min = rule.get("window_minutes", 30)
            since_iso = (_utc() - timedelta(minutes=window_min)).isoformat()
            count = await db.cabin_events.count_documents({
                "driver_email": event.get("driver_email"),
                "event_type": {"$in": rule["event_types"]},
                "severity": {"$gte": rule["min_severity"]},
                "occurred_at": {"$gte": since_iso},
            })
            if count < rule.get("threshold_count", 1):
                continue

            for action in rule["actions"]:
                act_type = action.get("type")
                if act_type not in ACTION_TYPES:
                    continue
                text = await _ai_draft(event, act_type, action.get("template") or "")

                action_doc = {
                    "id": str(uuid.uuid4()),
                    "event_id": event["id"],
                    "rule_id": rule["id"],
                    "rule_name": rule["name"],
                    "driver_email": event.get("driver_email"),
                    "driver_name": event.get("driver_name"),
                    "action_type": act_type,
                    "text": text,
                    "created_at": utcnow_iso(),
                    "status": "sent",
                }
                await db.safety_actions.insert_one(action_doc)

                # Side-effects
                if act_type == "message":
                    await db.driver_nudges.insert_one({
                        "id": str(uuid.uuid4()),
                        "driver_email": event.get("driver_email"),
                        "kind": "message",
                        "title": f"From your broker · re: {EVENT_LABELS.get(event['event_type'], event['event_type'])}",
                        "text": text,
                        "event_id": event["id"],
                        "rule_id": rule["id"],
                        "ack": False,
                        "created_at": utcnow_iso(),
                    })
                elif act_type == "jade_voice":
                    await db.driver_nudges.insert_one({
                        "id": str(uuid.uuid4()),
                        "driver_email": event.get("driver_email"),
                        "kind": "voice",
                        "title": "JADE voice coach",
                        "text": text,
                        "event_id": event["id"],
                        "rule_id": rule["id"],
                        "ack": False,
                        "created_at": utcnow_iso(),
                    })
                elif act_type == "coach":
                    topic = action.get("template") or EVENT_LABELS.get(event["event_type"], "Safety coaching")
                    await db.coaching_sessions.insert_one({
                        "id": str(uuid.uuid4()),
                        "driver_email": event.get("driver_email"),
                        "driver_name": event.get("driver_name"),
                        "topic": topic,
                        "summary": text,
                        "severity": event["severity"],
                        "event_type": event["event_type"],
                        "event_id": event["id"],
                        "rule_id": rule["id"],
                        "status": "open",
                        "created_at": utcnow_iso(),
                    })
                elif act_type == "flag":
                    await db.cabin_events.update_one(
                        {"id": event["id"]},
                        {"$set": {"status": "flagged_for_review", "flagged_at": utcnow_iso()}},
                    )

                fired.append({k: v for k, v in action_doc.items() if k != "_id"})
        return fired

    # -------- Event ingest --------
    @router.post("/cabin/events")
    async def ingest_event(req: CabinEventCreate, user: dict = Depends(current_user)):
        if req.event_type not in EVENT_TYPES:
            raise HTTPException(400, f"event_type must be one of {EVENT_TYPES}")
        ev = {
            "id": str(uuid.uuid4()),
            "event_type": req.event_type,
            "label": EVENT_LABELS[req.event_type],
            "severity": req.severity,
            "driver_email": (req.driver_email or DEMO_DRIVER_EMAIL).lower(),
            "driver_name": req.driver_name or "Marcus Reyes",
            "location": req.location or {"lat": 33.4484, "lng": -112.0740, "city": "Phoenix", "state": "AZ"},
            "speed_mph": req.speed_mph,
            "notes": req.notes,
            "thumb_url": f"https://images.unsplash.com/photo-1601584115197-04ecc0da31ba?w=200&h=120&fit=crop",
            "occurred_at": utcnow_iso(),
            "status": "new",
            "ingested_by": user["email"],
        }
        await db.cabin_events.insert_one(ev)
        actions = await _evaluate_rules(ev)
        # Refresh event status if a flag was applied
        latest = await db.cabin_events.find_one({"id": ev["id"]})
        return {"event": _serialise(latest), "actions_fired": actions}

    @router.post("/cabin/events/simulate")
    async def simulate_event(user: dict = Depends(current_user)):
        ev_type = random.choice(EVENT_TYPES)
        severity = random.choices([1, 2, 3, 4, 5], weights=[1, 4, 5, 3, 1])[0]
        cities = [
            {"lat": 33.4484, "lng": -112.0740, "city": "Phoenix", "state": "AZ"},
            {"lat": 35.0844, "lng": -106.6504, "city": "Albuquerque", "state": "NM"},
            {"lat": 32.7767, "lng": -96.7970, "city": "Dallas", "state": "TX"},
            {"lat": 34.4208, "lng": -119.6982, "city": "Santa Barbara", "state": "CA"},
        ]
        speeds = {"speeding": random.randint(75, 92), "harsh_brake": random.randint(55, 70), "tailgating": random.randint(60, 78)}
        req = CabinEventCreate(
            event_type=ev_type,
            severity=severity,
            driver_email=DEMO_DRIVER_EMAIL,
            driver_name="Marcus Reyes",
            location=random.choice(cities),
            speed_mph=speeds.get(ev_type, random.randint(55, 70)),
            notes="Simulated event",
        )
        return await ingest_event(req, user)

    @router.get("/cabin/events")
    async def list_events(
        limit: int = 50,
        driver_email: Optional[str] = None,
        event_type: Optional[str] = None,
        status: Optional[str] = None,
        user: dict = Depends(current_user),
    ):
        q = {}
        if driver_email:
            q["driver_email"] = driver_email.lower()
        elif user["role"] == "driver":
            q["driver_email"] = user["email"]
        if event_type:
            q["event_type"] = event_type
        if status:
            q["status"] = status
        docs = await db.cabin_events.find(q).sort("occurred_at", -1).limit(min(limit, 200)).to_list(length=200)
        return [_serialise(d) for d in docs]

    @router.get("/cabin/events/{event_id}")
    async def get_event(event_id: str, user: dict = Depends(current_user)):
        doc = await db.cabin_events.find_one({"id": event_id})
        if not doc:
            raise HTTPException(404, "Event not found")
        actions = await db.safety_actions.find({"event_id": event_id}).sort("created_at", 1).to_list(length=50)
        return {"event": _serialise(doc), "actions": [_serialise(a) for a in actions]}

    @router.patch("/cabin/events/{event_id}")
    async def update_event_status(event_id: str, payload: dict, user: dict = Depends(current_user)):
        new_status = payload.get("status")
        if new_status not in ("new", "flagged_for_review", "reviewed", "dismissed"):
            raise HTTPException(400, "invalid status")
        res = await db.cabin_events.update_one({"id": event_id}, {"$set": {"status": new_status, "reviewed_by": user["email"], "reviewed_at": utcnow_iso()}})
        if res.matched_count == 0:
            raise HTTPException(404, "Event not found")
        doc = await db.cabin_events.find_one({"id": event_id})
        return _serialise(doc)

    # -------- Safety Rules --------
    @router.get("/safety/rules")
    async def list_rules(user: dict = Depends(current_user)):
        if user["role"] != "broker":
            raise HTTPException(403, "Broker only")
        docs = await db.safety_rules.find().sort("created_at", -1).to_list(length=100)
        return [_serialise(d) for d in docs]

    @router.post("/safety/rules")
    async def create_rule(req: SafetyRuleCreate, user: dict = Depends(current_user)):
        if user["role"] != "broker":
            raise HTTPException(403, "Broker only")
        bad = [t for t in req.event_types if t not in EVENT_TYPES]
        if bad:
            raise HTTPException(400, f"unknown event_types: {bad}")
        for a in req.actions:
            if a.type not in ACTION_TYPES:
                raise HTTPException(400, f"unknown action type: {a.type}")
        doc = {
            "id": str(uuid.uuid4()),
            "name": req.name,
            "event_types": req.event_types,
            "min_severity": req.min_severity,
            "threshold_count": req.threshold_count,
            "window_minutes": req.window_minutes,
            "actions": [a.model_dump() for a in req.actions],
            "enabled": req.enabled,
            "created_by": user["email"],
            "created_at": utcnow_iso(),
        }
        await db.safety_rules.insert_one(doc)
        return _serialise(doc)

    @router.patch("/safety/rules/{rule_id}")
    async def update_rule(rule_id: str, req: SafetyRuleUpdate, user: dict = Depends(current_user)):
        if user["role"] != "broker":
            raise HTTPException(403, "Broker only")
        patch = {k: v for k, v in req.model_dump(exclude_none=True).items()}
        if "actions" in patch:
            patch["actions"] = [a if isinstance(a, dict) else a.model_dump() for a in patch["actions"]]
        if not patch:
            raise HTTPException(400, "empty update")
        res = await db.safety_rules.update_one({"id": rule_id}, {"$set": patch})
        if res.matched_count == 0:
            raise HTTPException(404, "Rule not found")
        doc = await db.safety_rules.find_one({"id": rule_id})
        return _serialise(doc)

    @router.delete("/safety/rules/{rule_id}")
    async def delete_rule(rule_id: str, user: dict = Depends(current_user)):
        if user["role"] != "broker":
            raise HTTPException(403, "Broker only")
        res = await db.safety_rules.delete_one({"id": rule_id})
        return {"deleted": res.deleted_count}

    # -------- Safety actions audit --------
    @router.get("/safety/actions")
    async def list_actions(limit: int = 50, user: dict = Depends(current_user)):
        docs = await db.safety_actions.find().sort("created_at", -1).limit(min(limit, 200)).to_list(length=200)
        return [_serialise(d) for d in docs]

    # -------- AI draft on demand (broker preview) --------
    @router.post("/safety/draft")
    async def draft_message(req: dict, user: dict = Depends(current_user)):
        if user["role"] != "broker":
            raise HTTPException(403, "Broker only")
        event_id = req.get("event_id")
        kind = req.get("action_kind", "message")
        template = req.get("template", "")
        event = await db.cabin_events.find_one({"id": event_id})
        if not event:
            raise HTTPException(404, "Event not found")
        text = await _ai_draft(event, kind, template)
        return {"text": text}

    # -------- Driver coaching inbox --------
    @router.get("/driver/coaching")
    async def list_coaching(user: dict = Depends(current_user)):
        sessions = await db.coaching_sessions.find({"driver_email": user["email"]}).sort("created_at", -1).limit(50).to_list(length=50)
        nudges = await db.driver_nudges.find({"driver_email": user["email"]}).sort("created_at", -1).limit(50).to_list(length=50)
        return {
            "sessions": [_serialise(s) for s in sessions],
            "nudges": [_serialise(n) for n in nudges],
        }

    @router.patch("/driver/coaching/{session_id}")
    async def ack_session(session_id: str, req: CoachingAck, user: dict = Depends(current_user)):
        if req.status not in ("acknowledged", "completed"):
            raise HTTPException(400, "invalid status")
        res = await db.coaching_sessions.update_one(
            {"id": session_id, "driver_email": user["email"]},
            {"$set": {"status": req.status, "acked_at": utcnow_iso()}},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Session not found")
        return {"ok": True}

    @router.patch("/driver/nudges/{nudge_id}")
    async def ack_nudge(nudge_id: str, user: dict = Depends(current_user)):
        res = await db.driver_nudges.update_one(
            {"id": nudge_id, "driver_email": user["email"]},
            {"$set": {"ack": True, "acked_at": utcnow_iso()}},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Nudge not found")
        return {"ok": True}

    @router.get("/safety/stats")
    async def safety_stats(user: dict = Depends(current_user)):
        """Aggregate KPIs for broker dashboard widget."""
        since = (_utc() - timedelta(hours=24)).isoformat()
        events_24h = await db.cabin_events.count_documents({"occurred_at": {"$gte": since}})
        flagged = await db.cabin_events.count_documents({"status": "flagged_for_review"})
        actions_24h = await db.safety_actions.count_documents({"created_at": {"$gte": since}})
        rules_active = await db.safety_rules.count_documents({"enabled": True})
        by_type_cursor = db.cabin_events.aggregate([
            {"$match": {"occurred_at": {"$gte": since}}},
            {"$group": {"_id": "$event_type", "n": {"$sum": 1}, "avg_sev": {"$avg": "$severity"}}},
            {"$sort": {"n": -1}},
        ])
        by_type = []
        async for row in by_type_cursor:
            by_type.append({"event_type": row["_id"], "count": row["n"], "avg_severity": round(row.get("avg_sev", 0), 2)})
        return {
            "events_24h": events_24h,
            "flagged_for_review": flagged,
            "auto_actions_24h": actions_24h,
            "rules_active": rules_active,
            "by_type": by_type,
        }

    # -------- Background ambient simulator --------
    async def _ambient_simulator():
        if os.environ.get("DISABLE_CABIN_SIMULATOR") == "1":
            log.info("Cabin simulator disabled by env")
            return
        log.info("Cabin simulator started")
        # initial backoff
        await asyncio.sleep(20)
        while True:
            try:
                ev_type = random.choices(
                    EVENT_TYPES,
                    weights=[3, 5, 4, 3, 4, 2, 3, 2],  # distraction & lane_drift more common
                )[0]
                severity = random.choices([1, 2, 3, 4, 5], weights=[1, 4, 5, 3, 1])[0]
                req = CabinEventCreate(
                    event_type=ev_type,
                    severity=severity,
                    driver_email=DEMO_DRIVER_EMAIL,
                    driver_name="Marcus Reyes",
                    location={"lat": 33.4484, "lng": -112.0740, "city": "Phoenix", "state": "AZ"},
                    notes="Ambient simulator",
                )
                # craft an internal "user" context for the rule-engine
                fake_user = {"email": "system@jadeos.com", "role": "broker"}
                # mimic the ingest path (don't go via FastAPI dependency)
                ev = {
                    "id": str(uuid.uuid4()),
                    "event_type": req.event_type,
                    "label": EVENT_LABELS[req.event_type],
                    "severity": req.severity,
                    "driver_email": req.driver_email,
                    "driver_name": req.driver_name,
                    "location": req.location,
                    "speed_mph": req.speed_mph,
                    "notes": req.notes,
                    "thumb_url": "https://images.unsplash.com/photo-1601584115197-04ecc0da31ba?w=200&h=120&fit=crop",
                    "occurred_at": utcnow_iso(),
                    "status": "new",
                    "ingested_by": "simulator",
                }
                await db.cabin_events.insert_one(ev)
                await _evaluate_rules(ev)
                # cap collection size at 200 to keep demo light
                count = await db.cabin_events.count_documents({})
                if count > 200:
                    excess = count - 200
                    oldest = await db.cabin_events.find().sort("occurred_at", 1).limit(excess).to_list(length=excess)
                    for o in oldest:
                        await db.cabin_events.delete_one({"_id": o["_id"]})
            except Exception as e:  # noqa: BLE001
                log.warning("simulator tick failed: %s", e)
            await asyncio.sleep(random.randint(35, 55))

    asyncio.get_event_loop().create_task(_ambient_simulator())
    return router
