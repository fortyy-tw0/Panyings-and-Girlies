import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


TEST_TOKEN = "test-token"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PUSHY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUSHY_API_TOKEN", TEST_TOKEN)
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        c.headers["Authorization"] = f"Bearer {TEST_TOKEN}"
        yield c
