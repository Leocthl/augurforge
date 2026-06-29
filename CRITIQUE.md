# AugurForge Track 1 Win Notes

Track focus: **Track 1 - Multiverse Agents** for product work. The three Discord submissions still stand:
Multiverse Agents, People's Choice/X post, and Enterprise Impact.

Updated stance: pretend the judge has five minutes, has seen a dozen AI dashboards, and is actively looking for signs that this is mocked, hardcoded, or merely prompt-wrapped. The project wins only if the judge can see Gemma 4 reasoning over real input and Cerebras making a multi-step agent loop feel usable.

## Source Check

As of 2026-06-29, current public Cerebras docs create a live-demo risk that the app must handle honestly:

- `gemma-4-31b` is listed in the Cerebras model catalog as a preview/coming-soon model with roughly 1850 tokens/s.
- The Gemma 4 31B page says the model is built for multimodal reasoning over screenshots, documents, diagrams, and design assets, but also says it is coming soon.
- Cerebras image input is private preview, currently only available with `gemma-4-31b`, uses base64 image data URIs, and has tier-specific image payload limits.
- Cerebras structured outputs support strict schema mode, but strict mode requires `additionalProperties: false` for every object.
- Cerebras free-trial rate limits for `gemma-4-31b` are tight enough that a six-call cascade can fail quickly; developer tier is much more demo-friendly.

Sources to re-check before recording:
https://inference-docs.cerebras.ai/models/overview
https://inference-docs.cerebras.ai/models/gemma-4-31b
https://inference-docs.cerebras.ai/capabilities/image-inputs
https://inference-docs.cerebras.ai/capabilities/structured-outputs
https://inference-docs.cerebras.ai/support/rate-limits

If the hackathon grants private access that differs from public docs, say that in the demo surface. Do not imply general public availability unless it is true at demo time.

## Winning Standard

> Judges must immediately see a Gemma 4 multi-agent system using multimodal input, and Cerebras must be the reason the loop feels fast enough to use.

If a feature does not make Gemma 4, multimodality, agents, or Cerebras speed more obvious, it is not a priority.

The brutal one-line verdict right now:

> This is a polished actuarial workbench with promising AI plumbing, but it does not yet force a skeptical judge to believe the intelligence is live, multimodal, agentic, and Cerebras-powered.

That is fixable. The next work should turn hidden pipeline events into visible proof.

## What Exists Today

- A serious, good-looking workbench with Monte Carlo GBM in 2D/3D, sliders, risk flags, streamed explanation, and a generated Black-Scholes path.
- A proxy that keeps `CEREBRAS_API_KEY` server-side and forwards OpenAI-compatible `/chat/completions` calls.
- A six-agent pipeline: orchestrator -> modeler -> visualizer, then sensitivity/risk/explainer in parallel.
- A multimodal path in code: `Uploader` reads an image as a base64 data URI and `modeler.ts` sends it as an `image_url` content part.
- A safe generated-model path: Gemma produces a declarative spec, and the browser compiles only known deterministic Black-Scholes math.
- A speed HUD with latest TTFT/tokens-per-second and a Cerebras-vs-baseline race.
- A useful mock image already exists: `src/mock/sample-image.png` is a loss development triangle, which is exactly the kind of actuarial visual that should make Gemma 4's vision capability obvious.

## Hard Critique Of What Exists

1. **The project still reads as "AI-labeled dashboard" before it reads as "Gemma 4 agent system."**

The UI says "6 Gemma agents," but the visible proof is mostly status chips and final prose. A judge can reasonably assume the labels are decorative because they do not see each agent's intermediate work.

What would convince them: each agent leaves a receipt with one concrete artifact: route, image evidence, generated sliders, chosen view, risk threshold, explanation angle.

2. **The live model claim is fragile.**

The repo pins `gemma-4-31b`, but public Cerebras docs currently mark it as coming soon. If live private hackathon access exists, great; the app should show "private preview access: ok" or "live model unavailable: mock rehearsal" instead of silently pretending.

What would convince them: a health strip that distinguishes "key present," "model reachable," "structured output ok," "streaming ok," and "image input ok."

3. **The image path exists technically, but not narratively.**

