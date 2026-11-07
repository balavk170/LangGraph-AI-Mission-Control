"""FastAPI server for the LangGraph AI Mission Control application."""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
import uuid
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import platform_store
from backend.graph_runner import llm_available, run_workflow_steps, stream_workflow_steps

app = FastAPI(
    title="LangGraph AI Mission Control API",
    description="REST and SSE APIs for LangGraph workflows, session memory, and document retrieval.",
    version="3.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
MAX_INPUT_LENGTH = 2000
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024


class RunAgentRequest(BaseModel):
    prompt: Optional[str] = None
    input: Optional[str] = None
    user_input: Optional[str] = None
    name: Optional[str] = None
    session_id: Optional[str] = None
    run_id: Optional[str] = None


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        if data.strip():
            self.parts.append(data.strip())


def _validate_identifier(value: str | None, name: str) -> str | None:
    if value is None:
        return None
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{8,128}", value):
        raise HTTPException(status_code=400, detail=f"Invalid {name}.")
    return value


def _extract_document(filename: str, data: bytes) -> tuple[str, list[tuple[int | None, str]]]:
    extension = Path(filename).suffix.lower()
    if extension == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise ValueError("Encrypted PDFs are not supported.")
        return "application/pdf", [
            (index + 1, page.extract_text() or "") for index, page in enumerate(reader.pages)
        ]
    if extension not in {".txt", ".md", ".csv", ".json", ".html", ".htm"}:
        raise ValueError("Supported formats are PDF, TXT, Markdown, CSV, JSON, and HTML.")
    text = data.decode("utf-8-sig")
    if "\x00" in text:
        raise ValueError("The uploaded file is not valid UTF-8 text.")
    if extension in {".html", ".htm"}:
        parser = _TextExtractor()
        parser.feed(text)
        text = " ".join(parser.parts)
        content_type = "text/html"
    else:
        content_type = {
            ".md": "text/markdown",
            ".csv": "text/csv",
            ".json": "application/json",
        }.get(extension, "text/plain")
    return content_type, [(None, text)]


@app.get("/demo")
def demo_page():
    return FileResponse(os.path.join(frontend_dir, "dashboard.html"))


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/how-it-works")
def how_it_works_page():
    return FileResponse(os.path.join(frontend_dir, "how-it-works.html"))


@app.get("/architecture")
def architecture_page():
    return FileResponse(os.path.join(frontend_dir, "architecture.html"))


@app.get("/about")
def about_page():
    return FileResponse(os.path.join(frontend_dir, "about.html"))


@app.get("/analytics")
@app.get("/history")
@app.get("/execution-history")
@app.get("/knowledge-base")
@app.get("/settings")
@app.get("/agents")
@app.get("/memory")
@app.get("/tools")
def workspace_page():
    return FileResponse(os.path.join(frontend_dir, "workspace.html"))


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "LangGraph Mission Control API",
        "engine": "LangGraph StateGraph Engine",
        "version": app.version,
        "model_mode": "gemini-1.5-flash" if llm_available else "deterministic-fallback",
        "llm_configured": llm_available,
        "capabilities": {
            "sse_streaming": True,
            "persistent_memory": True,
            "knowledge_base_upload": True,
            "full_text_retrieval": True,
            "server_side_analytics": True,
            "external_tool_integrations": False,
            "human_approval": False,
        },
    }


@app.get("/api/analytics")
def analytics():
    return platform_store.get_analytics()


