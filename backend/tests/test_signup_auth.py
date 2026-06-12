"""Iteration 5 — POST /api/auth/signup + login regression + /auth/me for both demo and DB users.

Cleanup: drops all db.users docs whose email contains 'test' at session end.
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="session")
def mongo_db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    # cleanup any test users from this session
    c[DB_NAME].users.delete_many({"email": {"$regex": "test", "$options": "i"}})
    c.close()


@pytest.fixture
def unique_email():
    return f"signuptest+{int(time.time()*1000)}@jadeos.com"


# -------- Signup endpoint ----------
class TestSignup:
    def test_signup_valid_payload(self, unique_email, mongo_db):
        r = requests.post(f"{API}/auth/signup", json={
            "email": unique_email,
            "password": "secret123",
            "name": "Test User",
            "role": "driver",
            "callsign": "TST-01",
            "license": "TX-CDL-TEST"
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and isinstance(body["token"], str) and len(body["token"]) > 20
        u = body["user"]
        assert u["email"] == unique_email
        assert u["name"] == "Test User"
        assert u["role"] == "driver"
        assert u["callsign"] == "TST-01"
        # password fields must not leak
        assert "password" not in u and "password_hash" not in u

        # Persistence check + bcrypt hash format
        doc = mongo_db.users.find_one({"email": unique_email})
        assert doc is not None
        assert doc["password_hash"].startswith("$2b$"), "must be bcrypt-hashed"
        assert doc["password_hash"] != "secret123"

    def test_signup_duplicate_email_409(self, unique_email):
        payload = {"email": unique_email, "password": "secret123", "name": "X", "role": "driver"}
        r1 = requests.post(f"{API}/auth/signup", json=payload)
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{API}/auth/signup", json=payload)
        assert r2.status_code == 409, r2.text

    def test_signup_duplicate_demo_email_409(self):
        r = requests.post(f"{API}/auth/signup", json={
            "email": "driver@jadeos.com", "password": "abcdef", "name": "X", "role": "driver"})
        assert r.status_code == 409

    def test_signup_invalid_email_400(self):
        r = requests.post(f"{API}/auth/signup", json={
            "email": "notanemail", "password": "secret123", "name": "X", "role": "driver"})
        assert r.status_code == 400

    def test_signup_short_password_400(self, unique_email):
        r = requests.post(f"{API}/auth/signup", json={
            "email": unique_email, "password": "abc", "name": "X", "role": "driver"})
        assert r.status_code == 400

    def test_signup_invalid_role_400(self, unique_email):
        r = requests.post(f"{API}/auth/signup", json={
            "email": unique_email, "password": "secret123", "name": "X", "role": "admin"})
        assert r.status_code == 400


# -------- Login regression for demo users ----------
class TestLoginRegression:
    def test_demo_driver_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": "driver@jadeos.com", "password": "jade123"})
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["role"] == "driver"
        assert body["user"]["email"] == "driver@jadeos.com"

    def test_demo_broker_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": "broker@jadeos.com", "password": "jade123"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "broker"

    def test_demo_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login", json={"email": "driver@jadeos.com", "password": "wrong"})
        assert r.status_code == 401


# -------- Login via DB-backed user (bcrypt verify path) ----------
class TestDbBackedLogin:
    def test_signup_then_login(self, unique_email):
        r = requests.post(f"{API}/auth/signup", json={
            "email": unique_email, "password": "secret123", "name": "DB Test", "role": "broker"})
        assert r.status_code == 200

        r2 = requests.post(f"{API}/auth/login", json={
            "email": unique_email, "password": "secret123"})
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body["user"]["email"] == unique_email
        assert body["user"]["role"] == "broker"
        assert "token" in body

    def test_db_user_wrong_password_401(self, unique_email):
        requests.post(f"{API}/auth/signup", json={
            "email": unique_email, "password": "secret123", "name": "X", "role": "driver"})
        r = requests.post(f"{API}/auth/login", json={
            "email": unique_email, "password": "WRONGPASS"})
        assert r.status_code == 401


# -------- /auth/me for both demo + DB-backed users ----------
class TestAuthMe:
    def test_me_demo_token(self):
        login = requests.post(f"{API}/auth/login", json={"email": "driver@jadeos.com", "password": "jade123"})
        token = login.json()["token"]
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == "driver@jadeos.com"
        assert body["role"] == "driver"
        assert "password" not in body and "password_hash" not in body

    def test_me_db_token(self, unique_email):
        signup = requests.post(f"{API}/auth/signup", json={
            "email": unique_email, "password": "secret123", "name": "Me Test", "role": "broker"})
        token = signup.json()["token"]
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == unique_email
        assert body["role"] == "broker"
        assert body["name"] == "Me Test"
        assert "password_hash" not in body

    def test_me_missing_token_401(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# -------- face-api model assets served correctly ----------
class TestFaceModels:
    def test_tiny_face_detector_manifest(self):
        r = requests.get(f"{BASE_URL}/models/tiny_face_detector_model-weights_manifest.json")
        assert r.status_code == 200, f"face-api models must be public; got {r.status_code}"
