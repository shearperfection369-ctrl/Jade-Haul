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

import bcrypt
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


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


async def _lookup_user(email: str) -> Optional[dict]:
    """Resolve a user from demo set or Mongo `users` collection."""
    email = email.lower().strip()
    if email in DEMO_USERS:
        u = DEMO_USERS[email].copy()
        u["email"] = email
        return u
    doc = await db.users.find_one({"email": email})
    if doc is None:
        return None
    return {
        "id": str(doc["_id"]),
        "email": doc["email"],
        "name": doc.get("name", ""),
        "role": doc.get("role", "driver"),
        "callsign": doc.get("callsign", ""),
        "license": doc.get("license", ""),
        "rating": doc.get("rating", 5.0),
        "avatar": doc.get("avatar", ""),
        "password_hash": doc.get("password_hash"),
    }


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
    user = await _lookup_user(email) if email else None
    if user is None:
        raise HTTPException(status_code=401, detail="Unknown user")
    user.pop("password", None)
    user.pop("password_hash", None)
    return user


# ---------------------------------------------------------------------------
# Pydantic request/response schemas
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str  # "driver" | "broker"
    callsign: Optional[str] = ""
    license: Optional[str] = ""


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
    current_location: Optional[dict] = None  # {lat, lng, city?, state?}


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
    email = req.email.lower().strip()
    # Demo accounts: plain comparison kept for back-compat
    if email in DEMO_USERS:
        u = DEMO_USERS[email]
        if u["password"] != req.password:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = make_token(email, u["role"])
        safe = {k: v for k, v in u.items() if k != "password"}
        safe["email"] = email
        return {"token": token, "user": safe}
    # DB-backed users (created via /auth/signup)
    doc = await db.users.find_one({"email": email})
    if not doc or not verify_password(req.password, doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_token(email, doc.get("role", "driver"))
    safe = {
        "id": str(doc["_id"]),
        "email": email,
        "name": doc.get("name", ""),
        "role": doc.get("role", "driver"),
        "callsign": doc.get("callsign", ""),
        "license": doc.get("license", ""),
        "rating": doc.get("rating", 5.0),
        "avatar": doc.get("avatar", ""),
    }
    return {"token": token, "user": safe}


@api.post("/auth/signup")
async def signup(req: SignupRequest):
    email = req.email.lower().strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if req.role not in ("driver", "broker"):
        raise HTTPException(status_code=400, detail="role must be 'driver' or 'broker'")
    if email in DEMO_USERS or await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(req.password),
        "name": req.name.strip() or email.split("@")[0],
        "role": req.role,
        "callsign": (req.callsign or "").strip(),
        "license": (req.license or "").strip(),
        "rating": 5.0,
        "avatar": "",
        "created_at": utcnow_iso(),
    }
    result = await db.users.insert_one(doc)
    token = make_token(email, req.role)
    safe = {
        "id": str(result.inserted_id),
        "email": email,
        "name": doc["name"],
        "role": doc["role"],
        "callsign": doc["callsign"],
        "license": doc["license"],
        "rating": 5.0,
        "avatar": "",
    }
    return {"token": token, "user": safe}


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return {k: v for k, v in user.items() if k not in ("password", "password_hash")}


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
    """Non-streaming chat. Location-aware: detects mechanic/fuel/shipper/rest/food
    queries and injects nearby POIs (with hours, phone, distance) into the prompt."""
    try:
        # Local import to keep server boot resilient if lib missing.
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
        from data.pois import POIS, detect_categories
        from math import asin, cos, radians, sin, sqrt

        ctx_lines = []
        if req.context:
            for k, v in req.context.items():
                ctx_lines.append(f"- {k}: {v}")
        ctx_block = ("\n\nDriver/Broker context:\n" + "\n".join(ctx_lines)) if ctx_lines else ""

        # ---- Location-aware POI injection ----
        loc_block = ""
        loc = req.current_location or {}
        visual_payload = None
        if loc.get("lat") is not None and loc.get("lng") is not None:
            lat0, lng0 = float(loc["lat"]), float(loc["lng"])
            ctx_lines.append(f"- current_lat: {lat0:.4f}")
            ctx_lines.append(f"- current_lng: {lng0:.4f}")
            if loc.get("city"): ctx_lines.append(f"- current_city: {loc['city']}")
            if loc.get("state"): ctx_lines.append(f"- current_state: {loc['state']}")

            categories = detect_categories(req.message)
            if not categories:
                categories = ["mechanic", "fuel", "rest"]

            def _hav(a_lat, a_lng, b_lat, b_lng):
                R = 3958.8
                dlat = radians(b_lat - a_lat)
                dlng = radians(b_lng - a_lng)
                s = sin(dlat / 2) ** 2 + cos(radians(a_lat)) * cos(radians(b_lat)) * sin(dlng / 2) ** 2
                return 2 * R * asin(sqrt(s))

            scored = [(p, _hav(lat0, lng0, p["lat"], p["lng"])) for p in POIS if p["category"] in categories]
            scored.sort(key=lambda x: x[1])
            top = scored[:6]
            if top:
                lines = []
                for p, d in top:
                    lines.append(
                        f"- {p['name']} ({p['category']}) · {d:.0f} mi · {p['city']}, {p['state']} · "
                        f"Hours: {p['hours']} · Phone: {p['phone'] or 'n/a'} · "
                        f"Services: {', '.join(p['services'][:4])} · Notes: {p['notes']}"
                    )
                loc_block = (
                    f"\n\nNearby locations (relative to driver's current GPS — categories detected: {', '.join(categories)}):\n"
                    + "\n".join(lines)
                    + "\n\nWhen the driver asks about a place, USE these specific records — quote name, distance, hours, and phone. Do not invent places."
                )
                # Build visual payload for the frontend map
                primary = top[0][0]
                visual_payload = {
                    "origin": {"lat": lat0, "lng": lng0, "name": f"{loc.get('city','You')} · current"},
                    "primary": {
                        "id": primary["id"], "name": primary["name"], "category": primary["category"],
                        "lat": primary["lat"], "lng": primary["lng"], "distance_mi": round(top[0][1], 1),
                        "city": primary["city"], "state": primary["state"], "address": primary["address"],
                        "phone": primary["phone"], "hours": primary["hours"],
                        "services": primary["services"], "notes": primary["notes"], "rating": primary["rating"],
                    },
                    "others": [
                        {"id": p["id"], "name": p["name"], "category": p["category"],
                         "lat": p["lat"], "lng": p["lng"], "distance_mi": round(d, 1),
                         "city": p["city"], "state": p["state"]}
                        for p, d in top[1:]
                    ],
                    "categories": categories,
                }
            ctx_block = ("\n\nDriver/Broker context:\n" + "\n".join(ctx_lines)) + loc_block

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=req.session_id,
            system_message=JADE_SYSTEM_PROMPT + f"\n\nUser role: {user['role']}, name: {user['name']}" + ctx_block,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        reply_text = ""
        result = await chat.send_message(UserMessage(text=req.message))
        if isinstance(result, str):
            reply_text = result
        else:
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

        return {"reply": reply_text, "session_id": req.session_id, "visual": visual_payload}
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
# Integrations / widget framework
# ---------------------------------------------------------------------------
INTEGRATION_CATALOG = [
    {"slug": "samsara", "name": "Samsara", "category": "Telematics", "icon": "Truck",
     "default_url": "https://www.samsara.com/", "description": "Vehicle telematics, dashcam, GPS.",
     "color": "#0F62FE", "mode": "iframe"},
    {"slug": "motive", "name": "Motive", "category": "ELD / Fleet", "icon": "Activity",
     "default_url": "https://gomotive.com/", "description": "ELD compliance and driver safety.",
     "color": "#FF6A2A", "mode": "iframe"},
    {"slug": "geotab", "name": "Geotab", "category": "Telematics", "icon": "Gauge",
     "default_url": "https://my.geotab.com/", "description": "Fleet telematics and fuel analytics.",
     "color": "#00C896", "mode": "iframe"},
    {"slug": "lytx", "name": "Lytx", "category": "Safety / Video", "icon": "Video",
     "default_url": "https://www.lytx.com/", "description": "AI-powered dashcam coaching.",
     "color": "#E22D2D", "mode": "iframe"},
    {"slug": "mcleod", "name": "McLeod Software", "category": "TMS", "icon": "Briefcase",
     "default_url": "https://www.mcleodsoftware.com/", "description": "Transportation management system.",
     "color": "#1F2E5A", "mode": "iframe"},
    {"slug": "loadsmart", "name": "Loadsmart", "category": "Load Board", "icon": "Boxes",
     "default_url": "https://loadsmart.com/", "description": "Digital freight matching & TMS.",
     "color": "#FFD400", "mode": "iframe"},
    {"slug": "navisphere", "name": "Navisphere (CH Robinson)", "category": "Brokerage", "icon": "Globe",
     "default_url": "https://www.chrobinson.com/en-us/", "description": "Global logistics platform.",
     "color": "#0033A0", "mode": "iframe"},
    {"slug": "dat", "name": "DAT One", "category": "Load Board", "icon": "List",
     "default_url": "https://www.dat.com/", "description": "Spot market load board.",
     "color": "#0078D7", "mode": "iframe"},
    {"slug": "drivewyze", "name": "Drivewyze", "category": "Bypass", "icon": "Shield",
     "default_url": "https://drivewyze.com/", "description": "Weigh-station bypass + safety alerts.",
     "color": "#21A038", "mode": "iframe"},
    {"slug": "quickbooks", "name": "QuickBooks", "category": "Accounting", "icon": "Calculator",
     "default_url": "https://app.qbo.intuit.com/", "description": "Settlements + accounting.",
     "color": "#2CA01C", "mode": "iframe"},
    {"slug": "stripe", "name": "Stripe", "category": "Payments", "icon": "CreditCard",
     "default_url": "https://dashboard.stripe.com/", "description": "Payouts + cards.",
     "color": "#635BFF", "mode": "iframe"},
    {"slug": "trimble", "name": "Trimble Maps", "category": "Routing", "icon": "Map",
     "default_url": "https://maps.trimble.com/", "description": "Commercial truck routing.",
     "color": "#0063BE", "mode": "iframe"},
    {"slug": "custom", "name": "Custom URL", "category": "Generic", "icon": "Link",
     "default_url": "", "description": "Embed any URL as a widget panel.",
     "color": "#00FA9A", "mode": "iframe"},
]