@app.get("/api/agent/history")
def agent_history(
    session_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    safe_session_id = _validate_identifier(session_id, "session_id")
    return {"runs": platform_store.list_runs(safe_session_id, limit, offset)}


@app.get("/api/agent/history/{run_id}")
def agent_history_item(run_id: str):
    run = platform_store.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Execution not found.")
    return run


@app.get("/api/memory/{session_id}")
def session_memory(session_id: str, limit: int = Query(20, ge=1, le=50)):
    safe_session_id = _validate_identifier(session_id, "session_id")
    return {"session_id": safe_session_id, "turns": platform_store.get_memory(safe_session_id, limit)}


@app.delete("/api/memory/{session_id}")
def clear_session_memory(session_id: str):
    safe_session_id = _validate_identifier(session_id, "session_id")
    deleted = platform_store.clear_memory(safe_session_id)
    return {"session_id": safe_session_id, "deleted_runs": deleted}


@app.get("/api/documents")
def documents():
    return {"documents": platform_store.list_documents()}


@app.post("/api/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    filename = Path(file.filename or "").name.strip()
    if not filename or filename in {".", ".."}:
        raise HTTPException(status_code=400, detail="A valid document filename is required.")
    data = await file.read(MAX_DOCUMENT_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded document is empty.")
    if len(data) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="Documents must be 10 MB or smaller.")
    try:
        content_type, pages = _extract_document(filename, data)
        result = platform_store.add_document(
            str(uuid.uuid4()), filename, content_type, len(data), pages
        )
        return {"status": "indexed", "document": result}
    except (UnicodeDecodeError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("Document indexing failed for %s.", filename)
        raise HTTPException(status_code=500, detail="The document could not be indexed.") from error


@app.delete("/api/documents/{document_id}")
def remove_document(document_id: str):
    if not platform_store.delete_document(document_id):
        raise HTTPException(status_code=404, detail="Document not found.")
    return {"status": "deleted", "id": document_id}


@app.get("/api/knowledge/search")
def search_knowledge(
    q: str = Query(..., min_length=1, max_length=1000),
    limit: int = Query(5, ge=1, le=8),
):
    results = platform_store.search_documents(q, limit)
    return {"query": q, "count": len(results), "results": results}


@app.post("/api/agent/run")
@app.post("/api/run-agent")
def run_agent(req: RunAgentRequest):
    query = (req.prompt or req.input or req.user_input or req.name or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Request input text cannot be empty.")
    if len(query) > MAX_INPUT_LENGTH:
        raise HTTPException(status_code=400, detail="Input too long. Maximum 2000 characters.")
    session_id = _validate_identifier(req.session_id, "session_id") or str(uuid.uuid4())
    run_id = _validate_identifier(req.run_id, "run_id") or str(uuid.uuid4())
    started_at = time.perf_counter()
    try:
        steps = run_workflow_steps(query, session_id)
        duration_ms = round((time.perf_counter() - started_at) * 1000)
        run = platform_store.save_run(run_id, session_id, query, steps, duration_ms)
        return {
            "status": "success",
            "input": query,
            "session_id": session_id,
            "total_steps": len(steps),
            "steps": steps,
            "run": run,
        }
    except Exception as error:
        logger.exception("Graph execution or persistence failed.")
        try:
            platform_store.save_run(
                run_id,
                session_id,
                query,
                [],
                round((time.perf_counter() - started_at) * 1000),
                status="failed",
            )
        except Exception:
            logger.exception("Failed to persist the unsuccessful workflow run.")
        raise HTTPException(status_code=500, detail="The workflow could not be completed.") from error


@app.get("/api/agent/stream")
async def stream_agent(
    prompt: Optional[str] = Query(None, description="Natural language prompt"),
    input: Optional[str] = Query(None, description="Alternative input parameter"),
    name: Optional[str] = Query(None, description="Legacy input parameter"),
    session_id: Optional[str] = Query(None),
    run_id: Optional[str] = Query(None),
):
    query = (prompt or input or name or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Prompt parameter is required.")
    if len(query) > MAX_INPUT_LENGTH:
        raise HTTPException(status_code=400, detail="Input too long. Maximum 2000 characters.")
    safe_session_id = _validate_identifier(session_id, "session_id") or str(uuid.uuid4())
    safe_run_id = _validate_identifier(run_id, "run_id") or str(uuid.uuid4())

    def event_generator():
        started_at = time.perf_counter()
        steps: list[dict[str, object]] = []
        try:
            for step in stream_workflow_steps(query, safe_session_id):
                step["run_id"] = safe_run_id
                steps.append(step)
                if step.get("node") == "END":
                    duration_ms = round((time.perf_counter() - started_at) * 1000)
                    platform_store.save_run(safe_run_id, safe_session_id, query, steps, duration_ms)
                yield f"data: {json.dumps(step, ensure_ascii=False)}\n\n"
        except Exception:
            logger.exception("SSE workflow failed.")
            try:
                platform_store.save_run(
                    safe_run_id,
                    safe_session_id,
                    query,
                    steps,
                    round((time.perf_counter() - started_at) * 1000),
                    status="failed",
                )
            except Exception:
                logger.exception("Failed to persist the unsuccessful streamed run.")
            yield f"data: {json.dumps({'error': 'The workflow could not be completed.'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
