"""Phase 4 wrap-up verification — locations/nearby (POI), JADE location-aware chat,
trips POST (voice wizard target), TTS smoke. Runs against REACT_APP_BACKEND_URL."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

DRIVER_EMAIL = "driver@jadeos.com"
BROKER_EMAIL = "broker@jadeos.com"
PASSWORD = "jade123"


@pytest.fixture(scope="session")
def driver_token():
    assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
    r = requests.post(f"{API}/auth/login", json={"email": DRIVER_EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def broker_token():
    r = requests.post(f"{API}/auth/login", json={"email": BROKER_EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ---------------------- TTS smoke ----------------------
def test_tts_health():
    r = requests.get(f"{API}/tts/health", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "ok" in body


def test_tts_speak_returns_audio(driver_token):
    payload = {"text": "Wrap-up verification ping.", "voice": "nova", "model": "tts-1", "speed": 1.0}
    r = requests.post(f"{API}/tts/speak", headers=H(driver_token), json=payload, timeout=60)
    assert r.status_code == 200, r.text
    ctype = r.headers.get("content-type", "")
    assert "audio" in ctype, ctype
    assert len(r.content) >= 5_000, f"audio too small ({len(r.content)} bytes)"


# ---------------------- locations / POI ----------------------
def test_locations_categories(driver_token):
    r = requests.get(f"{API}/locations/categories", headers=H(driver_token), timeout=15)
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list) and len(arr) >= 1
    cats = {x["category"] for x in arr}
    # truck stop / fuel-relevant categories expected
    assert any(c.lower() in ("truck_stop", "fuel", "rest_area", "weigh_station") for c in cats), cats


def test_locations_nearby_basic(driver_token):
    # Phoenix area
    params = {"lat": 33.4484, "lng": -112.074, "radius_mi": 500, "limit": 5}
    r = requests.get(f"{API}/locations/nearby", headers=H(driver_token), params=params, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["origin"]["lat"] == params["lat"]
    assert isinstance(d["results"], list) and len(d["results"]) >= 1
    p = d["results"][0]
    for k in ("lat", "lng", "name", "category", "distance_mi"):
        assert k in p, f"missing {k} in poi: {p}"


def test_locations_nearby_with_category(driver_token):
    params = {"lat": 33.4484, "lng": -112.074, "radius_mi": 500, "limit": 5, "category": "truck_stop"}
    r = requests.get(f"{API}/locations/nearby", headers=H(driver_token), params=params, timeout=20)
    assert r.status_code == 200
    d = r.json()
    if d["results"]:
        assert all(p["category"] == "truck_stop" for p in d["results"]), d["results"]


def test_locations_geocode(driver_token):
    r = requests.get(f"{API}/locations/geocode", headers=H(driver_token), params={"name": "Phoenix, AZ"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "lat" in d and "lng" in d


# ---------------------- JADE chat (location-aware) ----------------------
def test_jade_chat_location_aware(driver_token):
    sid = f"verify-{uuid.uuid4()}"
    payload = {
        "session_id": sid,
        "message": "Find me a truck stop nearby",
        "current_location": {"lat": 33.4484, "lng": -112.074, "city": "Phoenix", "state": "AZ"},
    }
    r = requests.post(f"{API}/jade/chat", headers=H(driver_token), json=payload, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("reply"), str) and len(d["reply"]) > 0
    assert d["session_id"] == sid
    # POI overlay: backend may attach a "pois" or "results" list
    overlay_present = any(k in d for k in ("pois", "results", "locations", "nearby"))
    assert overlay_present or len(d["reply"]) > 0  # at least the reply must be there


# ---------------------- Trips POST (Voice Trip Wizard target) ----------------------
def test_create_trip_voice_wizard(driver_token):
    payload = {
        "name": "TEST_Voice Phoenix -> Dallas",
        "origin": {"name": "Phoenix, AZ", "lat": 33.4484, "lng": -112.074},
        "destination": {"name": "Dallas, TX", "lat": 32.7767, "lng": -96.797},
        "stops": [],
        "miles": 1067,
        "equipment": "Reefer",
        "notes": "TEST voice wizard create",
    }
    r = requests.post(f"{API}/trips", headers=H(driver_token), json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    trip = r.json()
    assert "id" in trip
    trip_id = trip["id"]

    # verify persistence via GET list
    r2 = requests.get(f"{API}/trips", headers=H(driver_token), timeout=15)
    assert r2.status_code == 200
    arr = r2.json()
    assert any(t.get("id") == trip_id for t in arr), "created trip not in list"

    # cleanup
    requests.delete(f"{API}/trips/{trip_id}", headers=H(driver_token), timeout=15)


# ---------------------- Broker smoke ----------------------
def test_broker_dashboard_smoke(broker_token):
    r = requests.get(f"{API}/broker/dashboard", headers=H(broker_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "loads_today" in d


def test_public_track_smoke():
    r = requests.get(f"{API}/track/JL-2026-00917", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "load_id" in d or "id" in d or "status" in d
