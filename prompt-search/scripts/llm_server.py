"""
FastAPI wrapper around llama-cpp-python with RAG pipeline.
Used by Express backend as a drop-in for Claude when LOCAL_MODEL_ENABLED=true.
"""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

MODEL_PATH = os.getenv("MODEL_PATH", "/models/llama-3.2-3b-instruct-q4_k_m.gguf")
GPU_LAYERS = int(os.getenv("GPU_LAYERS", "0"))
N_CTX      = int(os.getenv("N_CTX", "2048"))
N_THREADS  = int(os.getenv("N_THREADS", "4"))
INDEX_DIR  = os.getenv("INDEX_DIR", str(Path(__file__).resolve().parents[1] / "data" / "domain"))

DEGREE_KEYWORDS = {"degree", "graduation", "graduate", "credits remaining", "credits completed",
                   "how many credits", "requirements left", "finish my degree", "on track",
                   "semester remaining", "semesters left", "progress"}
UCORE_KEYWORDS  = {"ucore", "general education", "gen ed", "core requirement", "writing in major"}

app = FastAPI(title="VC Local LLM")
_llm = None
_builder = None


def get_llm():
    global _llm
    if _llm is None:
        from llama_cpp import Llama
        _llm = Llama(model_path=MODEL_PATH, n_ctx=N_CTX, n_threads=N_THREADS,
                     n_gpu_layers=GPU_LAYERS, verbose=False)
    return _llm


def get_builder():
    global _builder
    if _builder is None:
        from retrieval.retriever import CourseRetriever
        from retrieval.context_builder import ContextBuilder
        _builder = ContextBuilder(CourseRetriever(index_dir=INDEX_DIR), top_k=3)
    return _builder


class GenerateRequest(BaseModel):
    prompt: str
    max_tokens: int = 400
    temperature: float = 0.0


class GenerateResponse(BaseModel):
    text: str
    model: str
    tokens_used: int


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
    return {"status": "ok", "model": os.path.basename(MODEL_PATH), "gpu_layers": GPU_LAYERS}


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    try:
        llm = get_llm()
        out = llm(req.prompt, max_tokens=req.max_tokens, temperature=req.temperature,
                  stop=["</s>", "\n\nQuestion:", "###"])
        text = out["choices"][0]["text"].strip()
        return GenerateResponse(text=text, model=os.path.basename(MODEL_PATH),
                                tokens_used=out["usage"]["total_tokens"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/advise", response_model=AdviseResponse)
def advise(req: AdviseRequest):
    try:
        q = req.question.lower()
        needs_ctx = any(kw in q for kw in DEGREE_KEYWORDS) or any(kw in q for kw in UCORE_KEYWORDS)

        student_block = ""
        if needs_ctx and req.student_context:
            completed   = req.student_context.get("completed_courses", [])
            credits     = req.student_context.get("credits_completed", 0)
            major       = req.student_context.get("major", "")
            if completed:
                student_block += f"Student completed courses: {', '.join(completed)}\n"
            if credits:
                student_block += f"Credits completed: {credits}\n"
            if major and major != "Undeclared":
                student_block += f"Student major: {major}\n"

        builder = get_builder()
        prompt, sources = builder.build(req.question, base_prompt=student_block)

        llm = get_llm()
        out = llm(prompt, max_tokens=req.max_tokens, temperature=0.0,
                  stop=["</s>", "\n\nQuestion:", "###"])
        answer = out["choices"][0]["text"].strip()
        source_codes = [s.get("course_code", "") for s in sources]

        return AdviseResponse(answer=answer, sources=source_codes, model=os.path.basename(MODEL_PATH))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
