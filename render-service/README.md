# render-service (Manim deep-path) — STUB

Off the critical path. The fast path (streaming panels + instant browser animation) is the
live demo; this service pre-renders polished Manim clips asynchronously and swaps them in
when ready. **Not implemented in the scaffold** — see `TODO(branch: feat/manim)`.

## Run (stub)
```bash
cd render-service
python -m venv .venv && . .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --port 8000
```

- `GET /health` → `{ ok: true, manim: false }`
- `POST /manim { script, quality }` → `501` until `feat/manim` lands.

The real version needs **Manim + LaTeX + FFmpeg** installed on the host.