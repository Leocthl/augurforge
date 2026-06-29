# DESIGN.md - AugurForge

## Scene Sentence

An actuary is reviewing a generated risk model on a laptop beside a projector during a fast hackathon demo, in normal indoor light, with judges watching for credible quantitative workflow and unmistakable Gemma 4 plus Cerebras proof.

This forces a light product UI with one dark simulation surface, not a dark dashboard.

## Visual Direction

Restrained product workbench. Soft light canvas, precise dark ink, quiet frosted panels, and a single blue accent for action, focus, and active state. The chart area may be dark because the simulation needs contrast and stage presence.

The UI should feel closer to SideKlick typography and Linear density than to a generated finance template.

## Typography

- Primary family: `Geist Variable`.
- Source: local file at `public/fonts/geist-latin-wght-normal.woff2`.
- Fallbacks: `Avenir Next`, `SF Pro Display`, `ui-sans-serif`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`.
- Headline weight: 520 to 590, never chunky.
- UI label weight: 620 to 680.
- Numeric metric weight: 650 to 700 with tabular numbers.
- Letter spacing is 0 for headings and body. Small uppercase labels may use 0.055em to 0.075em.
- Do not introduce display fonts, decorative serif headings, or monospace labels unless showing raw code or logs.

## Color Tokens

Use OKLCH tokens in CSS.

- Canvas: `--paper`, `--paper-2`, `--paper-3`, cool gray with slight blue tint.
- Ink: `--ink`, `--ink-soft`, `--ink-faint`.
- Panels: `--panel`, `--panel-strong`, `--panel-soft`, translucent only enough to separate layers.
- Stage dark: `--graphite`, `--chart`.
- Accent: `--blue`, used only for primary actions, focus, active state, TTFT and tokens per second, active agent state.
- Warning: `--amber`, used for generated badge and warning states.
- Success: `--green`, used for done/live states.
- Danger: `--red`, used for file errors, agent errors, and danger risk flags.

Do not return to lime/cyan neon, purple gradients, or navy/gold finance themes.

## Layout

- Left rail: fixed product identity, live/mock status, stack proof, demo moves, decision-support note.
- Main workspace: topbar, uploader/composer, parameter strip, chart viewport.
- Right rail: speed HUD, metrics, generated model panel, agent cascade, risk, explainer, sensitivity.
- Keep cards at 8px radius.
- No nested cards.
- Panels may be translucent, but they must not look like decorative glassmorphism. Use blur to clarify layered surfaces only.
- The chart viewport is the visual anchor. It can be dark, large, and framed.

## Component Rules

- Buttons: one primary style, one secondary style. Primary actions are dark graphite or blue, not gradients.
- Segmented controls: active state is a quiet raised white panel.
- Inputs: white or near-white with a visible border and clear focus ring.
- Range sliders: blue track, dark thumb, stable height.
- Agent chips: vertical list in the right rail, not a random cloud of pills.
- Metrics: compact tiles inside one Metrics panel, with strong numeric hierarchy.
- Generated model badge: amber, small, and artifact-like.

## Motion

- State transitions only: hover, press, panel reveal, streaming caret, race fill, generated chart draw.
- Duration: 120ms to 220ms for UI feedback.
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Avoid decorative page-load choreography.
- Respect `prefers-reduced-motion`.

## Copy Rules

- Say `Gemma 4` where intelligence is shown.
- Say `Cerebras` where speed is shown.
- Say `deterministic browser math` where generated models are shown.
- Keep `decision-support, not advice` visible but quiet.
- Prefer concrete verbs: generate, attach, tune, stream, compile, race.
- Avoid vague phrases like `AI-powered insights`, `unlock value`, or `revolutionary`.

## Accessibility And Responsiveness

- Text must meet contrast on translucent panels.
- Do not place body text on busy chart areas without a dark backing surface.
- At tablet width, collapse the right rail below the chart.
- At mobile width, uploader controls stack cleanly, chart height drops, metrics remain two columns.
- Focus visible state must be obvious on every interactive element.

## Absolute Bans

- Neon cockpit UI.
- Purple gradient text.
- Decorative glass cards everywhere.
- Beige SaaS cream page.
- Generic landing-page hero layout.
- Full-width card grids.
- Side accent stripes.
- Rounded pills for everything.
- Changing `src/core/contract.ts` for design reasons.
