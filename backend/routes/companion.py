"""Real-time JADE companion: alerts, ambient prompts, workflow checklist.

Endpoints:
  POST /api/jade/converse           — turn-based conversation w/ profile+memory
  POST /api/jade/ambient            — draft a small-talk prompt when idle
  GET  /api/driver/alerts           — poll live alerts for current driver
  POST /api/driver/alerts           — broker/system posts alert
  PATCH /api/driver/alerts/{id}/ack — acknowledge
  GET  /api/driver/workflow         — checklist for the active load
  POST /api/driver/workflow/{id}/complete
  POST /api/driver/workflow/reset   — seed a fresh checklist

Background: an ambient simulator injects 1 mock weather/traffic alert every
180-300s to the demo driver so the UI has activity. Disable via
DISABLE_ALERT_SIMULATOR=1.
"""
from __future__ import annotations

import asyncio
import logging
import os
import random
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

log = logging.getLogger("jadeos.companion")

DEMO_DRIVER = "driver@jadeos.com"

WORKFLOW_TEMPLATE = [
    {"key": "pre_trip", "title": "Pre-trip vehicle inspection", "detail": "Tires · lights · brakes · fluids · load securement.", "action": "checkbox"},
    {"key": "arrive_shipper", "title": "Arrive at shipper", "detail": "Auto-detected via geofence — confirm dock.", "action": "checkbox"},
    {"key": "load_secured", "title": "Load secured & sealed", "detail": "Confirm seal # and weight ticket photo.", "action": "photo"},
    {"key": "bol_pickup", "title": "Scan pickup BOL", "detail": "Snap BOL — Jade extracts commodity + weight.", "action": "scan"},
    {"key": "hos_start", "title": "Start on-duty clock", "detail": "ELD status set to Driving.", "action": "checkbox"},
    {"key": "mid_check", "title": "Mid-haul check-in", "detail": "Ping broker with ETA + fuel level.", "action": "checkbox"},
    {"key": "fuel_scan", "title": "Fuel stop · scan receipt", "detail": "IFTA gallons captured automatically.", "action": "scan"},
    {"key": "arrive_consignee", "title": "Arrive at consignee", "detail": "Notify broker · detention timer armed.", "action": "checkbox"},
    {"key": "unload", "title": "Unload & signed BOL", "detail": "Get signed proof of delivery.", "action": "photo"},
    {"key": "close_load", "title": "Close the load", "detail": "Submit paperwork · JADE files it.", "action": "checkbox"},
]

ALERT_TEMPLATES = [
    {"kind": "weather", "severity": "warning", "title": "Thunderstorm cell inbound",
     "body": "Heavy rain + wind gusts to 45 mph within 30 miles ahead. Reduce speed and increase following distance."},
    {"kind": "weather", "severity": "warning", "title": "Ice risk overnight",
     "body": "Temps dropping to 28°F. Bridges may glaze. Plan to shut down by 22:00 if you can."},
    {"kind": "weather", "severity": "info", "title": "Clear skies ahead",
     "body": "No adverse weather for the next 200 miles — good window to log some steady miles."},
    {"kind": "traffic", "severity": "critical", "title": "Accident on I-40 EB",
     "body": "Multi-vehicle accident, 3 miles ahead. Two right lanes closed. Consider US-64 detour."},
    {"kind": "traffic", "severity": "warning", "title": "Construction slowdown",
     "body": "Lane merge in 12 miles adds ~18 min. JADE will re-route through I-17 if that saves time."},
    {"kind": "route", "severity": "info", "title": "Fuel is cheapest ahead",
     "body": "Love's #423 in 47 mi shows $3.79/gal — 22¢ below your fuel-card average. Consider topping off."},
    {"kind": "hos", "severity": "warning", "title": "Break window opening",
     "body": "You'll hit the 8-hour mandatory break window in 87 min. Cleanest stop ahead is a Pilot in 64 mi."},
]