class IntegrationConnectRequest(BaseModel):
    slug: str
    embed_url: Optional[str] = None
    name: Optional[str] = None
    api_key: Optional[str] = None
    notes: Optional[str] = ""


def _meta_for(slug: str) -> Optional[dict]:
    for m in INTEGRATION_CATALOG:
        if m["slug"] == slug:
            return m
    return None


@api.get("/integrations/catalog")
async def integrations_catalog(user: dict = Depends(current_user)):
    return INTEGRATION_CATALOG


@api.get("/integrations")
async def list_integrations(user: dict = Depends(current_user)):
    cursor = db.integrations.find({"user_id": user["id"]}, {"_id": 0, "api_key": 0}).sort("connected_at", -1)
    return await cursor.to_list(200)


@api.post("/integrations/connect")
async def connect_integration(req: IntegrationConnectRequest, user: dict = Depends(current_user)):
    meta = _meta_for(req.slug)
    if not meta and req.slug != "custom":
        raise HTTPException(status_code=404, detail="Unknown integration slug")
    embed_url = (req.embed_url or (meta and meta["default_url"]) or "").strip()
    if not embed_url:
        raise HTTPException(status_code=400, detail="embed_url required")
    if not (embed_url.startswith("http://") or embed_url.startswith("https://")):
        raise HTTPException(status_code=400, detail="embed_url must start with http(s)://")
    record = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "slug": req.slug,
        "name": req.name or (meta["name"] if meta else "Custom"),
        "category": meta["category"] if meta else "Custom",
        "icon": meta["icon"] if meta else "Link",
        "color": meta["color"] if meta else "#00FA9A",
        "embed_url": embed_url,
        "notes": req.notes or "",
        "status": "CONNECTED",
        "has_api_key": bool(req.api_key),
        "connected_at": utcnow_iso(),
    }
    # store separately keyed key (out of band; demo only)
    doc = record.copy()
    if req.api_key:
        doc["api_key"] = req.api_key
    await db.integrations.insert_one(doc)
    return record


