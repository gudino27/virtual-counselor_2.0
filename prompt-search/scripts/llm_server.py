"""
FastAPI RAG wrapper — retrieves context then calls llama.cpp server for inference.
Express backend calls /advise; this service calls ghcr.io/ggml-org/llama.cpp:server-cuda.
"""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

LLAMACPP_URL = os.getenv("LLAMACPP_URL", "http://llamacpp:8081")
INDEX_DIR    = os.getenv("INDEX_DIR", str(Path(__file__).resolve().parent / "data" / "domain"))

DEGREE_KEYWORDS = {"degree", "graduation", "graduate", "credits remaining", "credits completed",
                   "how many credits", "requirements left", "finish my degree", "on track",
                   "semester remaining", "semesters left", "progress"}
UCORE_KEYWORDS  = {"ucore", "general education", "gen ed", "core requirement", "writing in major"}

app = FastAPI(title="VC RAG Wrapper")
_builder = None


def get_builder():
    global _builder
    if _builder is None:
        from retrieval.retriever import CourseRetriever
        from retrieval.context_builder import ContextBuilder
        _builder = ContextBuilder(CourseRetriever(index_dir=INDEX_DIR), top_k=3, few_shot_n=2)
    return _builder


class AdviseRequest(BaseModel):
    question: str
    student_context: Optional[dict] = {}
    max_tokens: int = 400


class AdviseResponse(BaseModel):
    answer: str
    sources: list
    model: str


@app.get("/health")
def health():
    return {"status": "ok", "llamacpp_url": LLAMACPP_URL}


@app.post("/advise", response_model=AdviseResponse)
def advise(req: AdviseRequest):
    try:
        q = req.question.lower()
        needs_ctx = any(kw in q for kw in DEGREE_KEYWORDS) or any(kw in q for kw in UCORE_KEYWORDS)

        student_block = ""
        if needs_ctx and req.student_context:
            completed = req.student_context.get("completed_courses", [])
            credits   = req.student_context.get("credits_completed", 0)
            major     = req.student_context.get("major", "")
            if completed:
                student_block += f"Student completed courses: {', '.join(completed)}\n"
            if credits:
                student_block += f"Credits completed: {credits}\n"
            if major and major != "Undeclared":
                student_block += f"Student major: {major}\n"

        builder = get_builder()
        system_prompt, sources = builder.build(req.question, base_prompt=student_block)

        # Use chat completions endpoint so the instruct model applies its template correctly
        response = httpx.post(
            f"{LLAMACPP_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": req.question},
                ],
                "max_tokens": min(req.max_tokens, 300),
                "temperature": 0.0,
                "stop": ["###"],
            },
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        answer = data["choices"][0]["message"]["content"].strip()
        model  = data.get("model", "llama.cpp")
        source_codes = [s.get("course_code", "") for s in sources]

        return AdviseResponse(answer=answer, sources=source_codes, model=model)
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"llama.cpp server unreachable: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
