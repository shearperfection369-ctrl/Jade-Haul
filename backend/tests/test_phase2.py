"""Phase 2 — Integrations, public track, settlements, websocket dispatch."""
import asyncio
import json
import os

import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://broker-copilot-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws/dispatch"

DRIVER_EMAIL = "driver@jadeos.com"
BROKER_EMAIL = "broker@jadeos.com"
PASSWORD = "jade123"


def _login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def driver_token():
    return _login(DRIVER_EMAIL)


@pytest.fixture(scope="module")
def broker_token():
    return _login(BROKER_EMAIL)


def auth(t):
    return {"Authorization": f"Bearer {t}"}


# --------------------------- Integrations ---------------------------
REQUIRED_SLUGS = {"samsara", "motive", "geotab", "mcleod", "loadsmart",
                  "navisphere", "dat", "drivewyze", "quickbooks", "stripe",
                  "trimble", "custom"}


def test_integrations_catalog(driver_token):
    r = requests.get(f"{API}/integrations/catalog", headers=auth(driver_token), timeout=15)
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list) and len(arr) >= 12
    slugs = {x["slug"] for x in arr}
    missing = REQUIRED_SLUGS - slugs
    assert not missing, f"missing slugs: {missing}"
    for x in arr:
        for k in ["slug", "name", "category", "default_url", "color", "icon"]:
            assert k in x, f"missing key {k} in {x}"


def test_integrations_catalog_requires_auth():
    r = requests.get(f"{API}/integrations/catalog", timeout=15)
    assert r.status_code in (401, 403)


def test_integrations_list_initially(driver_token):
    # Clean slate — delete any existing first
    r = requests.get(f"{API}/integrations", headers=auth(driver_token), timeout=15)
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list)
    for it in arr:
        requests.delete(f"{API}/integrations/{it['id']}", headers=auth(driver_token), timeout=15)
    r = requests.get(f"{API}/integrations", headers=auth(driver_token), timeout=15)
    assert r.status_code == 200
    assert r.json() == []


def test_integrations_connect_invalid_url(driver_token):
    r = requests.post(f"{API}/integrations/connect", headers=auth(driver_token),
                      json={"slug": "samsara", "embed_url": "ftp://nope"}, timeout=15)
    assert r.status_code == 400


def test_integrations_full_lifecycle(driver_token):
    # Connect
    r = requests.post(f"{API}/integrations/connect", headers=auth(driver_token),
                      json={"slug": "samsara", "embed_url": "https://www.samsara.com/"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["id", "name", "slug", "embed_url", "status"]:
        assert k in d
    assert d["status"] == "CONNECTED"
    assert d["slug"] == "samsara"
    iid = d["id"]

    # Get
    r = requests.get(f"{API}/integrations/{iid}", headers=auth(driver_token), timeout=15)
    assert r.status_code == 200
    got = r.json()
    assert "api_key" not in got
    assert got["id"] == iid

    # List contains it
    r = requests.get(f"{API}/integrations", headers=auth(driver_token), timeout=15)
    assert any(x["id"] == iid for x in r.json())

    # Delete
    r = requests.delete(f"{API}/integrations/{iid}", headers=auth(driver_token), timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True

    # 404 after delete
    r = requests.get(f"{API}/integrations/{iid}", headers=auth(driver_token), timeout=15)
    assert r.status_code == 404


# --------------------------- Public track (no auth) ---------------------------
def test_public_track_known_load():
    r = requests.get(f"{API}/track/JL-2026-00917", timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ["load_id", "shipper", "carrier", "status", "origin",
              "destination", "eta", "progress_pct", "events"]:
        assert k in d, f"missing {k}"
    assert isinstance(d["events"], list) and len(d["events"]) >= 1
    assert d["load_id"] == "JL-2026-00917"


def test_public_track_no_auth_header_needed():
    # Same call without any auth header
    r = requests.get(f"{API}/track/ANY-RANDOM-ID", timeout=15)
    assert r.status_code == 200


def test_public_track_deterministic():
    a = requests.get(f"{API}/track/DETERMINISTIC-FOO", timeout=15).json()
    b = requests.get(f"{API}/track/DETERMINISTIC-FOO", timeout=15).json()
    assert a["progress_pct"] == b["progress_pct"]


# --------------------------- Settlements ---------------------------
def test_settlements_driver(driver_token):
    r = requests.get(f"{API}/settlements", headers=auth(driver_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "items" in d and "totals" in d and "connections" in d
    assert "stripe" in d["connections"] and "quickbooks" in d["connections"]
    assert isinstance(d["items"], list) and len(d["items"]) > 0
    assert "broker" in d["items"][0]


def test_settlements_broker(broker_token):
    r = requests.get(f"{API}/settlements", headers=auth(broker_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d["items"], list) and len(d["items"]) > 0
    assert "carrier" in d["items"][0]
    assert "margin_usd" in d["items"][0]


# --------------------------- WebSocket dispatch ---------------------------
@pytest.mark.asyncio
async def test_ws_dispatch_send_receive(driver_token):
    url = f"{WS_URL}?token={driver_token}"
    async with websockets.connect(url, open_timeout=10, close_timeout=5) as ws:
        # Drain initial / history messages briefly
        join_seen = False
        try:
            for _ in range(10):
                raw = await asyncio.wait_for(ws.recv(), timeout=2)
                msg = json.loads(raw)
                if msg.get("kind") == "system" and "joined dispatch" in msg.get("text", ""):
                    join_seen = True
                    break
        except asyncio.TimeoutError:
            pass
        assert join_seen, "system join message not received"

        await ws.send(json.dumps({"text": "roger that"}))

        # Receive broadcast back
        got_msg = None
        try:
            for _ in range(10):
                raw = await asyncio.wait_for(ws.recv(), timeout=4)
                msg = json.loads(raw)
                if msg.get("kind") == "msg" and msg.get("text") == "roger that":
                    got_msg = msg
                    break
        except asyncio.TimeoutError:
            pass
        assert got_msg is not None, "echoed msg not received"
        assert got_msg.get("from")  # user_name should be present