`Uploader` can attach an image and `modeler.ts` sends it. But the app does not show what Gemma saw in the image. If the chart changes nothing visible, the multimodal requirement looks satisfied only in code, not in the demo.

What would convince them: with `sample-image.png`, the modeler should visibly say things like "detected loss development triangle," "AY rows 2018-2024," "development periods 0-7," "cumulative paid values," and "missing upper-right cells."

4. **The current sample image is strong, but underused.**

The loss triangle is much better than a generic chart. It is domain-specific, image-heavy, and hard to hand-wave. But the UI does not offer a one-click scripted "Use loss triangle" path, and the modeler does not emit triangle-specific evidence.

What would convince them: a demo button that injects the sample image and runs the modeler, then displays a vision evidence panel before rendering any chart.

5. **The generated model path can look hardcoded.**

Black-Scholes is a smart safe runtime, but because it appears as a button and fallback, a judge may think the whole generated model is prebuilt. The app needs to show the handoff: user request -> Gemma 4 declarative spec -> validator -> deterministic runtime -> rendered sandbox.

What would convince them: a "Generated spec" panel with the actual fields Gemma produced, a validation status, and a clear note when the fallback spec was used.

6. **Cerebras speed is not yet proven by the right workload.**

Slider updates are browser math. They are fast, but they do not prove Cerebras. The current race asks for one sentence, which is too trivial. The speed claim should be tied to the multi-agent cascade: route, read image, produce spec, flag risk, stream explanation.

What would convince them: a waterfall of per-agent timings and a race that performs a real mini-cascade, not a sentence completion.

7. **`latestTime` hides the cascade.**

`App.tsx` stores only the latest `TimeInfo`. That makes the HUD feel like a single-call benchmark, not a multi-hop system. It also loses the most important claim: several model calls can complete fast enough to preserve flow.

What would convince them: a table or compact waterfall with six rows, TTFT, total ms, tokens/s, and a total wall-clock.

8. **The structured-output path is still a live-demo trap.**

`shared.ts` currently sets `strict: false`. That may be useful for forgiving parsing, but it weakens the "reliable agentic workflow" proof. The plan already mentions `response_format` 400s; this needs to become a first-class fallback path with visible labeling.

What would convince them: strict schema where supported, one retry without `response_format` when Cerebras rejects it, local JSON repair, and a visible "fallback used" badge.

9. **The schema surface should be reviewed against current strict-mode rules.**

The local schema helper sets `additionalProperties: false`, which is good, but strict mode requires every nested object to follow that rule. It also has schema size/depth constraints. The generated-spec schema is not huge, but it should be measured and live-smoked.

What would convince them: a `npm run smoke:live` or proxy endpoint that tests orchestrator/modeler/visualizer/risk schemas and prints pass/fail.

10. **Rate limits can kill the exact demo this project wants to show.**

The code spaces live calls at 650 ms, roughly 92 RPM. That is not safe for a free-trial `gemma-4-31b` tier if the public rate-limit table applies. A six-agent cascade plus retries plus speed race can hit limits quickly.

What would convince them: detect/report rate-limit headers, use a "free tier safe" demo mode, and avoid running the speed race right before the main cascade unless the account tier supports it.

11. **The image size limits do not match all tiers.**

`Uploader` accepts images under 6 MB and the proxy body limit is 12 MB. Public docs list lower image limits for free trial and higher limits for developer tier. A judge's uploaded screenshot could be accepted by the browser and rejected upstream.

What would convince them: client-side resize/compress to a safe max, show encoded size, and report estimated image tokens or at least "image prepared for Gemma 4."

12. **The UI does not yet expose Gemma 4-specific strengths.**

Gemma 4's strongest story here is multimodal reasoning over screenshots/diagrams/documents. The app should not demo only a text prompt and a static Black-Scholes button. The first proof should involve a visual actuarial artifact.

What would convince them: start with the loss triangle image, not the Monte Carlo base case.

13. **The word "agents" needs behavioral evidence.**

Right now the pipeline is multi-call and sequential/parallel in code, but the UI does not explain the division of labor. Six labels are not agents. Six different decisions are agents.

