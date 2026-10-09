import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import crypto


def test_roundtrip():
    key = crypto.derive_key("correct horse", b"somesalt12345678")
    nonce, ct = crypto.encrypt_text(key, "sensitive note")
    assert crypto.decrypt_text(key, nonce, ct) == "sensitive note"
    assert b"sensitive" not in ct


def test_wrong_key_fails():
    key = crypto.derive_key("a", b"somesalt12345678")
    other = crypto.derive_key("b", b"somesalt12345678")
    nonce, ct = crypto.encrypt_text(key, "secret")
    with pytest.raises(Exception):
        crypto.decrypt_text(other, nonce, ct)


def test_passphrase_hash_verify():
    stored = crypto.hash_passphrase("pin1234")
    assert crypto.verify_passphrase("pin1234", stored)
    assert not crypto.verify_passphrase("pin1235", stored)


def test_app_key_persists(tmp_path, monkeypatch):
    monkeypatch.setenv("PUSHY_DATA_DIR", str(tmp_path))
    k1 = crypto.app_key()
    k2 = crypto.app_key()
    assert k1 == k2 and len(k1) == 32