@api.delete("/integrations/{integration_id}")
async def disconnect_integration(integration_id: str, user: dict = Depends(current_user)):
    res = await db.integrations.delete_one({"id": integration_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Integration not found")
    return {"ok": True}


@api.get("/integrations/{integration_id}")
async def get_integration(integration_id: str, user: dict = Depends(current_user)):
    doc = await db.integrations.find_one({"id": integration_id, "user_id": user["id"]}, {"_id": 0, "api_key": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


# ---------------------------------------------------------------------------
# Public shipper tracking (no auth)
# ---------------------------------------------------------------------------
@api.get("/track/{load_id}")
async def public_track(load_id: str):
    """Returns a stable demo shipment payload by load_id for public sharing."""
    # Deterministic so the same load_id always renders the same data
    eta_offset = (abs(hash(load_id)) % 24) + 2
    progress_pct = (abs(hash(load_id)) % 90) + 5
    return {
        "load_id": load_id,
        "shipper": "FreshHarvest Foods",
        "consignee": "Phoenix DC · Bay 11",
        "carrier": "Reyes Trucking LLC",
        "carrier_dot": "DOT-2829841",
        "status": "IN_TRANSIT" if progress_pct < 95 else "ARRIVING",
        "origin": "Dallas, TX",
        "destination": "Phoenix, AZ",
        "pickup_at": (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat(),
        "eta": (datetime.now(timezone.utc) + timedelta(hours=eta_offset)).isoformat(),
        "progress_pct": progress_pct,
        "current_location": "Tucson, AZ · I-10 W · mile 263",
        "miles_remaining": 612 - int(progress_pct * 6.12),
        "temperature_f": 36,
        "events": [
            {"t": (datetime.now(timezone.utc) - timedelta(hours=14)).isoformat(),
             "kind": "DISPATCH", "label": "Load tendered to Reyes Trucking LLC"},
            {"t": (datetime.now(timezone.utc) - timedelta(hours=12, minutes=30)).isoformat(),
             "kind": "PICKUP", "label": "Picked up · Dallas DC"},
            {"t": (datetime.now(timezone.utc) - timedelta(hours=10)).isoformat(),
             "kind": "EVENT", "label": "Crossed TX/NM state line"},
            {"t": (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat(),
             "kind": "REST", "label": "Driver took 30-min federal break"},
            {"t": (datetime.now(timezone.utc) - timedelta(minutes=42)).isoformat(),
             "kind": "EVENT", "label": "Passing Tucson, AZ — clear weather"},
        ],
    }


# ---------------------------------------------------------------------------
# Settlements (Stripe + QuickBooks mock pipeline)
# ---------------------------------------------------------------------------
@api.get("/settlements")
async def list_settlements(user: dict = Depends(current_user)):
    role = user["role"]
    base = datetime.now(timezone.utc)
    items_driver = [
        {"id": "S-44218", "load_id": "JL-2026-00917", "broker": "Atlas Freight Co.",
         "amount_usd": 2685.50, "status": "PENDING", "due_at": (base + timedelta(days=5)).isoformat(),
         "detention_usd": 50.00, "fuel_advance_usd": 400.00, "method": "ACH"},
        {"id": "S-44209", "load_id": "JL-2026-00911", "broker": "Crossroads TMS",
         "amount_usd": 3050.00, "status": "PAID", "paid_at": (base - timedelta(days=2)).isoformat(),
         "detention_usd": 0.00, "fuel_advance_usd": 0.00, "method": "Stripe"},
        {"id": "S-44201", "load_id": "JL-2026-00905", "broker": "Sunbelt Logistics",
         "amount_usd": 1180.00, "status": "PAID", "paid_at": (base - timedelta(days=9)).isoformat(),
         "detention_usd": 150.00, "fuel_advance_usd": 200.00, "method": "Stripe"},
        {"id": "S-44197", "load_id": "JL-2026-00899", "broker": "Pacific Bridge",
         "amount_usd": 3950.00, "status": "PAID", "paid_at": (base - timedelta(days=14)).isoformat(),
         "detention_usd": 0.00, "fuel_advance_usd": 600.00, "method": "ACH"},
    ]
    items_broker = [
        {"id": "P-91022", "load_id": "JL-2026-00917", "carrier": "Reyes Trucking LLC",
         "amount_usd": 2685.50, "margin_usd": 521.20, "status": "SCHEDULED",
         "due_at": (base + timedelta(days=5)).isoformat(), "method": "Stripe Payouts"},
        {"id": "P-91019", "load_id": "JL-2026-00911", "carrier": "Crossroads Express",
         "amount_usd": 3050.00, "margin_usd": 588.00, "status": "PAID",
         "paid_at": (base - timedelta(days=2)).isoformat(), "method": "Stripe Payouts"},
        {"id": "P-91014", "load_id": "JL-2026-00908", "carrier": "Pacific Bridge Carriers",
         "amount_usd": 4280.00, "margin_usd": 812.00, "status": "PAID",
         "paid_at": (base - timedelta(days=4)).isoformat(), "method": "QuickBooks ACH"},
    ]
    return {
        "items": items_driver if role == "driver" else items_broker,
        "totals": {
            "outstanding_usd": sum(i["amount_usd"] for i in (items_driver if role == "driver" else items_broker)
                                   if i["status"] in ("PENDING", "SCHEDULED")),
            "paid_30d_usd": sum(i["amount_usd"] for i in (items_driver if role == "driver" else items_broker)
                                if i["status"] == "PAID"),
        },
        "connections": {
            "stripe": True,
            "quickbooks": False,
        },
    }


# ---------------------------------------------------------------------------
# WebSocket — real-time dispatch comms
# ---------------------------------------------------------------------------
from fastapi import WebSocket, WebSocketDisconnect  # noqa: E402


class _DispatchHub:
    def __init__(self) -> None:
        self.connections: list[WebSocket] = []
        self.history: list[dict] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.connections.append(ws)
        # Send last 40 messages on connect
        for msg in self.history[-40:]:
            await ws.send_json(msg)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.connections:
            self.connections.remove(ws)

    async def broadcast(self, msg: dict) -> None:
        self.history.append(msg)
        self.history = self.history[-200:]
        dead = []
        for ws in self.connections:
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for d in dead:
            self.disconnect(d)


dispatch_hub = _DispatchHub()


@app.websocket("/api/ws/dispatch")
async def dispatch_ws(ws: WebSocket, token: str = ""):
    """Real-time dispatch chat.  Pass ?token=<jwt> for identification."""
    user_name = "Anonymous"
    user_role = "viewer"
    try:
        if token:
            decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
            email = decoded.get("sub")
            u = DEMO_USERS.get(email)
            if u:
                user_name = u["name"]
                user_role = u["role"]
    except Exception:
        pass

    await dispatch_hub.connect(ws)
    await dispatch_hub.broadcast({
        "id": str(uuid.uuid4()),
        "ts": utcnow_iso(),
        "kind": "system",
        "text": f"{user_name} joined dispatch",
    })
    try:
        while True:
            data = await ws.receive_json()
            text = (data.get("text") or "").strip()
            if not text:
                continue
            await dispatch_hub.broadcast({
                "id": str(uuid.uuid4()),
                "ts": utcnow_iso(),
                "kind": "msg",
                "from": user_name,
                "role": user_role,
                "text": text[:800],
            })
    except WebSocketDisconnect:
        dispatch_hub.disconnect(ws)
        await dispatch_hub.broadcast({
            "id": str(uuid.uuid4()),
            "ts": utcnow_iso(),
            "kind": "system",
            "text": f"{user_name} left dispatch",
        })


# ---------------------------------------------------------------------------
# Phase 3 extensions (editable ELD, trips, maintenance, docs, fuel, geofence, TTS)
# ---------------------------------------------------------------------------
from routes.phase3 import make_router as _make_phase3_router  # noqa: E402
from routes.tts import router as _tts_router  # noqa: E402
from routes.safety import make_router as _make_safety_router  # noqa: E402

_phase3_router = _make_phase3_router(db=db, current_user=current_user, utcnow_iso=utcnow_iso)
api.include_router(_phase3_router)
api.include_router(_tts_router)
_safety_router = _make_safety_router(db=db, current_user=current_user, utcnow_iso=utcnow_iso, emergent_llm_key=EMERGENT_LLM_KEY)
api.include_router(_safety_router)


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


@app.on_event("startup")
async def _startup():
    try:
        await db.users.create_index("email", unique=True)
    except Exception as e:  # noqa: BLE001
        logger.warning("users.email index init: %s", e)


@app.on_event("shutdown")
async def _shutdown():
    client.close()
