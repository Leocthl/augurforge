"""AugurForge render-service — Manim deep-path STUB. [OWNER: B]  TODO(branch: feat/manim)

A small FastAPI service that will render Manim animations to mp4 off the critical path
(LaTeX + FFmpeg). For the scaffold it only exposes a health check and a not-implemented
/manim endpoint so the contract + wiring exist before the real renderer lands.

Run:  uvicorn main:app --port 8000
"""
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="AugurForge render-service", version="0.1.0")


class ManimRequest(BaseModel):
    script: str
    quality: str = "low"


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "render-service", "manim": False}


@app.post("/manim", status_code=501)
def render_manim(_req: ManimRequest) -> dict:
    # TODO(branch: feat/manim): run Manim + LaTeX + FFmpeg, return {"url": "<mp4>"}.
    return {"error": "Manim rendering is not implemented in the scaffold.", "todo": "feat/manim"}