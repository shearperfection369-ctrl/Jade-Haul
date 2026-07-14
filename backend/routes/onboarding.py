"""Onboarding + driver profile + persistent JADE memory + AI trip briefing.

Driver profile schema (mongo collection `driver_profiles`, keyed by email):
  - home_base, home_lat, home_lng
  - dietary (e.g., halal, kosher, vegan, keto, none)
  - allergies (free text)
  - medical_alerts (free text)
  - family_status (free text — e.g., "family with 2 kids, home Fri PM")
  - faith_notes (free text — e.g., "prays 5x")
  - sleep_hours, coffee_habit
  - hobbies (free text)
  - safety_notes (free text — JADE reads before every trip)
  - avatar_data_url (base64 head-crop snapshot captured during face enrollment)

Memory collection `driver_memory` stores { driver_email, key, value, created_at }.
Every JADE chat call automatically loads the top-30 most recent memories
in the system prompt.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

log = logging.getLogger("jadeos.onboarding")


class DriverProfile(BaseModel):
    home_base: Optional[str] = ""
    home_lat: Optional[float] = None
    home_lng: Optional[float] = None
    dietary: Optional[str] = ""
    allergies: Optional[str] = ""
    medical_alerts: Optional[str] = ""
    family_status: Optional[str] = ""
    faith_notes: Optional[str] = ""
    sleep_hours: Optional[float] = None
    coffee_habit: Optional[str] = ""
    hobbies: Optional[str] = ""
    safety_notes: Optional[str] = ""
    avatar_data_url: Optional[str] = ""  # base64 data-url
    callsign: Optional[str] = ""
    license: Optional[str] = ""


class OnboardingComplete(BaseModel):
    profile: DriverProfile
    # optional first-load setup — if present, a trip is created
    first_load: Optional[dict] = None  # {origin, dest, commodity, pickup_iso, notes, current_lat, current_lng}


class MemoryItem(BaseModel):
    key: str
    value: str


class TripBriefingRequest(BaseModel):
    origin: str
    destination: str
    origin_lat: Optional[float] = None
    origin_lng: Optional[float] = None
    dest_lat: Optional[float] = None
    dest_lng: Optional[float] = None
    commodity: Optional[str] = ""
    pickup_iso: Optional[str] = ""


def make_router(db, current_user, utcnow_iso, emergent_llm_key: str):
    router = APIRouter()

    # ---------- profile ----------
    @router.get("/driver/profile")
    async def get_profile(user: dict = Depends(current_user)):
        doc = await db.driver_profiles.find_one({"email": user["email"]})
        if doc:
            doc.pop("_id", None)
        return doc or {"email": user["email"]}

    @router.patch("/driver/profile")
    async def patch_profile(patch: DriverProfile, user: dict = Depends(current_user)):
        data = {k: v for k, v in patch.model_dump(exclude_none=True).items() if v != ""}
        data["email"] = user["email"]
        data["updated_at"] = utcnow_iso()
        await db.driver_profiles.update_one(
            {"email": user["email"]},
            {"$set": data, "$setOnInsert": {"created_at": utcnow_iso()}},
            upsert=True,
        )
        # Also sync avatar_data_url into the user record so it shows in header
        if data.get("avatar_data_url"):
            await db.users.update_one(
                {"email": user["email"]},
                {"$set": {"avatar": data["avatar_data_url"]}},
            )
        doc = await db.driver_profiles.find_one({"email": user["email"]})
        doc.pop("_id", None)
        return doc

    # ---------- memory ----------
    @router.get("/driver/memory")
    async def list_memory(user: dict = Depends(current_user)):
        docs = await db.driver_memory.find({"driver_email": user["email"]}).sort("created_at", -1).to_list(length=200)
        for d in docs:
            d.pop("_id", None)
        return docs

    @router.post("/driver/memory")
    async def add_memory(item: MemoryItem, user: dict = Depends(current_user)):
        doc = {
            "id": str(uuid.uuid4()),
            "driver_email": user["email"],
            "key": item.key.strip(),
            "value": item.value.strip(),
            "created_at": utcnow_iso(),
        }
        await db.driver_memory.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.delete("/driver/memory/{mem_id}")
    async def delete_memory(mem_id: str, user: dict = Depends(current_user)):
        r = await db.driver_memory.delete_one({"id": mem_id, "driver_email": user["email"]})
        return {"deleted": r.deleted_count}

    # ---------- onboarding submit ----------
    @router.post("/onboarding/complete")
    async def complete_onboarding(payload: OnboardingComplete, user: dict = Depends(current_user)):
        # Save profile via patch endpoint
        await patch_profile(payload.profile, user)  # type: ignore

        # Persist a compact summary as memory items JADE can recall.
        p = payload.profile
        mem_pairs = {
            "home_base": p.home_base,
            "dietary": p.dietary,
            "allergies": p.allergies,
            "medical_alerts": p.medical_alerts,
            "family_status": p.family_status,
            "faith_notes": p.faith_notes,
            "sleep_hours": str(p.sleep_hours) if p.sleep_hours is not None else "",
            "coffee_habit": p.coffee_habit,
            "hobbies": p.hobbies,
            "safety_notes": p.safety_notes,
        }
        for key, value in mem_pairs.items():
            if value:
                await db.driver_memory.update_one(
                    {"driver_email": user["email"], "key": key},
                    {"$set": {"value": value, "updated_at": utcnow_iso()},
                     "$setOnInsert": {
                         "id": str(uuid.uuid4()),
                         "driver_email": user["email"],
                         "key": key,
                         "created_at": utcnow_iso(),
                     }},
                    upsert=True,
                )

        trip_id = None
        if payload.first_load:
            fl = payload.first_load
            trip_id = str(uuid.uuid4())
            await db.trips.insert_one({
                "id": trip_id,
                "user_id": user["id"],
                "name": f"{fl.get('origin','?')} → {fl.get('dest','?')} · onboarding",
                "origin": fl.get("origin", ""),
                "destination": fl.get("dest", ""),
                "commodity": fl.get("commodity", ""),
                "planned_start": fl.get("pickup_iso", ""),
                "notes": fl.get("notes", ""),
                "status": "planned",
                "created_at": utcnow_iso(),
            })

        return {"ok": True, "trip_id": trip_id}

    # ---------- AI trip briefing ----------
    @router.post("/jade/trip-briefing")
    async def trip_briefing(req: TripBriefingRequest, user: dict = Depends(current_user)):
        profile = await db.driver_profiles.find_one({"email": user["email"]}) or {}
        profile.pop("_id", None)
        memories = await db.driver_memory.find({"driver_email": user["email"]}).sort("created_at", -1).limit(30).to_list(length=30)

        profile_lines = []
        for k in ("home_base", "dietary", "allergies", "medical_alerts", "family_status",
                 "faith_notes", "sleep_hours", "coffee_habit", "hobbies", "safety_notes"):
            v = profile.get(k)
            if v:
                profile_lines.append(f"- {k.replace('_',' ')}: {v}")
        mem_lines = [f"- {m.get('key')}: {m.get('value')}" for m in memories if m.get("key") not in [ln.split(":",1)[0].strip("- ") for ln in profile_lines]]

        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore

            system = (
                "You are JADE, the personal in-cab AI copilot for a professional truck driver. "
                "Compose a personalized pre-trip briefing. Use the driver's profile + memory to "
                "make recommendations that respect their diet, faith, family, health, and safety needs. "
                "Return a compact briefing with sections:\n"
                "1) Route summary (miles est., drive time est.)\n"
                "2) Recommended stops (fuel, food that matches diet, rest breaks aligned with sleep habit)\n"
                "3) Personal wellbeing reminders (medical, faith, family)\n"
                "4) Safety focus (based on safety_notes and typical hazards)\n"
                "5) A short JADE greeting spoken directly to the driver by first name (1 sentence).\n"
                "Keep it under 260 words. Use markdown headings for each section. No preamble."
            )
            first = (user.get("name") or "Driver").split()[0]
            ctx = (
                f"Driver first name: {first}\n"
                f"Origin: {req.origin} ({req.origin_lat},{req.origin_lng})\n"
                f"Destination: {req.destination} ({req.dest_lat},{req.dest_lng})\n"
                f"Commodity: {req.commodity or 'unspecified'}\n"
                f"Pickup: {req.pickup_iso or 'unspecified'}\n\n"
                + ("Profile:\n" + "\n".join(profile_lines) + "\n\n" if profile_lines else "")
                + ("Memory:\n" + "\n".join(mem_lines) if mem_lines else "")
            )

            chat = LlmChat(
                api_key=emergent_llm_key,
                session_id=f"briefing-{user['id']}-{utcnow_iso()}",
                system_message=system,
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")
            result = await chat.send_message(UserMessage(text=ctx))
            text = result if isinstance(result, str) else (getattr(result, "text", None) or str(result))
            return {"briefing": (text or "").strip(), "profile_used": bool(profile_lines), "memories_used": len(mem_lines)}
        except Exception as e:  # noqa: BLE001
            log.warning("briefing failed: %s", e)
            first = (user.get("name") or "Driver").split()[0]
            fallback = (
                f"## Route summary\n{req.origin} → {req.destination}. Plan for a safe, steady haul.\n\n"
                f"## Recommended stops\nFuel & rest at approximately 4-hour intervals. Prefer well-lit truck stops.\n\n"
                f"## Personal wellbeing\nHydrate. Stretch every stop. Check in with home once en-route.\n\n"
                f"## Safety focus\nWatch weather, brake early, keep 7-second following distance under load.\n\n"
                f"## JADE\nWelcome aboard, {first}. Let's get this haul dialed."
            )
            return {"briefing": fallback, "profile_used": False, "memories_used": 0, "fallback": True}

    return router
