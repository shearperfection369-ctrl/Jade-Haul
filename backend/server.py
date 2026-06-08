"""JadeOS backend — Trucker assistance + Broker AI OS.

Provides:
  - JWT auth (driver + broker demo accounts)
  - Driver: HOS, loads, detention timer, weigh stations, safety scorecard,
            fuel/maintenance, messages
  - Broker: dashboard KPIs, carrier risk scoring, quote optimizer,
            exception queue, shipper visibility
  - AI: Claude Sonnet 4.5 chat for JADE assistant
  - Bill / BOL scanner (vision via emergentintegrations)
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Optional

import jwt
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("jadeos")

# ---------------------------------------------------------------------------
# Mongo
# ---------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


# ---------------------------------------------------------------------------
# Helpers / models
# ---------------------------------------------------------------------------
def _to_str(v: Any) -> str:
    return str(v) if isinstance(v, ObjectId) else v


PyObjectId = Annotated[str, BeforeValidator(_to_str)]


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
JWT_SECRET = os.environ.get("JWT_SECRET", "jadeos-dev")
JWT_ALG = "HS256"
JWT_TTL_HOURS = 24 * 7

# Hard-coded demo accounts (single login per role per problem statement)
DEMO_USERS = {
    "driver@jadeos.com": {
        "id": "driver-demo-001",
        "password": "jade123",
        "role": "driver",
        "name": "Marcus Reyes",
        "callsign": "RIG-77",
        "license": "TX-CDL-4429183",
        "rating": 4.92,
        "avatar": "https://images.unsplash.com/photo-1626565244872-206f4c1f9e57?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MDV8MHwxfHNlYXJjaHwyfHxwcm9mZXNzaW9uYWwlMjBkcml2ZXIlMjBwb3J0cmFpdHxlbnwwfHx8fDE3ODA5NTk1NzV8MA&ixlib=rb-4.1.0&q=85",
    },
    "broker@jadeos.com": {
        "id": "broker-demo-001",
        "password": "jade123",
        "role": "broker",
        "name": "Aria Chen",
        "callsign": "DESK-12",
        "license": "MC-885472",
        "rating": 4.88,
        "avatar": "https://images.unsplash.com/photo-1626565244872-206f4c1f9e57?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MDV8MHwxfHNlYXJjaHwyfHxwcm9mZXNzaW9uYWwlMjBkcml2ZXIlMjBwb3J0cmFpdHxlbnwwfHx8fDE3ODA5NTk1NzV8MA&ixlib=rb-4.1.0&q=85",
    },
}


def make_token(user_email: str, role: str) -> str:
    payload = {
        "sub": user_email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


bearer_scheme = HTTPBearer(auto_error=False)


async def current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        decoded = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc
    email = decoded.get("sub")
    if email not in DEMO_USERS:
        raise HTTPException(status_code=401, detail="Unknown user")
    user = DEMO_USERS[email].copy()
    user["email"] = email
    return user


# ---------------------------------------------------------------------------
# Pydantic request/response schemas
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: str
    password: str


class DetentionStartRequest(BaseModel):
    shipper_name: str
    location: str
    load_id: Optional[str] = None
    notes: Optional[str] = ""


class DetentionStopRequest(BaseModel):
    entry_id: str


class JadeChatRequest(BaseModel):
    session_id: str
    message: str
    context: Optional[dict] = None


class BillScanRequest(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"


class QuoteOptimizeRequest(BaseModel):
    origin: str
    destination: str
    miles: float
    weight_lbs: float
    equipment: str
    pickup_date: str
    hazmat: bool = False


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app = FastAPI(title="JadeOS API", version="1.0.0")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"service": "JadeOS", "status": "online", "time": utcnow_iso()}


# ---------------- Auth ----------------
@api.post("/auth/login")
async def login(req: LoginRequest):
    user = DEMO_USERS.get(req.email.lower().strip())
    if not user or user["password"] != req.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_token(req.email.lower().strip(), user["role"])
    safe = {k: v for k, v in user.items() if k != "password"}
    safe["email"] = req.email.lower().strip()
    return {"token": token, "user": safe}


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return {k: v for k, v in user.items() if k != "password"}


# ---------------- Driver: HOS ----------------
@api.get("/driver/hos")
async def driver_hos(user: dict = Depends(current_user)):
    """Hours-of-service status. Demo math (mocked but plausible)."""
    drive_hr = 6.4
    on_duty_hr = 8.2
    cycle_hr = 47.5
    return {
        "drive_remaining_hr": round(11 - drive_hr, 2),
        "on_duty_remaining_hr": round(14 - on_duty_hr, 2),
        "cycle_remaining_hr": round(70 - cycle_hr, 2),
        "current_status": "DRIVING",
        "shift_start": (datetime.now(timezone.utc) - timedelta(hours=on_duty_hr)).isoformat(),
        "next_break_in_min": 87,
        "compliance": "GREEN",
        "log_events": [
            {"t": (datetime.now(timezone.utc) - timedelta(hours=8)).isoformat(), "status": "OFF_DUTY"},
            {"t": (datetime.now(timezone.utc) - timedelta(hours=8) + timedelta(minutes=20)).isoformat(), "status": "ON_DUTY"},
            {"t": (datetime.now(timezone.utc) - timedelta(hours=7)).isoformat(), "status": "DRIVING"},
            {"t": (datetime.now(timezone.utc) - timedelta(hours=4, minutes=15)).isoformat(), "status": "OFF_DUTY"},
            {"t": (datetime.now(timezone.utc) - timedelta(hours=3, minutes=45)).isoformat(), "status": "DRIVING"},
        ],
    }


# ---------------- Driver: Current load + route ----------------
@api.get("/driver/active_load")
async def active_load(user: dict = Depends(current_user)):
    return {
        "load_id": "JL-2026-00917",
        "broker": "Atlas Freight Co.",
        "broker_rating": 4.7,
        "origin": {"name": "Dallas, TX", "lat": 32.7767, "lng": -96.7970},
        "destination": {"name": "Phoenix, AZ", "lat": 33.4484, "lng": -112.0740},
        "stops": [
            {"name": "Abilene Truck Plaza", "lat": 32.4487, "lng": -99.7331, "type": "fuel"},
            {"name": "Lordsburg Rest", "lat": 32.3506, "lng": -108.7087, "type": "rest"},
        ],
        "miles_total": 1067,
        "miles_remaining": 612,
        "eta": (datetime.now(timezone.utc) + timedelta(hours=11, minutes=22)).isoformat(),
        "commodity": "Refrigerated produce",
        "weight_lbs": 38400,
        "rate_usd": 2685.50,
        "rate_per_mile": 2.52,
        "hazmat": False,
        "temperature_f": 36,
    }


# ---------------- Loads (load board) ----------------
@api.get("/loads")
async def loads(user: dict = Depends(current_user)):
    return [
        {"id": "LD-44210", "origin": "Phoenix, AZ", "destination": "Los Angeles, CA",
         "miles": 372, "rate": 1180, "broker": "Sunbelt Logistics", "broker_rating": 4.8,
         "equipment": "Reefer", "pickup": "Feb 11, 06:00", "weight": 39500, "rpm": 3.17},
        {"id": "LD-44213", "origin": "Phoenix, AZ", "destination": "Denver, CO",
         "miles": 862, "rate": 2240, "broker": "Atlas Freight Co.", "broker_rating": 4.7,
         "equipment": "Dry Van", "pickup": "Feb 11, 14:00", "weight": 41200, "rpm": 2.60},
        {"id": "LD-44219", "origin": "Tucson, AZ", "destination": "Houston, TX",
         "miles": 1166, "rate": 3050, "broker": "Crossroads TMS", "broker_rating": 4.4,
         "equipment": "Flatbed", "pickup": "Feb 12, 08:00", "weight": 44000, "rpm": 2.62},
        {"id": "LD-44222", "origin": "Phoenix, AZ", "destination": "Seattle, WA",
         "miles": 1432, "rate": 3950, "broker": "Pacific Bridge", "broker_rating": 4.9,
         "equipment": "Reefer", "pickup": "Feb 12, 19:00", "weight": 40800, "rpm": 2.76},
    ]


# ---------------- Detention timer ----------------
@api.post("/detention/start")
async def detention_start(req: DetentionStartRequest, user: dict = Depends(current_user)):
    entry = {
        "id": str(uuid.uuid4()),
        "driver_id": user["id"],
        "shipper_name": req.shipper_name,
        "location": req.location,
        "load_id": req.load_id,
        "notes": req.notes or "",
        "start_at": utcnow_iso(),
        "end_at": None,
        "duration_minutes": None,
        "billable": False,
    }
    await db.detention_entries.insert_one(entry.copy())
    entry.pop("_id", None)
    return entry


@api.post("/detention/stop")
async def detention_stop(req: DetentionStopRequest, user: dict = Depends(current_user)):
    doc = await db.detention_entries.find_one({"id": req.entry_id, "driver_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Entry not found")
    if doc.get("end_at"):
        raise HTTPException(status_code=400, detail="Entry already stopped")
    start_at = datetime.fromisoformat(doc["start_at"])
    end_at = datetime.now(timezone.utc)
    duration_minutes = round((end_at - start_at).total_seconds() / 60, 2)
    billable = duration_minutes > 120  # standard 2-hour free time
    await db.detention_entries.update_one(
        {"id": req.entry_id},
        {"$set": {"end_at": end_at.isoformat(), "duration_minutes": duration_minutes, "billable": billable}},
    )
    doc.update({"end_at": end_at.isoformat(), "duration_minutes": duration_minutes, "billable": billable})
    doc.pop("_id", None)
    return doc


@api.get("/detention/list")
async def detention_list(user: dict = Depends(current_user)):
    cursor = db.detention_entries.find({"driver_id": user["id"]}, {"_id": 0}).sort("start_at", -1)
    items = await cursor.to_list(200)
    return items


# ---------------- Weigh stations / Drivewyze bypass ----------------
@api.get("/weigh-stations")
async def weigh_stations(user: dict = Depends(current_user)):
    return [
        {"id": "WS-101", "name": "Glendale Scale (I-10 W)", "miles_ahead": 14,
         "status": "BYPASS", "score": 98, "lane": "Right", "weight_threshold": 80000},
        {"id": "WS-102", "name": "Tonopah Truck Inspection", "miles_ahead": 62,
         "status": "BYPASS", "score": 96, "lane": "Right", "weight_threshold": 80000},
        {"id": "WS-103", "name": "Quartzsite Port of Entry", "miles_ahead": 138,
         "status": "PULL_IN", "score": 41, "lane": "All", "weight_threshold": 80000,
         "reason": "Random inspection — DOT pulse"},
        {"id": "WS-104", "name": "Yuma West Scale", "miles_ahead": 211,
         "status": "BYPASS", "score": 99, "lane": "Right", "weight_threshold": 80000},
    ]


# ---------------- Safety scorecard ----------------
@api.get("/safety/scorecard")
async def safety_scorecard(user: dict = Depends(current_user)):
    return {
        "overall": 92,
        "categories": {
            "harsh_braking": 95,
            "smooth_acceleration": 88,
            "lane_discipline": 96,
            "speed_compliance": 91,
            "following_distance": 90,
            "fatigue_signals": 93,
        },
        "trend_7d": [86, 88, 87, 90, 91, 92, 92],
        "rank": 4,
        "fleet_size": 142,
        "incidents_30d": 0,
        "rewards_balance_usd": 312.40,
    }


# ---------------- Fuel + Maintenance ----------------
@api.get("/fleet/health")
async def fleet_health(user: dict = Depends(current_user)):
    return {
        "fuel_pct": 64,
        "mpg_7d": 7.2,
        "idle_hours_7d": 3.4,
        "next_service_in_miles": 2120,
        "alerts": [
            {"id": "A1", "severity": "AMBER", "title": "Tire pressure low — drive axle L",
             "detail": "Drop of 6 PSI in last 12 hours. Inspect at next stop.", "eta_action": "Next fuel stop"},
            {"id": "A2", "severity": "GREEN", "title": "DEF 78% — sufficient", "detail": "Refill not required.", "eta_action": "Skip"},
            {"id": "A3", "severity": "RED", "title": "Predicted brake pad replacement", "detail": "ML model: failure window in ~1,800 mi.", "eta_action": "Schedule shop"},
        ],
    }


# ---------------- Messages ----------------
@api.get("/messages")
async def messages_list(user: dict = Depends(current_user)):
    return [
        {"id": "m1", "from": "Dispatch · Aria", "ts": (datetime.now(timezone.utc) - timedelta(minutes=14)).isoformat(),
         "body": "Update on LD-2026-00917: receiver added a 30-min early window. Push hard on the Lordsburg leg?"},
        {"id": "m2", "from": "Atlas Freight (Broker)", "ts": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
         "body": "Detention pre-approved up to 3 hrs at the Phoenix DC. Submit timestamps via app."},
        {"id": "m3", "from": "JADE (AI)", "ts": (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat(),
         "body": "You're 87 min from your 30-min federal break window. Best truck stop ahead: Love's #423 in 64 mi."},
    ]


# ---------------- Broker side ----------------
@api.get("/broker/dashboard")
async def broker_dashboard(user: dict = Depends(current_user)):
    return {
        "loads_today": 47,
        "active_quotes": 12,
        "revenue_mtd_usd": 1842380,
        "avg_margin_pct": 18.6,
        "exception_count": 3,
        "on_time_pct": 94.2,
        "carriers_at_risk": 2,
        "shippers_at_risk": 1,
        "top_lanes": [
            {"lane": "DAL → PHX", "volume": 38, "avg_rpm": 2.51, "margin_pct": 21.0},
            {"lane": "PHX → LAX", "volume": 29, "avg_rpm": 3.18, "margin_pct": 17.8},
            {"lane": "HOU → ATL", "volume": 22, "avg_rpm": 2.40, "margin_pct": 19.3},
            {"lane": "CHI → DEN", "volume": 18, "avg_rpm": 2.62, "margin_pct": 22.1},
        ],
        "revenue_trend_14d": [124, 132, 119, 141, 148, 155, 162, 158, 167, 174, 169, 181, 188, 196],
    }


@api.get("/broker/carriers")
async def broker_carriers(user: dict = Depends(current_user)):
    return [
        {"id": "C-001", "name": "Reyes Trucking LLC", "lanes": 14, "on_time_pct": 97.4,
         "risk": "LOW", "risk_score": 12, "rate_compliance": 99.1, "dispatcher": "Aria"},
        {"id": "C-002", "name": "Crossroads Express", "lanes": 9, "on_time_pct": 88.1,
         "risk": "MEDIUM", "risk_score": 38, "rate_compliance": 92.0, "dispatcher": "Marco"},
        {"id": "C-003", "name": "Vanguard Hauling", "lanes": 22, "on_time_pct": 95.6,
         "risk": "LOW", "risk_score": 18, "rate_compliance": 97.8, "dispatcher": "Aria"},
        {"id": "C-004", "name": "Sunrise Freight Group", "lanes": 6, "on_time_pct": 79.0,
         "risk": "HIGH", "risk_score": 71, "rate_compliance": 84.6, "dispatcher": "Devin"},
        {"id": "C-005", "name": "Pacific Bridge Carriers", "lanes": 31, "on_time_pct": 98.2,
         "risk": "LOW", "risk_score": 8, "rate_compliance": 99.4, "dispatcher": "Aria"},
    ]


@api.get("/broker/exceptions")
async def broker_exceptions(user: dict = Depends(current_user)):
    return [
        {"id": "EX-9011", "load_id": "JL-2026-00903", "type": "HOS_RISK",
         "severity": "HIGH", "carrier": "Sunrise Freight Group",
         "detail": "Driver ETA pushes through cycle reset window.", "ai_suggestion": "Reassign to Vanguard Hauling (capacity confirmed, +$120 margin impact)."},
        {"id": "EX-9015", "load_id": "JL-2026-00911", "type": "OVERWEIGHT",
         "severity": "MEDIUM", "carrier": "Crossroads Express",
         "detail": "Load weighs 1,200 lbs over equipment rating.", "ai_suggestion": "Split SKU 4421 to next-day pickup."},
        {"id": "EX-9018", "load_id": "JL-2026-00917", "type": "HAZMAT_PERMIT",
         "severity": "LOW", "carrier": "Reyes Trucking LLC",
         "detail": "AZ hazmat endorsement renewal needed in 14d.", "ai_suggestion": "Auto-email reminder to driver + ops."},
    ]


@api.post("/broker/quote/optimize")
async def quote_optimize(req: QuoteOptimizeRequest, user: dict = Depends(current_user)):
    """AI-light quote optimizer. Combines lane history, fuel index, and capacity."""
    base_rpm = 2.45
    fuel_adjust = 0.18
    hazmat_premium = 0.40 if req.hazmat else 0.0
    capacity_factor = 0.12  # tight market lift
    suggested_rpm = round(base_rpm + fuel_adjust + hazmat_premium + capacity_factor, 2)
    suggested_rate = round(suggested_rpm * req.miles, 2)
    floor_rate = round(suggested_rate * 0.93, 2)
    target_margin_pct = 19.4 if not req.hazmat else 23.1
    win_probability = 0.78 if not req.hazmat else 0.66
    return {
        "lane": f"{req.origin} → {req.destination}",
        "miles": req.miles,
        "suggested_rpm": suggested_rpm,
        "suggested_rate_usd": suggested_rate,
        "floor_rate_usd": floor_rate,
        "target_margin_pct": target_margin_pct,
        "win_probability": win_probability,
        "best_carriers": [
            {"name": "Pacific Bridge Carriers", "score": 92, "available_now": True},
            {"name": "Reyes Trucking LLC", "score": 88, "available_now": True},
            {"name": "Vanguard Hauling", "score": 84, "available_now": False},
        ],
        "rationale": [
            f"Lane history: 38 closed loads, avg RPM {base_rpm}",
            f"Fuel index +${fuel_adjust} over baseline",
            "Capacity tight — premium of $0.12/mi recommended",
        ] + (["Hazmat permit premium applied"] if req.hazmat else []),
    }


# ---------------- Shipper visibility (broker) ----------------
@api.get("/broker/shipments")
async def broker_shipments(user: dict = Depends(current_user)):
    return [
        {"id": "JL-2026-00917", "shipper": "FreshHarvest Foods", "status": "IN_TRANSIT",
         "eta": (datetime.now(timezone.utc) + timedelta(hours=11, minutes=22)).isoformat(),
         "carrier": "Reyes Trucking LLC", "lane": "DAL → PHX", "progress_pct": 42},
        {"id": "JL-2026-00911", "shipper": "Northwood Building Co.", "status": "LOADING",
         "eta": (datetime.now(timezone.utc) + timedelta(hours=22)).isoformat(),
         "carrier": "Crossroads Express", "lane": "HOU → ATL", "progress_pct": 6},
        {"id": "JL-2026-00908", "shipper": "BlueOcean Seafood", "status": "DELIVERED",
         "eta": (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat(),
         "carrier": "Pacific Bridge Carriers", "lane": "SEA → LAX", "progress_pct": 100},
    ]


# ---------------------------------------------------------------------------
# JADE AI — Claude Sonnet 4.5
# ---------------------------------------------------------------------------
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

JADE_SYSTEM_PROMPT = """You are JADE — a high-end AI co-pilot built into JadeOS, a premium operating
system for commercial truck drivers and freight brokers.

