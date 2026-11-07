"""Small SQLite store for execution history, session memory, and local document retrieval."""

from __future__ import annotations

import json
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.getenv("MISSION_CONTROL_DB_PATH", str(ROOT / ".data" / "mission_control.sqlite3")))
MAX_SEARCH_RESULTS = 8


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 15000")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_store() -> None:
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                content_type TEXT NOT NULL,
                byte_size INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS document_chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                page INTEGER,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS document_search USING fts5(
                name UNINDEXED,
                content,
                tokenize='unicode61'
            );
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                input TEXT NOT NULL,
                intent TEXT,
                route TEXT,
                status TEXT NOT NULL,
                response TEXT,
                duration_ms INTEGER,
                tokens_used INTEGER,
                steps_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_conversations_session_created
                ON conversations(session_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_conversations_created
                ON conversations(created_at DESC);
            """
        )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _chunk_text(text: str, chunk_size: int = 1100, overlap: int = 140) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(len(normalized), start + chunk_size)
        if end < len(normalized):
            boundary = normalized.rfind(" ", start + chunk_size // 2, end)
            if boundary > start:
                end = boundary
        chunk = normalized[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(normalized):
            break
        start = max(start + 1, end - overlap)
    return chunks


def add_document(
    document_id: str,
    name: str,
    content_type: str,
    byte_size: int,
    pages: list[tuple[int | None, str]],
) -> dict[str, Any]:
    chunks = [
        (page, index, text)
        for page, page_text in pages
        for index, text in enumerate(_chunk_text(page_text))
    ]
    if not chunks:
        raise ValueError("The document contains no indexable text.")
    created_at = _now()
    with _connect() as connection:
        connection.execute(
            "INSERT INTO documents(id, name, content_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?)",
            (document_id, name, content_type, byte_size, created_at),
        )
        for page, index, text in chunks:
            cursor = connection.execute(
                "INSERT INTO document_chunks(document_id, page, chunk_index, content) VALUES (?, ?, ?, ?)",
                (document_id, page, index, text),
            )
            connection.execute(
                "INSERT INTO document_search(rowid, name, content) VALUES (?, ?, ?)",
                (cursor.lastrowid, name, text),
            )
    return {
        "id": document_id,
        "name": name,
        "content_type": content_type,
        "byte_size": byte_size,
        "chunk_count": len(chunks),
        "created_at": created_at,
    }


def list_documents() -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT d.id, d.name, d.content_type, d.byte_size, d.created_at,
                   COUNT(c.id) AS chunk_count
            FROM documents d
            LEFT JOIN document_chunks c ON c.document_id = d.id
            GROUP BY d.id
            ORDER BY d.created_at DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def delete_document(document_id: str) -> bool:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT id FROM document_chunks WHERE document_id = ?", (document_id,)
        ).fetchall()
        if not connection.execute("DELETE FROM documents WHERE id = ?", (document_id,)).rowcount:
            return False
        connection.executemany(
            "DELETE FROM document_search WHERE rowid = ?",
            [(row["id"],) for row in rows],
        )
    return True


def search_documents(query: str, limit: int = 5) -> list[dict[str, Any]]:
    terms = re.findall(r"[\w-]{2,}", query, flags=re.UNICODE)[:16]
    if not terms:
        return []
    match_query = " OR ".join(f'"{term.replace(chr(34), chr(34) * 2)}"' for term in terms)
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT c.document_id, d.name, c.page, c.chunk_index, c.content,
                   bm25(document_search) AS rank
            FROM document_search
            JOIN document_chunks c ON c.id = document_search.rowid
            JOIN documents d ON d.id = c.document_id
            WHERE document_search MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (match_query, min(max(limit, 1), MAX_SEARCH_RESULTS)),
        ).fetchall()
    return [
        {
            "document_id": row["document_id"],
            "document": row["name"],
            "page": row["page"],
            "chunk": row["chunk_index"],
            "text": row["content"],
            "score": round(abs(float(row["rank"])), 6),
        }
        for row in rows
    ]


def save_run(
    run_id: str,
    session_id: str,
    input_text: str,
    steps: list[dict[str, Any]],
    duration_ms: int,
    status: str = "success",
) -> dict[str, Any]:
    final_state = steps[-1].get("state", {}) if steps else {}
    summary = steps[-1].get("summary", {}) if steps else {}
    response = summary.get("final_response") or final_state.get("response") or ""
    tokens_used = final_state.get("tokens_used")
    created_at = _now()
    steps_json = json.dumps(steps, ensure_ascii=False, separators=(",", ":"))
    with _connect() as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO conversations
                (id, session_id, input, intent, route, status, response,
                 duration_ms, tokens_used, steps_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                session_id,
                input_text,
                final_state.get("intent"),
                final_state.get("selected_route"),
                status,
                response,
                max(0, int(duration_ms)),
                tokens_used if isinstance(tokens_used, int) else None,
                steps_json,
                created_at,
            ),
        )
    return {
        "id": run_id,
        "session_id": session_id,
        "input": input_text,
        "intent": final_state.get("intent"),
        "route": final_state.get("selected_route"),
        "status": status,
        "response": response,
        "duration_ms": max(0, int(duration_ms)),
        "tokens_used": tokens_used if isinstance(tokens_used, int) else None,
        "steps": steps,
        "created_at": created_at,
    }


def list_runs(
    session_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    bounded_limit = min(max(int(limit), 1), 500)
    bounded_offset = max(int(offset), 0)
    sql = "SELECT * FROM conversations"
    parameters: list[Any] = []
    if session_id:
        sql += " WHERE session_id = ?"
        parameters.append(session_id)
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    parameters.extend((bounded_limit, bounded_offset))
    with _connect() as connection:
        rows = connection.execute(sql, parameters).fetchall()
    return [_run_from_row(row) for row in rows]


def get_run(run_id: str) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT * FROM conversations WHERE id = ?", (run_id,)
        ).fetchone()
    return _run_from_row(row) if row else None


def _run_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "session_id": row["session_id"],
        "input": row["input"],
        "intent": row["intent"],
        "route": row["route"],
        "status": row["status"],
        "response": row["response"],
        "duration_ms": row["duration_ms"],
        "tokens_used": row["tokens_used"],
        "steps": json.loads(row["steps_json"]),
        "created_at": row["created_at"],
    }


def get_memory(session_id: str, limit: int = 10) -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, input, intent, route, response, created_at
            FROM conversations
            WHERE session_id = ? AND status = 'success'
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (session_id, min(max(limit, 1), 50)),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]


def clear_memory(session_id: str) -> int:
    with _connect() as connection:
        cursor = connection.execute(
            "DELETE FROM conversations WHERE session_id = ?", (session_id,)
        )
    return cursor.rowcount


def get_analytics() -> dict[str, Any]:
    with _connect() as connection:
        totals = connection.execute(
            """
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful,
                   SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failed,
                   AVG(CASE WHEN status = 'success' THEN duration_ms END) AS avg_latency_ms,
                   AVG(json_array_length(steps_json)) AS avg_steps,
                   SUM(tokens_used) AS tokens_used
            FROM conversations
            """
        ).fetchone()
        route_rows = connection.execute(
            """
            SELECT COALESCE(route, 'Unknown') AS route, COUNT(*) AS count
            FROM conversations
            WHERE status = 'success'
            GROUP BY route
            ORDER BY count DESC
            """
        ).fetchall()
        documents = connection.execute(
            "SELECT COUNT(*) AS count, COALESCE(SUM(byte_size), 0) AS bytes FROM documents"
        ).fetchone()
    total = int(totals["total"] or 0)
    successful = int(totals["successful"] or 0)
    failed = int(totals["failed"] or 0)
    return {
        "total_runs": total,
        "successful_runs": successful,
        "failed_runs": failed,
        "success_rate": round(successful / total, 4) if total else None,
        "failure_rate": round(failed / total, 4) if total else None,
        "avg_latency_ms": round(float(totals["avg_latency_ms"]), 2)
        if totals["avg_latency_ms"] is not None
        else None,
        "avg_steps": round(float(totals["avg_steps"]), 2)
        if totals["avg_steps"] is not None
        else None,
        "tokens_used": int(totals["tokens_used"]) if totals["tokens_used"] is not None else None,
        "routes": [dict(row) for row in route_rows],
        "most_used_route": route_rows[0]["route"] if route_rows else None,
        "documents": int(documents["count"]),
        "document_bytes": int(documents["bytes"]),
    }


initialize_store()