What would convince them: show each agent has its own input, output, status, time, and consequence on the rendered model.

14. **The baseline speed race can backfire.**

If the baseline is simulated, a hard judge may discount the whole speed panel. The label currently says "GPU baseline sim," which is honest, but the main proof should not depend on a fake competitor.

What would convince them: prioritize absolute Cerebras waterfall timings for the real cascade. Keep the race secondary and clearly label baseline live/simulated.

15. **The deterministic browser math is a strength, but it can obscure the AI contribution.**

The math being local is the right safety design. But in the demo, the judge must see Gemma deciding the model shape before the browser computes. Otherwise the app can look like a normal charting tool with chat commentary.

What would convince them: a short "handoff ledger" that says which fields came from Gemma and which values came from deterministic runtime.

16. **There is not yet a signature moment.**

The current product is competent. Competent is not enough for a hackathon win. The signature moment should be:

> Drop in a messy loss triangle screenshot. Gemma 4 identifies the triangle, creates a model spec, AugurForge validates it, Cerebras completes the multi-agent loop in a visible waterfall, and the user can tune the resulting model immediately.

Everything else should serve that moment.

## Best Next Features

### 1. Live Health Strip And Smoke Probe

Goal: remove doubt about live vs mock before the judge even asks.

Implement:

- Extend `/api/health` to return model, key presence, baseline config, configured tier if known, and last smoke results.
- Add an optional `/api/smoke` endpoint or local script that performs:
  - tiny non-streaming call
  - tiny streaming call
  - structured-output call
  - image-input call using `src/mock/sample-image.png` or a tiny generated image
- Surface four badges in the app:
  - `gemma-4-31b: reachable/unavailable`
  - `structured: ok/fallback`
  - `streaming: ok`
  - `vision: ok/private-preview/unavailable`

Files: `server/proxy.ts`, `src/core/cerebras.ts`, `src/app/App.tsx`, `.env.example`, `package.json`.

Judge payoff: they know whether the demo is truly live, and the team looks honest instead of hand-wavy.

### 2. Agent Receipts

Goal: make every agent prove it did distinct work.

Implement a compact receipt under each cascade item:

- Orchestrator: routed path, reason, model family.
- Vision Modeler: visual evidence, mapped fields, generated sliders.
- Visualizer: selected views, title/subtitle rationale.
- Sensitivity: dominant driver and changed slider.
- Risk: top flag, threshold, reference.
- Explainer: audience mode and summary angle.

Fast path: derive receipts in `App.tsx` from existing `AgentEvent.result` without changing `contract.ts`.

Better path: add an optional `receipt?: string[]` or typed `evidence` fields to agent results if the contract can move.

Files: `src/app/App.tsx`, `src/core/agents/*`, `src/core/pipeline.ts`, optionally `src/core/contract.ts`.

Judge payoff: the cascade stops looking like labels and starts looking like a real chain of work.

### 3. Vision Evidence Chips

Goal: make multimodality visible in the first successful run.

Implement:

- Add `visionEvidence` to the modeler output or encode it into `mapping`.
- For the loss triangle sample, target chips like:
  - `loss development triangle`
  - `AY rows 2018-2024`
  - `development periods 0-7`
  - `cumulative paid`
  - `missing future cells`
- Display chips near the uploader and in the agent receipt.
- Add a one-click "Use loss triangle" demo path that attaches `src/mock/sample-image.png`.

Files: `src/app/Uploader.tsx`, `src/app/App.tsx`, `src/core/agents/modeler.ts`, `src/mock/sample-image.png`.

Judge payoff: the attached image changes the story, which is the whole multimodal proof.

### 4. Generated Spec Reveal

Goal: defeat the "this is just a prebuilt Black-Scholes button" objection.

Implement a small artifact panel that appears before or beside the chart:

- Prompt received.
- Gemma 4 generated spec fields:
  - `modelKind`
  - slider ids and defaults
  - metric names
  - explanation modes
  - mapping/evidence
- Validator result:
  - `accepted`
  - `repaired`
  - `fallback used`
- Runtime selected:
  - `deterministic Black-Scholes compiler`
  - `no generated JavaScript executed`

