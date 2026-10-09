from collections.abc import Generator
from sqlite3 import Connection

from .. import db


def get_conn() -> Generator[Connection, None, None]:
    conn = db.connect()
    try:
        yield conn
    finally:
        conn.close()
