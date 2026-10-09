import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PUSHY_DATA_DIR", str(tmp_path))
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c
