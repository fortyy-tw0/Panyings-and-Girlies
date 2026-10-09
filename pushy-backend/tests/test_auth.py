import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_requests_require_bearer_token(client):
    del client.headers["Authorization"]
    r = client.get("/health")
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"


def test_wrong_token_rejected(client):
    client.headers["Authorization"] = "Bearer wrong"
    assert client.get("/periods").status_code == 401