Files: `src/app/App.tsx`, `src/core/generative.ts`, `src/core/pipeline.ts`.

Judge payoff: Gemma looks like it generated an artifact, not just prose.

### 5. Cerebras Waterfall

Goal: prove Cerebras speed on the actual agent workflow.

Implement:

- Track timing per agent instead of only `latestTime`.
- Show rows:
  - Orchestrator
  - Vision Modeler
  - Visualizer
  - Sensitivity
  - Risk
  - Explainer
- For each row show TTFT, total ms, tokens/s if available, and fallback/live status.
- Show total cascade wall-clock separately from sum of calls so the parallel trio gets credit.

Files: `src/app/App.tsx`, `src/app/SpeedHud.tsx`, `src/core/contract.ts` if status metadata is needed.

Judge payoff: Cerebras becomes the reason multi-agent does not feel slow.

### 6. Race The Cascade, Not A Sentence

Goal: make the speed race meaningful enough to be respected.

Replace the current one-sentence race prompt with a compact agent task:

> Read this model request and image summary. Pick the model path, propose sliders, identify two risk flags, and write the first explanation sentence.

Run it against:

- Cerebras live `gemma-4-31b`, if reachable.
- Real baseline only if configured.
- Simulated baseline only if clearly labeled and visually secondary.

Files: `src/app/SpeedHud.tsx`, `server/proxy.ts`, `src/core/cerebras.ts`.

Judge payoff: the benchmark maps to the project, not to a generic latency stunt.

### 7. Strict Structured Output Plus Fallback

Goal: keep the live demo alive when `response_format` breaks.

Implement:

- Set `strict: true` for small schemas that pass validation.
- Keep `additionalProperties: false` on every nested object.
- If a structured call returns 400, retry once with:
  - no `response_format`
  - strong JSON-only instruction
  - local JSON repair
- If repair fails, use deterministic fallback and mark the receipt `fallback used`.
- Log but do not render raw provider errors unless they are helpful.

Files: `src/core/agents/shared.ts`, `src/core/cerebras.ts`, `src/core/agents/*`, `src/core/generative.ts`.

Judge payoff: the app survives provider edge cases and still tells the truth.

### 8. Rate-Limit-Aware Demo Mode

Goal: avoid failing live because the cascade is too ambitious for the tier.

Implement:

- Read rate-limit headers in `server/proxy.ts` and forward a small safe subset to the browser or `/api/health`.
- Add a "free-tier safe" mode that collapses some calls:
  - orchestrator + modeler can be one structured call for the scripted demo
  - sensitivity/risk/explainer can run only after the first render
- Disable the race if remaining request quota is low.

Files: `server/proxy.ts`, `src/core/cerebras.ts`, `src/core/pipeline.ts`, `src/app/SpeedHud.tsx`.

Judge payoff: fewer live-demo 429s.

### 9. Image Prep And Payload Honesty

Goal: make vision input reliable across tiers.

Implement:

- Resize/compress uploads before base64 encoding.
- Show `encoded size` and maybe `prepared for Gemma 4 vision`.
- For free-tier safe mode, keep under 4 MB; for developer tier, keep under 10 MB.
- Reject or downsample images likely to fail due to small text/rotation.
- Treat image text as untrusted input in prompts, because prompt injection can come from screenshots.

Files: `src/app/Uploader.tsx`, `src/core/agents/modeler.ts`, `server/proxy.ts`.

Judge payoff: image input feels robust, not like a fragile hidden trick.

### 10. Tool-Calling Proof

Goal: show agentic workflow in a way judges recognize.

Consider adding one live tool-call loop:

- Gemma 4 chooses `validate_model_spec`.
- The app executes the validator.
- Gemma 4 receives the validator result and writes the final modeling receipt.

This can be a small, scripted path. Do not rebuild the whole pipeline around tools unless time allows.

Files: `src/core/cerebras.ts`, `src/core/pipeline.ts`, `src/core/generative.ts`, `server/proxy.ts`.

Judge payoff: "agents" becomes more than multiple prompts; the model delegates to deterministic tools.

### 11. Demo Mode For Judges

Goal: make the first 60 seconds impossible to miss.

