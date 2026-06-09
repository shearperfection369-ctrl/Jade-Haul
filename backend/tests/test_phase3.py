"""Phase 3 backend tests — TTS, ELD CRUD, Trips, Maintenance, Documents,
Fuel scan + ledger, Geofence, Companion, US weigh-stations."""
import base64
import io
import os
import time

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

DRIVER_EMAIL = "driver@jadeos.com"
PASSWORD = "jade123"


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def driver_token():
    r = requests.post(f"{API}/auth/login", json={"email": DRIVER_EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def H(driver_token):
    return {"Authorization": f"Bearer {driver_token}"}


def _png_b64() -> str:
    img = Image.new("RGB", (12, 12), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _jpg_b64() -> str:
    img = Image.new("RGB", (24, 24), "white")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode()


# ---------------- TTS ----------------
def test_tts_health():
    r = requests.get(f"{API}/tts/health", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "nova" in body["voices"]
    assert "tts-1" in body["models"]


def test_tts_speak_returns_mp3():
    r = requests.post(
        f"{API}/tts/speak",
        json={"text": "Hello driver, this is Jade.", "voice": "nova", "model": "tts-1", "speed": 1.0},
        timeout=60,
    )
    assert r.status_code == 200, r.text[:300]
    assert r.headers["content-type"].startswith("audio/mpeg")
    assert len(r.content) >= 10000, f"audio body too small ({len(r.content)} bytes)"


# ---------------- ELD CRUD ----------------
def test_eld_crud(H):
    # Create
    r = requests.post(f"{API}/eld/events", headers=H,
                      json={"status": "DRIVING", "location": "Tucson, AZ"}, timeout=15)
    assert r.status_code == 200, r.text
    ev = r.json()
    eid = ev["id"]
    assert ev["status"] == "DRIVING" and ev["location"] == "Tucson, AZ"

    # List
    r = requests.get(f"{API}/eld/events", headers=H, timeout=15)
    assert r.status_code == 200
    assert any(e["id"] == eid for e in r.json())

    # Patch
    r = requests.patch(f"{API}/eld/events/{eid}", headers=H, json={"status": "ON_DUTY"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "ON_DUTY"

    # Invalid status
    r = requests.patch(f"{API}/eld/events/{eid}", headers=H, json={"status": "INVALID"}, timeout=15)
    assert r.status_code == 400

    # Delete
    r = requests.delete(f"{API}/eld/events/{eid}", headers=H, timeout=15)
    assert r.status_code == 200


def test_eld_create_invalid_status(H):
    r = requests.post(f"{API}/eld/events", headers=H,
                      json={"status": "BAD", "location": "X"}, timeout=10)
    assert r.status_code == 400


# ---------------- Trips ----------------
def test_trips_crud(H):
    body = {
        "name": "TEST_PhxRun",
        "commodity": "Reefer",
        "weight_lbs": 41000,
        "origin": {"name": "Tucson Yard", "lat": 32.2226, "lng": -110.9747},
        "destination": {"name": "Phoenix DC", "lat": 33.4484, "lng": -112.0740},
        "stops": [],
    }
    r = requests.post(f"{API}/trips", headers=H, json=body, timeout=15)
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    assert r.json()["status"] == "PLANNED"

    r = requests.get(f"{API}/trips", headers=H, timeout=15)
    assert any(t["id"] == tid for t in r.json())

    r = requests.patch(f"{API}/trips/{tid}/status?status=IN_PROGRESS", headers=H, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "IN_PROGRESS"

    r = requests.patch(f"{API}/trips/{tid}/status?status=BOGUS", headers=H, timeout=10)
    assert r.status_code == 400

    r = requests.delete(f"{API}/trips/{tid}", headers=H, timeout=15)
    assert r.status_code == 200


# ---------------- Maintenance ----------------
def test_maintenance_crud(H):
    r = requests.post(f"{API}/maintenance", headers=H,
                      json={"category": "OIL", "title": "Oil change", "severity": "GREEN"}, timeout=15)
    assert r.status_code == 200, r.text
    mid = r.json()["id"]

    r = requests.get(f"{API}/maintenance", headers=H, timeout=15)
    assert any(m["id"] == mid for m in r.json())

    r = requests.patch(f"{API}/maintenance/{mid}", headers=H, json={"completed": True}, timeout=15)
    assert r.status_code == 200
    assert r.json()["completed"] is True

    r = requests.delete(f"{API}/maintenance/{mid}", headers=H, timeout=15)
    assert r.status_code == 200


# ---------------- Documents ----------------
def test_documents_crud(H):
    payload = {
        "name": "TEST_BOL",
        "category": "BOL",
        "mime_type": "image/png",
        "data_base64": _png_b64(),
    }
    r = requests.post(f"{API}/documents", headers=H, json=payload, timeout=20)
    assert r.status_code == 200, r.text
    doc = r.json()
    did = doc["id"]
    # List response MUST NOT contain data_base64
    assert "data_base64" not in doc

    r = requests.get(f"{API}/documents", headers=H, timeout=15)
    assert r.status_code == 200
    listed = r.json()
    target = next((d for d in listed if d["id"] == did), None)
    assert target is not None
    assert "data_base64" not in target

    # Detail GET returns full record WITH data_base64
    r = requests.get(f"{API}/documents/{did}", headers=H, timeout=15)
    assert r.status_code == 200
    assert "data_base64" in r.json() and r.json()["data_base64"]

    r = requests.delete(f"{API}/documents/{did}", headers=H, timeout=15)
    assert r.status_code == 200


# ---------------- Fuel scan + ledger ----------------
def test_fuel_scan_and_ifta(H):
    r = requests.post(f"{API}/fuel/scan", headers=H,
                      json={"image_base64": _jpg_b64(), "mime_type": "image/jpeg"}, timeout=90)
    assert r.status_code == 200, r.text[:400]
    body = r.json()
    assert "receipt" in body and "raw" in body
    rec = body["receipt"]
    rid = rec["id"]
    assert rec["station_name"]
    assert rec["state"]
    assert "gallons" in rec and "total_usd" in rec

    r = requests.get(f"{API}/fuel/receipts", headers=H, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and "ifta_by_state" in data
    assert any(it["id"] == rid for it in data["items"])
    # Ensure IFTA roll-up has expected keys
    if data["ifta_by_state"]:
        s = data["ifta_by_state"][0]
        for k in ("state", "gallons", "total_usd", "count"):
            assert k in s

    r = requests.delete(f"{API}/fuel/receipts/{rid}", headers=H, timeout=15)
    assert r.status_code == 200


def test_fuel_manual(H):
    body = {
        "station_name": "TEST_PilotJ",
        "state": "AZ",
        "gallons": 100.0,
        "price_per_gallon": 3.5,
        "total_usd": 350.0,
        "odometer_mi": 100000,
    }
    r = requests.post(f"{API}/fuel/manual", headers=H, json=body, timeout=15)
    assert r.status_code == 200
    rid = r.json()["id"]
    requests.delete(f"{API}/fuel/receipts/{rid}", headers=H, timeout=15)


# ---------------- Geofence ----------------
def test_geofence_on_site(H):
    r = requests.post(f"{API}/geofence/ping", headers=H,
                      json={"lat": 33.4484, "lng": -112.074, "speed_mph": 0}, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["on_site"] is True
    assert body["shipper"]["name"] == "FreshHarvest Foods · Phoenix DC"


def test_geofence_off_site(H):
    r = requests.post(f"{API}/geofence/ping", headers=H,
                      json={"lat": 0.0, "lng": 0.0, "speed_mph": 60}, timeout=10)
    assert r.status_code == 200
    assert r.json()["on_site"] is False


def test_geofence_list(H):
    r = requests.get(f"{API}/geofence/list", headers=H, timeout=10)
    assert r.status_code == 200
    fences = r.json()
    assert isinstance(fences, list) and len(fences) >= 5
    for f in fences:
        assert {"name", "lat", "lng", "radius_mi"}.issubset(set(f.keys()))


# ---------------- Companion ----------------
def test_companion_tip(H):
    r = requests.get(f"{API}/companion/tip", headers=H, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["text"]
    assert "icon" in body
    assert "ts" in body


# ---------------- US Weigh Stations ----------------
def test_weigh_stations_us(H):
    r = requests.get(f"{API}/weigh-stations/us", headers=H, timeout=10)
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list) and len(arr) >= 15
    keys = {"id", "name", "state", "lat", "lng", "status", "score"}
    for s in arr:
        assert keys.issubset(set(s.keys()))
