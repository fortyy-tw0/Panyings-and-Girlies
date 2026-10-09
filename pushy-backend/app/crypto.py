"""Field-level encryption helpers.

Sensitive columns (note text, sexual-activity payloads, reminder text) are
AES-256-GCM encrypted. The field-encryption key is a random master key kept in
data/pushy.key (baseline machine-bound approach; can later be wrapped by a
passphrase-derived key when app lock is enabled). Backups always use a
passphrase-derived key via derive_key().
"""

import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from . import db

SCRYPT_N = 2**15
SCRYPT_R = 8
SCRYPT_P = 1


def derive_key(passphrase: str, salt: bytes) -> bytes:
    kdf = Scrypt(salt=salt, length=32, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P)
    return kdf.derive(passphrase.encode("utf-8"))


def hash_passphrase(passphrase: str, salt: bytes = None) -> str:
    salt = salt or os.urandom(16)
    dk = derive_key(passphrase, salt)
    return f"{salt.hex()}:{dk.hex()}"


def verify_passphrase(passphrase: str, stored: str) -> bool:
    salt_hex, dk_hex = stored.split(":")
    try:
        return derive_key(passphrase, bytes.fromhex(salt_hex)).hex() == dk_hex
    except (ValueError, Exception):
        return False


def encrypt(key: bytes, data: bytes) -> tuple[bytes, bytes]:
    nonce = os.urandom(12)
    return nonce, AESGCM(key).encrypt(nonce, data, None)


def decrypt(key: bytes, nonce: bytes, ct: bytes) -> bytes:
    return AESGCM(key).decrypt(nonce, ct, None)


def encrypt_text(key: bytes, text: str) -> tuple[bytes, bytes]:
    return encrypt(key, text.encode("utf-8"))


def decrypt_text(key: bytes, nonce: bytes, ct: bytes) -> str:
    return decrypt(key, nonce, ct).decode("utf-8")


def app_key() -> bytes:
    path = db.key_path()
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read()
    os.makedirs(db.data_dir(), exist_ok=True)
    key = os.urandom(32)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(key)
    return key


class WrongPassphrase(Exception):
    pass


def decrypt_or_raise(key: bytes, nonce: bytes, ct: bytes) -> bytes:
    try:
        return decrypt(key, nonce, ct)
    except InvalidTag:
        raise WrongPassphrase("wrong passphrase or corrupted backup")
