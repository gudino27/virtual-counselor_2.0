import hashlib
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional


class ResponseCache:
    def __init__(self, db_path: str = "./data/cache/responses.db", max_age_hours: int = 168):
        self._db_path = Path(db_path)
        self._max_age_hours = max_age_hours
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS responses (
                    prompt_hash TEXT NOT NULL,
                    model TEXT NOT NULL,
                    temperature REAL NOT NULL,
                    response TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (prompt_hash, model, temperature)
                )
            """)

    def _hash_prompt(self, prompt: str) -> str:
        return hashlib.sha256(prompt.encode()).hexdigest()

    def get(self, prompt: str, model: str, temperature: float) -> Optional[str]:
        prompt_hash = self._hash_prompt(prompt)
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=self._max_age_hours)).isoformat()

        with sqlite3.connect(self._db_path) as conn:
            row = conn.execute(
                """
                SELECT response FROM responses
                WHERE prompt_hash = ? AND model = ? AND temperature = ? AND created_at > ?
                """,
                (prompt_hash, model, temperature, cutoff),
            ).fetchone()

        return row[0] if row else None

    def set(self, prompt: str, model: str, temperature: float, response: str):
        prompt_hash = self._hash_prompt(prompt)
        created_at = datetime.now(timezone.utc).isoformat()

        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO responses (prompt_hash, model, temperature, response, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (prompt_hash, model, temperature, response, created_at),
            )

    def clear_expired(self):
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=self._max_age_hours)).isoformat()
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("DELETE FROM responses WHERE created_at <= ?", (cutoff,))

    def stats(self) -> dict:
        with sqlite3.connect(self._db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM responses").fetchone()[0]
        return {"total_entries": total, "db_path": str(self._db_path)}