Add a `Judge demo` toggle or route:

- Preloads the loss triangle sample.
- Runs the cascade.
- Expands agent receipts by default.
- Shows the Cerebras waterfall.
- Opens the generated spec panel.
- Keeps mock/live labels visible.

Files: `src/app/App.tsx`, `src/app/Uploader.tsx`, routing if added.

Judge payoff: the best story is one click away.

### 12. Streaming UI Throttle

Goal: avoid UI jank at Cerebras speeds.

At high token throughput, setting React state for every tiny token chunk can become the bottleneck. Buffer streamed text and flush every 30-60 ms.

Files: `src/app/App.tsx`, maybe `src/core/cerebras.ts`.

Judge payoff: the app feels fast because the UI can keep up with the provider.

## Recommended Build Order

1. Re-check live access to `gemma-4-31b` and image preview. If unavailable, make the demo labels explicit.
2. Add live health strip and smoke probe.
3. Add per-agent timing state and the Cerebras waterfall.
4. Add agent receipts from existing results.
5. Add vision evidence chips and a one-click loss-triangle demo.
6. Add generated spec reveal with validator/fallback state.
7. Harden structured output with strict schemas plus retry/repair/fallback.
8. Replace the speed race prompt with a mini-cascade task.
9. Add image resize/compression and payload-size messaging.
10. Record a 60-second Track 1-only demo path.

## Track 1 Acceptance Gates

Before calling this competitive:

- Live state is honest: either `gemma-4-31b` is reachable, or the app visibly says private preview/public access is unavailable and uses mock rehearsal.
- One structured call succeeds or degrades cleanly.
- One streamed call succeeds.
- One image-input call succeeds, or the UI clearly says vision private preview is unavailable.
- The UI visibly shows six Gemma agents doing different work.
- Each agent has a receipt, not only a status chip.
- The UI visibly shows image evidence from the Vision Modeler.
- The generated model shows the spec -> validator -> runtime handoff.
- A generated non-Monte-Carlo model renders from pipeline state.
- Cerebras timing is visible as a cascade/waterfall, not hidden in a badge.
- Mock and simulated states are labeled honestly.
- The scripted demo can run twice in a row without rate-limit failure.

## Ideal 60-Second Judge Demo

1. Open Judge demo mode. The app shows `gemma-4-31b`, live/mock state, structured/streaming/vision status, and rate-limit state.
2. Click `Use loss triangle`.
3. Gemma Vision Modeler receipt appears with triangle-specific evidence.
4. Orchestrator receipt shows why the request routed to the model path.
5. Visualizer receipt shows the dashboard spec.
6. Generated spec/validated runtime panel appears before or beside the chart.
7. Cerebras waterfall fills row by row with TTFT and total time.
8. Risk and Explainer stream while the deterministic chart is already usable.
9. Move one slider. Browser math updates instantly; sensitivity/risk/explainer update after release.
10. Close with: "Gemma 4 read the messy visual and shaped the model; Cerebras made the agent loop fast enough to stay interactive."

## Hardest Judge Objections And Answers

- **"Is this just a template dashboard?"**
  Show the generated spec, validator result, and agent receipts.

- **"Where is Gemma 4 actually used?"**
  Show the health strip, model id, per-agent receipts, and live timings.

- **"Where is multimodality?"**
  Show the loss triangle evidence chips and modeler mapping.

- **"Why Cerebras?"**
  Show the multi-agent waterfall and total cascade wall-clock.

- **"Is the speed race fake?"**
  Say whether the baseline is live or simulated. Lead with Cerebras absolute timings, not the simulated comparison.

- **"Could this fail live?"**
  Show structured fallback, rate-limit awareness, and honest mode labels.

## Do Not Spend Time On

- Net-new Track 3 copy beyond the existing submission path.
- Net-new People's Choice/X-post copy beyond the existing submission path.
- Extra social submission text that does not strengthen the three planned Discord submissions.
- Editing Person B-owned templates or viz files unless needed for the judge demo.
- Production finance claims.
- More generic AI dashboard polish.
- New templates that do not strengthen Gemma 4, multimodality, agent receipts, or Cerebras speed.
