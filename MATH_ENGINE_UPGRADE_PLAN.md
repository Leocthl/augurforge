# Math Engine Upgrade Plan

## Goal

Move AugurForge from a coherent demo model to a credible quantitative sandbox.

The target is not "production financial advice." The target is a browser-based engine whose assumptions, numerics, calibration path, and uncertainty are clear enough that an actuary or quant can inspect the result, understand what is being simulated, and decide whether it is a useful exploration model.

## Current State

The shipped engine has two real math paths:

- `src/templates/monte-carlo.ts`: single-asset GBM portfolio ruin simulation.
- `src/core/generative.ts`: deterministic no-dividend European Black-Scholes pricing.

Known limitations:

- Monte Carlo uses one asset, constant drift, constant volatility, fixed barrier, and a fixed seeded path set.
- Path monitoring is grid-based, currently monthly.
- There is no calibration from uploaded data yet.
- Tail behavior is Gaussian/lognormal only.
- No portfolio weights, correlations, cash flows, fees, or rebalancing.
- No Expected Shortfall, confidence intervals, backtesting, or audit trail.
- Rendered paths and simulated paths are coupled too tightly for larger simulations.

## Design Principles

1. Keep deterministic arithmetic in the browser; agents interpret results but never invent metrics.
2. Separate numerical outputs from visualization samples.
3. Always expose assumptions beside the result.
4. Make each model family explicit: GBM, historical bootstrap, Student-t, jump diffusion, etc.
5. Prefer validated, inspectable formulas over black-box complexity.
6. Upgrade in layers so the demo remains shippable after every phase.

## Target Architecture

Create a small math package under `src/core/math/`:

```text
src/core/math/
  random.ts          seeded RNGs, normal/t generators, antithetic pairs
  statistics.ts      quantiles, ES, CI, drawdown, covariance, correlation
  calibration.ts     return parsing, annualization, parameter estimation
  gbm.ts             GBM simulation and Brownian bridge barrier correction
  portfolio.ts       weights, cash flows, rebalancing, path aggregation
  schemas.ts         model config and result metadata helpers
```

Then make templates thin orchestration layers:

- `src/templates/monte-carlo.ts` owns the dashboard spec and renderers.
- `src/core/math/*` owns the numerical truth.
- `SimResult.raw` carries audit metadata: model kind, assumptions, seed, step size, path count, calibration window, and confidence intervals.

## Phase 1: Credible Single-Asset Monte Carlo

Scope:

- Move current GBM math into `src/core/math/gbm.ts`.
- Increase default simulation to daily steps and at least 10,000 paths.
- Use antithetic variates to reduce Monte Carlo noise.
- Keep rendered sample paths capped, for example 100 to 250 paths, while metrics use the full path set.
- Add Brownian bridge barrier crossing correction for GBM between time steps.
- Add metrics:
  - probability of ruin
  - 95% VaR
  - 99% VaR
  - 95% Expected Shortfall
  - median terminal value
  - max drawdown percentile
  - median time to ruin for breached paths
- Add uncertainty:
  - binomial confidence interval for ruin probability
  - bootstrap or asymptotic interval for VaR/ES where practical
- Keep seeded reproducibility.

Brownian bridge note:

For log-value `X = log(S)` with barrier `b = log(B)`, if both endpoints are above the barrier, approximate the conditional crossing probability over one step as:

```text
p_cross = exp(-2 * (x0 - b) * (x1 - b) / (sigma^2 * dt))
```

This avoids pretending a daily/monthly grid is continuous monitoring.

Acceptance criteria:

- Same input and seed produce identical metrics.
- Increasing volatility generally increases VaR, ES, and ruin probability in a fixed-seed sweep.
- Increasing drift generally increases median terminal value.
- With volatility near zero, terminal value is close to deterministic compounding.
- Build passes and the chart remains interactive.

## Phase 2: Calibration From Uploaded Data

Scope:

- Parse uploaded return series from CSV/text/JSON summaries.
- Support price series and return series.
- Convert prices to log returns.
- Estimate:
  - annualized drift
  - annualized volatility
  - historical drawdown
  - sample size
  - date window, when available
- Add robust warnings for insufficient data.
- Surface calibration metadata in the UI and risk agent context.

Annualization conventions:

- Daily returns: 252 trading days.
- Monthly returns: 12 periods.
- User-provided period metadata overrides inference.

Acceptance criteria:

- Known synthetic GBM sample estimates recover approximately the input drift/vol over large samples.
- Bad data does not silently produce metrics.
- Calibration assumptions appear in `SimResult.raw`.

## Phase 3: Portfolio Simulation

Scope:

- Add multiple assets, weights, and correlation/covariance.
- Use Cholesky decomposition for correlated normal draws.
- Add optional rebalancing:
  - never
  - monthly
  - quarterly
  - annually
- Add optional cash flows:
  - fixed contribution
  - fixed withdrawal
  - inflation-adjusted withdrawal
- Add fees and expense drag.
- Add portfolio-level metrics:
  - terminal distribution
  - pathwise max drawdown
  - ruin probability against a floor
  - probability of failing withdrawal plan
  - contribution to risk by asset, initially approximate

Acceptance criteria:

- Perfectly correlated assets behave like a weighted single asset.
- Zero-weight assets do not affect results.
- Rebalancing changes path outcomes when asset returns diverge.

## Phase 4: More Realistic Return Models

Add selectable model families rather than replacing GBM.

Initial set:

- GBM: transparent baseline.
- Historical bootstrap: resample observed returns with block bootstrap option.
- Student-t returns: heavier tails with estimated or user-selected degrees of freedom.
- Jump diffusion: Poisson jumps with jump mean and jump volatility.

Later set:

- Regime switching: high/low volatility states.
- GARCH-style volatility update.
- Heston or stochastic volatility for option-oriented demos.

Acceptance criteria:

- Model selection is explicit in the UI.
- Each model emits assumptions and parameter metadata.
- Risk panel does not compare unlike models without saying so.

## Phase 5: Black-Scholes Upgrade Path

Current Black-Scholes is correct for a no-dividend European option. Improve it without pretending it handles all options.

Scope:

- Add dividend yield `q`.
- Add full Greeks:
  - call/put delta
  - gamma
  - vega
  - theta
  - rho
- Add put-call parity check in raw output.
- Add implied volatility solver from target option price.
- Add warning when parameters are outside normal interpretive range.
- Optional later: binomial tree for American exercise.

Acceptance criteria:

- Put-call parity residual is near zero for no-arbitrage inputs.
- Greeks match finite-difference checks within tolerance.
- Dividend yield affects call/put prices in the expected direction.

## Phase 6: Performance And Runtime Shape

Scope:

- Run heavy simulations in a Web Worker.
- Use typed arrays for path storage and terminal distributions.
- Decouple metrics paths from render paths.
- Stream partial progress for long runs.
- Cache random draws per seed/model where useful.
- Keep slider drag responsive by recomputing visual previews cheaply and full metrics on release.

Targets:

- 10,000 daily paths for 30 years should complete fast enough for slider-release interaction.
- The UI should stay responsive during simulation.
- 2D/3D renderers should never receive the full path matrix when a sample is enough.

## Phase 7: Validation And Tests

Add a real test harness. Vitest is the obvious fit for this Vite/TypeScript repo.

Test categories:

- Determinism tests for seeded simulation.
- Statistical sanity tests for GBM moments.
- Quantile and ES unit tests.
- Brownian bridge barrier monotonicity tests.
- Portfolio covariance/correlation tests.
- Black-Scholes known-value and parity tests.
- Finite-difference Greek checks.
- Regression snapshots for default metrics.

Useful command targets:

```text
npm run typecheck
npm run test
npm run build
```

## UI And Agent Changes

UI should expose:

- model family
- path count
- time step
- seed
- calibration source
- assumptions
- confidence intervals
- rendered path sample count versus full metric path count

Agents should receive:

- `templateId`
- params
- metrics
- model assumptions
- calibration metadata
- uncertainty metadata

Risk agent rules:

- Never call a metric a regulatory breach unless an explicit regulatory calculation exists.
- Distinguish scenario risk, model risk, and calibration risk.
- Cite "internal demo threshold" only for demo thresholds.
- Preserve "decision-support, not advice."

## Suggested First Implementation Slice

Do this first:

1. Add `src/core/math/random.ts`, `statistics.ts`, and `gbm.ts`.
2. Move current Monte Carlo math into `gbm.ts`.
3. Add daily steps, 10,000 paths, antithetic variates, Brownian bridge ruin correction, VaR/ES, and confidence intervals.
4. Keep renderers unchanged by returning a sampled `paths` array plus full terminal/raw arrays.
5. Add Vitest and focused unit tests for statistics, Black-Scholes, and GBM determinism.
6. Update labels and risk copy to mention the upgraded assumptions.

This slice gives the largest credibility gain with the smallest product disruption.

## Out Of Scope For Now

- Replacing governed actuarial reserving systems.
- Claiming Solvency II SCR compliance.
- Intraday trading/risk engines.
- Exotic option pricing beyond a clearly marked later extension.
- Live market data ingestion unless explicitly added and sourced.