class ConverseRequest(BaseModel):
    session_id: str
    message: str
    voice: bool = True
    current_location: Optional[dict] = None
    active_load: Optional[dict] = None


class AmbientPromptRequest(BaseModel):
    minutes_idle: int = 5
    current_location: Optional[dict] = None
    hobbies_hint: Optional[str] = ""


class AlertCreate(BaseModel):
    kind: str  # weather | traffic | route | hos | dispatch
    severity: str  # info | warning | critical
    title: str
    body: str
    driver_email: Optional[str] = None


class WorkflowComplete(BaseModel):
    notes: Optional[str] = ""


def make_router(db, current_user, utcnow_iso, emergent_llm_key: str, jade_system_prompt: str):
    router = APIRouter()

    # -------- Real-time conversation --------
    @router.post("/jade/converse")
    async def converse(req: ConverseRequest, user: dict = Depends(current_user)):
        """One conversation turn. Loads driver profile + memory into system prompt.
        Returns { reply, session_id }. TTS is generated client-side via /api/tts/speak
        (kept separate so voice is optional)."""
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore

            profile = await db.driver_profiles.find_one({"email": user["email"]}) or {}
            memories = await db.driver_memory.find({"driver_email": user["email"]}).sort("created_at", -1).limit(30).to_list(length=30)

            prof_lines = []
            for k in ("home_base", "dietary", "allergies", "medical_alerts", "family_status",
                     "faith_notes", "sleep_hours", "coffee_habit", "hobbies", "safety_notes"):
                v = profile.get(k)
                if v:
                    prof_lines.append(f"- {k.replace('_',' ')}: {v}")
            for m in memories:
                key = m.get("key")
                if key and key not in {"home_base", "dietary", "allergies", "medical_alerts",
                                       "family_status", "faith_notes", "sleep_hours",
                                       "coffee_habit", "hobbies", "safety_notes"}:
                    prof_lines.append(f"- {key}: {m.get('value')}")

            load_lines = []
            if req.active_load:
                for k, v in req.active_load.items():
                    if v:
                        load_lines.append(f"- {k}: {v}")

            loc = req.current_location or {}
            loc_line = ""
            if loc.get("city") or loc.get("state"):
                loc_line = f"\nCurrent location: {loc.get('city','')}, {loc.get('state','')}"

            companion_prompt = (
                jade_system_prompt
                + "\n\nMISSION LOCK: You are the driver's dedicated in-cab companion. Your job is to make "
                "this specific load a safe, comfortable, on-time delivery. Respect the driver's profile, "
                "diet, faith, family, health. Be warm and human. Keep replies short and spoken-friendly "
                "(2–4 sentences max unless asked for detail). Never dump long lists at them while driving. "
                "Use their first name. When they seem tired or stressed, suggest a break. When they ask a "
                "general knowledge question or want to chat about something unrelated to the load, engage "
                "kindly — a good copilot is also good company."
                + (f"\n\nDriver profile & memory:\n" + "\n".join(prof_lines) if prof_lines else "")
                + (f"\n\nActive load:\n" + "\n".join(load_lines) if load_lines else "")
                + loc_line
                + f"\n\nUser role: {user['role']}, name: {user.get('name','')}"
            )

            chat = LlmChat(
                api_key=emergent_llm_key,
                session_id=req.session_id,
                system_message=companion_prompt,
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")

            result = await chat.send_message(UserMessage(text=req.message))
            reply = result if isinstance(result, str) else (getattr(result, "text", None) or str(result))
            reply = (reply or "").strip()

            await db.jade_messages.insert_one({
                "id": str(uuid.uuid4()),
                "session_id": req.session_id,
                "user_id": user["id"],
                "role": "user",
                "text": req.message,
                "created_at": utcnow_iso(),
            })
            await db.jade_messages.insert_one({
                "id": str(uuid.uuid4()),
                "session_id": req.session_id,
                "user_id": user["id"],
                "role": "assistant",
                "text": reply,
                "created_at": utcnow_iso(),
            })

            return {"reply": reply, "session_id": req.session_id}
        except Exception as e:  # noqa: BLE001
            log.warning("converse failed: %s", e)
            first = (user.get("name") or "Driver").split()[0]
            return {"reply": f"{first}, I'm here. My voice link glitched for a sec — say that again?", "session_id": req.session_id}

    # -------- Ambient small-talk prompt --------
    @router.post("/jade/ambient")
    async def ambient_prompt(req: AmbientPromptRequest, user: dict = Depends(current_user)):
        """Return a friendly question or observation for the driver during idle time.
        Uses driver profile (hobbies, family, faith) so it feels personal."""
        profile = await db.driver_profiles.find_one({"email": user["email"]}) or {}
        first = (user.get("name") or "Driver").split()[0]
        hobbies = profile.get("hobbies", "") or req.hobbies_hint or ""
        family = profile.get("family_status", "")
        loc = req.current_location or {}
        loc_str = f"{loc.get('city','')}, {loc.get('state','')}".strip(", ")

        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
            system = (
                "You are JADE, an in-cab AI companion. Compose ONE short, warm conversational opener "
                "aimed at a truck driver who has been quiet for a while. Sound like a good copilot. "
                "Vary between: a curiosity question about their interests, a light story or fun fact "
                "tied to their location or hobbies, a family check-in, a road observation, or a friendly "
                "wellbeing nudge (hydration, stretch, music). One or two sentences max. No emojis. Use "
                "the driver's first name at most once. It will be spoken aloud."
            )
            ctx = (
                f"Driver first name: {first}\n"
                f"Hobbies: {hobbies or 'unknown'}\n"
                f"Family: {family or 'unknown'}\n"
                f"Current location: {loc_str or 'unknown'}\n"
                f"Minutes since last driver interaction: {req.minutes_idle}\n\n"
                "Compose the opener now."
            )
            chat = LlmChat(
                api_key=emergent_llm_key,
                session_id=f"ambient-{user['id']}-{utcnow_iso()}",
                system_message=system,
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")
            result = await chat.send_message(UserMessage(text=ctx))
            text = result if isinstance(result, str) else (getattr(result, "text", None) or str(result))
            return {"prompt": (text or "").strip().strip('"').strip("'")}
        except Exception as e:  # noqa: BLE001
            log.warning("ambient failed: %s", e)
            fallback = [
                f"{first}, hydration check — grab a sip if you can.",
                "How's the ride feeling? Cabin comfortable?",
                "Music, podcast, or just quiet miles right now?",
                "Any story from the road today you want to unload?",
            ]
            return {"prompt": random.choice(fallback)}

    # -------- Alerts --------
    @router.get("/driver/alerts")
    async def list_alerts(unack_only: bool = False, limit: int = 20, user: dict = Depends(current_user)):
        q = {"driver_email": user["email"]}
        if unack_only:
            q["ack"] = False
        docs = await db.driver_alerts.find(q).sort("created_at", -1).limit(min(limit, 100)).to_list(length=100)
        for d in docs:
            d.pop("_id", None)
        return docs

    @router.post("/driver/alerts")
    async def create_alert(payload: AlertCreate, user: dict = Depends(current_user)):
        target = (payload.driver_email or user["email"]).lower()
        doc = {
            "id": str(uuid.uuid4()),
            "driver_email": target,
            "kind": payload.kind,
            "severity": payload.severity,
            "title": payload.title,
            "body": payload.body,
            "ack": False,
            "created_by": user["email"],
            "created_at": utcnow_iso(),
        }
        await db.driver_alerts.insert_one(doc)
        return {k: v for k, v in doc.items() if k != "_id"}

    @router.patch("/driver/alerts/{alert_id}/ack")
    async def ack_alert(alert_id: str, user: dict = Depends(current_user)):
        r = await db.driver_alerts.update_one(
            {"id": alert_id, "driver_email": user["email"]},
            {"$set": {"ack": True, "acked_at": utcnow_iso()}},
        )
        if r.matched_count == 0:
            raise HTTPException(404, "Alert not found")
        return {"ok": True}

    # -------- Workflow --------
    async def _ensure_workflow(driver_email: str):
        """Seed workflow steps if none exist for this driver."""
        exists = await db.driver_workflow.count_documents({"driver_email": driver_email})
        if exists > 0:
            return
        docs = []
        for i, tpl in enumerate(WORKFLOW_TEMPLATE):
            docs.append({
                "id": str(uuid.uuid4()),
                "driver_email": driver_email,
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

    @router.get("/driver/workflow")
    async def get_workflow(user: dict = Depends(current_user)):
        await _ensure_workflow(user["email"])
        docs = await db.driver_workflow.find({"driver_email": user["email"]}).sort("order", 1).to_list(length=50)
        for d in docs:
            d.pop("_id", None)
        completed = sum(1 for d in docs if d["status"] == "completed")
        return {"steps": docs, "completed": completed, "total": len(docs), "percent": round(100 * completed / max(1, len(docs)))}

    @router.post("/driver/workflow/{step_id}/complete")
    async def complete_step(step_id: str, payload: WorkflowComplete, user: dict = Depends(current_user)):
        r = await db.driver_workflow.update_one(
            {"id": step_id, "driver_email": user["email"]},
            {"$set": {"status": "completed", "notes": payload.notes or "", "completed_at": utcnow_iso()}},
        )
        if r.matched_count == 0:
            raise HTTPException(404, "Step not found")
        return {"ok": True}

    @router.post("/driver/workflow/{step_id}/reopen")
    async def reopen_step(step_id: str, user: dict = Depends(current_user)):
        r = await db.driver_workflow.update_one(
            {"id": step_id, "driver_email": user["email"]},
            {"$set": {"status": "pending", "completed_at": None}},
        )
        if r.matched_count == 0:
            raise HTTPException(404, "Step not found")
        return {"ok": True}

    @router.post("/driver/workflow/reset")
    async def reset_workflow(user: dict = Depends(current_user)):
        await db.driver_workflow.delete_many({"driver_email": user["email"]})
        await _ensure_workflow(user["email"])
        return {"ok": True}

    # -------- Background alert simulator (DISABLED by default) --------
    # Previously fired a mock weather/traffic alert every 5-8 minutes for the
    # demo driver forever. Users found this intrusive — the whole point of
    # JADE alerts is that they surface REAL events, or events from an active
    # simulation run. Set ALERT_SIMULATOR=1 to re-enable for demos.
    async def _ambient_alerts():
        if os.environ.get("ALERT_SIMULATOR") != "1":
            log.info("Ambient alert simulator OFF (set ALERT_SIMULATOR=1 to enable)")
            return
        log.info("Ambient alert simulator ON")
        await asyncio.sleep(30)
        while True:
            try:
                tpl = random.choice(ALERT_TEMPLATES).copy()
                doc = {
                    "id": str(uuid.uuid4()),
                    "driver_email": DEMO_DRIVER,
                    "kind": tpl["kind"],
                    "severity": tpl["severity"],
                    "title": tpl["title"],
                    "body": tpl["body"],
                    "ack": False,
                    "created_by": "simulator",
                    "created_at": utcnow_iso(),
                }
                await db.driver_alerts.insert_one(doc)
                count = await db.driver_alerts.count_documents({"driver_email": DEMO_DRIVER})
                if count > 60:
                    excess = count - 60
                    old = await db.driver_alerts.find({"driver_email": DEMO_DRIVER}).sort("created_at", 1).limit(excess).to_list(length=excess)
                    for o in old:
                        await db.driver_alerts.delete_one({"_id": o["_id"]})
            except Exception as e:  # noqa: BLE001
                log.warning("alert sim tick failed: %s", e)
            await asyncio.sleep(random.randint(300, 480))

    try:
        asyncio.get_event_loop().create_task(_ambient_alerts())
    except Exception:  # noqa: BLE001
        pass

    return router
