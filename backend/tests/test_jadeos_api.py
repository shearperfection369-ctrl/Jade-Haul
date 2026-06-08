"""JadeOS backend integration tests."""
import base64
import io
import os
import time
import uuid

import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://broker-copilot-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DRIVER_EMAIL = "driver@jadeos.com"
BROKER_EMAIL = "broker@jadeos.com"
PASSWORD = "jade123"


# --------------------------- fixtures ---------------------------
@pytest.fixture(scope="session")
def driver_token():
    r = requests.post(f"{API}/auth/login", json={"email": DRIVER_EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def broker_token():
    r = requests.post(f"{API}/auth/login", json={"email": BROKER_EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# --------------------------- root + auth ---------------------------
def test_root_status():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data.get("service") == "JadeOS"
    assert data.get("status") == "online"


def test_login_driver():
    r = requests.post(f"{API}/auth/login", json={"email": DRIVER_EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "token" in body and body["token"]
    assert body["user"]["role"] == "driver"
    assert body["user"]["email"] == DRIVER_EMAIL


def test_login_broker():
    r = requests.post(f"{API}/auth/login", json={"email": BROKER_EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "broker"


def test_login_wrong_password():
    r = requests.post(f"{API}/auth/login", json={"email": DRIVER_EMAIL, "password": "wrong"}, timeout=15)
    assert r.status_code == 401


def test_me_with_token(driver_token):
    r = requests.get(f"{API}/auth/me", headers=auth_headers(driver_token), timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == DRIVER_EMAIL


def test_me_without_token():
    r = requests.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 401


# --------------------------- driver endpoints ---------------------------
def test_driver_hos(driver_token):
    r = requests.get(f"{API}/driver/hos", headers=auth_headers(driver_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ["drive_remaining_hr", "on_duty_remaining_hr", "cycle_remaining_hr", "log_events"]:
        assert k in d
    assert isinstance(d["log_events"], list) and len(d["log_events"]) >= 1


def test_driver_active_load(driver_token):
    r = requests.get(f"{API}/driver/active_load", headers=auth_headers(driver_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["origin"]["lat"] and d["origin"]["lng"]
    assert d["destination"]["lat"] and d["destination"]["lng"]
    assert isinstance(d["stops"], list)
    assert d["miles_total"] > 0


def test_loads(driver_token):
    r = requests.get(f"{API}/loads", headers=auth_headers(driver_token), timeout=15)
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list) and len(arr) >= 4


def test_detention_flow(driver_token):
    # start
    payload = {"shipper_name": "TEST_Shipper", "location": "TEST_Location", "notes": "TEST"}
    r = requests.post(f"{API}/detention/start", headers=auth_headers(driver_token), json=payload, timeout=15)
    assert r.status_code == 200, r.text
    entry = r.json()
    assert entry["end_at"] is None
    entry_id = entry["id"]

    # list contains it
    r = requests.get(f"{API}/detention/list", headers=auth_headers(driver_token), timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert any(it["id"] == entry_id for it in items)

    time.sleep(1.2)

    # stop
    r = requests.post(f"{API}/detention/stop", headers=auth_headers(driver_token), json={"entry_id": entry_id}, timeout=15)
    assert r.status_code == 200, r.text
    stopped = r.json()
    assert stopped["end_at"] is not None
    assert stopped["duration_minutes"] is not None


def test_weigh_stations(driver_token):
    r = requests.get(f"{API}/weigh-stations", headers=auth_headers(driver_token), timeout=15)
    assert r.status_code == 200
    arr = r.json()
    statuses = {x["status"] for x in arr}
    assert "BYPASS" in statuses and "PULL_IN" in statuses


def test_safety_scorecard(driver_token):
    r = requests.get(f"{API}/safety/scorecard", headers=auth_headers(driver_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "overall" in d and "categories" in d


def test_fleet_health(driver_token):
    r = requests.get(f"{API}/fleet/health", headers=auth_headers(driver_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "fuel_pct" in d
    assert isinstance(d["alerts"], list)


def test_messages(driver_token):
    r = requests.get(f"{API}/messages", headers=auth_headers(driver_token), timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# --------------------------- broker ---------------------------
def test_broker_dashboard(broker_token):
    r = requests.get(f"{API}/broker/dashboard", headers=auth_headers(broker_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ["loads_today", "revenue_mtd_usd", "top_lanes", "revenue_trend_14d"]:
        assert k in d


def test_broker_carriers(broker_token):
    r = requests.get(f"{API}/broker/carriers", headers=auth_headers(broker_token), timeout=15)
    assert r.status_code == 200
    arr = r.json()
    assert len(arr) == 5
    assert all("risk" in c for c in arr)


def test_broker_exceptions(broker_token):
    r = requests.get(f"{API}/broker/exceptions", headers=auth_headers(broker_token), timeout=15)
    assert r.status_code == 200
    assert len(r.json()) >= 3


def test_broker_quote_optimize(broker_token):
    payload = {
        "origin": "Dallas, TX", "destination": "Phoenix, AZ",
        "miles": 1067, "weight_lbs": 38400, "equipment": "Reefer",
        "pickup_date": "2026-02-11", "hazmat": False,
    }
    r = requests.post(f"{API}/broker/quote/optimize", headers=auth_headers(broker_token), json=payload, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["suggested_rate_usd"] > 0
    assert isinstance(d["best_carriers"], list) and len(d["best_carriers"]) >= 1
    assert isinstance(d["rationale"], list)


def test_broker_shipments(broker_token):
    r = requests.get(f"{API}/broker/shipments", headers=auth_headers(broker_token), timeout=15)
    assert r.status_code == 200
    arr = r.json()
    assert all("progress_pct" in s for s in arr)


# --------------------------- JADE chat ---------------------------
def test_jade_chat(driver_token):
    sid = f"test-{uuid.uuid4()}"
    payload = {"session_id": sid, "message": "How many hours can I still drive today?"}
    r = requests.post(f"{API}/jade/chat", headers=auth_headers(driver_token), json=payload, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("reply"), str) and len(d["reply"]) > 0
    assert d["session_id"] == sid


# --------------------------- Bill scan ---------------------------
def _make_test_jpeg_b64() -> str:
    img = Image.new("RGB", (640, 480), color=(245, 245, 240))
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, 620, 80], fill=(20, 90, 60))
    d.text((40, 35), "BILL OF LADING - BOL-44210-X", fill=(255, 255, 255))
    d.text((40, 120), "Broker: Atlas Freight Co.", fill=(0, 0, 0))
    d.text((40, 150), "Carrier: Reyes Trucking LLC", fill=(0, 0, 0))
    d.text((40, 180), "Origin: Dallas, TX", fill=(0, 0, 0))
    d.text((40, 210), "Destination: Phoenix, AZ", fill=(0, 0, 0))
    d.text((40, 240), "Commodity: Refrigerated produce", fill=(0, 0, 0))
    d.text((40, 270), "Weight: 38400 lbs", fill=(0, 0, 0))
    d.text((40, 300), "Total: $2685.50", fill=(0, 0, 0))
    d.rectangle([40, 340, 600, 440], outline=(0, 0, 0), width=2)
    d.text((50, 360), "Linehaul ............ 2400.00", fill=(0, 0, 0))
    d.text((50, 390), "Fuel surcharge ...... 235.50", fill=(0, 0, 0))
    d.text((50, 420), "Detention ........... 50.00", fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_bill_scan(driver_token):
    b64 = _make_test_jpeg_b64()
    r = requests.post(
        f"{API}/bill/scan",
        headers=auth_headers(driver_token),
        json={"image_base64": b64, "mime_type": "image/jpeg"},
        timeout=120,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "parsed" in d
    # Either real parse or fallback — both must contain broker_name
    parsed = d["parsed"]
    assert parsed is not None, f"parsed is None: {d}"
    assert "broker_name" in parsed