Voice: confident, warm, technically precise. Short sentences. Speak like a calm flight-deck officer
with an encyclopedic knowledge of trucking, freight, HOS regulations, weather, traffic, and routing.

You can help with:
- Hours-of-Service (HOS) compliance: when to take 30-min breaks, 10-hour resets, 70-hour cycle.
- Suggesting where to fuel, eat, sleep, or park (mention real truck-stop chains: Love's, Pilot,
  Flying J, TA, Petro, Wilco, AmBest).
- Route planning, weather, weigh-station bypass intelligence (Drivewyze-style).
- Reading the driver their current load, ETA, detention timer, safety score.
- For broker users: quote optimization, carrier risk scoring, exception handling.

Style:
- Never longer than 4 short sentences unless the user asks for detail.
- If the user asks something safety-critical (fatigue, weather, mechanical), be direct and prioritize
  the driver's safety over schedule.
- Use the driver/broker's first name when context provides it.
- Never invent compliance numbers — if you don't have data, ask for it.
"""


@api.post("/jade/chat")
async def jade_chat(req: JadeChatRequest, user: dict = Depends(current_user)):
    """Non-streaming chat (simple JSON reply) — frontend will TTS it via WebSpeech."""
    try:
        # Local import to keep server boot resilient if lib missing.
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore

        ctx_lines = []
        if req.context:
            for k, v in req.context.items():
                ctx_lines.append(f"- {k}: {v}")
        ctx_block = ("\n\nDriver/Broker context:\n" + "\n".join(ctx_lines)) if ctx_lines else ""

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=req.session_id,
            system_message=JADE_SYSTEM_PROMPT + f"\n\nUser role: {user['role']}, name: {user['name']}" + ctx_block,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        reply_text = ""
        # send_message is acceptable here (single short reply, low latency expected)
        result = await chat.send_message(UserMessage(text=req.message))
        if isinstance(result, str):
            reply_text = result
        else:
            # Object-style response — try common attrs
            reply_text = getattr(result, "text", None) or getattr(result, "content", None) or str(result)

        # persist
        await db.jade_messages.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": req.session_id,
            "user_id": user["id"],
            "role": "user",
            "text": req.message,
            "ts": utcnow_iso(),
        })
        await db.jade_messages.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": req.session_id,
            "user_id": user["id"],
            "role": "assistant",
            "text": reply_text,
            "ts": utcnow_iso(),
        })

        return {"reply": reply_text, "session_id": req.session_id}
    except Exception as exc:  # noqa: BLE001
        logger.exception("jade_chat failure")
        # Graceful fallback so the demo never appears dead.
        return {
            "reply": f"(JADE offline — fallback) I heard you. Based on standard HOS rules, take your 30-minute break within the next 90 minutes. ({type(exc).__name__})",
            "session_id": req.session_id,
        }


@api.get("/jade/history/{session_id}")
async def jade_history(session_id: str, user: dict = Depends(current_user)):
    cursor = db.jade_messages.find(
        {"session_id": session_id, "user_id": user["id"]}, {"_id": 0}
    ).sort("ts", 1)
    return await cursor.to_list(500)


# ---------------------------------------------------------------------------
# Bill / BOL scanner via Vision
# ---------------------------------------------------------------------------
@api.post("/bill/scan")
async def bill_scan(req: BillScanRequest, user: dict = Depends(current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent  # type: ignore

        prompt = (
            "You are reading a freight bill of lading / broker invoice. "
            "Extract these fields as JSON (and JSON only — no commentary): "
            "broker_name, carrier_name, bol_number, pickup_date, delivery_date, "
            "origin, destination, commodity, weight_lbs, pieces, total_amount_usd, "
            "line_items (array of {description, qty, amount}). "
            "If a field is unreadable, set it to null."
        )

        # strip any data:image/...;base64, prefix the frontend may include
        clean_b64 = req.image_base64.split(",")[-1] if "," in req.image_base64 else req.image_base64

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"bill-{uuid.uuid4()}",
            system_message="You are a precise document-OCR engine for freight invoices.",
        ).with_model("openai", "gpt-4o")

        result = await chat.send_message(
            UserMessage(text=prompt, file_contents=[ImageContent(image_base64=clean_b64)])
        )
        raw = result if isinstance(result, str) else (getattr(result, "text", None) or str(result))

        # Best-effort JSON extraction
        import json
        import re
        match = re.search(r"\{.*\}", raw, flags=re.S)
        parsed = None
        if match:
            try:
                parsed = json.loads(match.group(0))
            except Exception:
                parsed = None

        record = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "ts": utcnow_iso(),
            "raw_response": raw,
            "parsed": parsed,
        }
        await db.bill_scans.insert_one(record.copy())
        record.pop("_id", None)
        return record
    except Exception as exc:  # noqa: BLE001
        logger.exception("bill_scan failure")
        # Demo-safe fallback
        return {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "ts": utcnow_iso(),
            "error": str(exc),
            "parsed": {
                "broker_name": "Atlas Freight Co.",
                "carrier_name": "Reyes Trucking LLC",
                "bol_number": "BOL-44210-X",
                "pickup_date": "2026-02-09",
                "delivery_date": "2026-02-11",
                "origin": "Dallas, TX",
                "destination": "Phoenix, AZ",
                "commodity": "Refrigerated produce",
                "weight_lbs": 38400,
                "pieces": 24,
                "total_amount_usd": 2685.50,
                "line_items": [
                    {"description": "Linehaul", "qty": 1, "amount": 2400.00},
                    {"description": "Fuel surcharge", "qty": 1, "amount": 235.50},
                    {"description": "Detention (1 hr)", "qty": 1, "amount": 50.00},
                ],
            },
            "note": "Vision unavailable — returned simulated parse so demo continues.",
        }


# ---------------------------------------------------------------------------
# Mount + CORS
# ---------------------------------------------------------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def _shutdown():
    client.close()
