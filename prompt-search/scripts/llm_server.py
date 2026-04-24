"""
Minimal FastAPI wrapper around llama-cpp-python.
Used by the Express backend as a drop-in replacement for the Claude Haiku API
when LOCAL_MODEL_ENABLED=true.
"""
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

MODEL_PATH  = os.getenv("MODEL_PATH", "/models/llama-3.2-3b-instruct-q4_k_m.gguf")
GPU_LAYERS  = int(os.getenv("GPU_LAYERS", "0"))
N_CTX       = int(os.getenv("N_CTX", "2048"))
N_THREADS   = int(os.getenv("N_THREADS", "4"))

app = FastAPI(title="VC Local LLM")
_llm = None


def get_llm():
    global _llm
    if _llm is None:
        from llama_cpp import Llama
        _llm = Llama(
            model_path=MODEL_PATH,
            n_ctx=N_CTX,
            n_threads=N_THREADS,
            n_gpu_layers=GPU_LAYERS,
            verbose=False,
        )
    return _llm


class GenerateRequest(BaseModel):
    prompt: str
    max_tokens: int = 400
    temperature: float = 0.0


class GenerateResponse(BaseModel):
    text: str
    model: str
    tokens_used: int


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
        tokens = out["usage"]["total_tokens"]
        return GenerateResponse(text=text, model=os.path.basename(MODEL_PATH), tokens_used=tokens)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
