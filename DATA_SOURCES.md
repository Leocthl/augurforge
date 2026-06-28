# DATA_SOURCES.md

AugurForge needs **no proprietary data**. The Monte Carlo sim generates its own paths; real figures
are only for *credibility* (slider defaults) and one real artifact as the vision input.

## Bundled in this scaffold (`src/mock/`)
- **`sample-image.png`** — a **synthetic** loss-development triangle (cumulative paid, 000s),
  rendered programmatically for the Modeler vision demo. Replace with a **real** loss-triangle
  image before recording for full credibility (see CAS below).
- **`sample-spec.json`** — a reference `DashboardSpec` fixture (mirrors the Monte Carlo default).
- **GBM defaults** (σ=18%, μ=7%) — round, realistic equity-index figures; reseat from FRED/Yahoo for the demo.

## Public sources to pull for the demo (no proprietary numbers needed)
- **Asset returns / volatility (GBM hero):** S&P 500 / index via **FRED** (fred.stlouisfed.org) or Yahoo Finance — estimate real drift & σ.
- **Mortality / survival:** US **SSA** period life table (ssa.gov/oact) or **Human Mortality Database** (mortality.org).
- **Loss-development triangle (reserving + vision demo):** **CAS** loss-reserving database (casact.org) or the `CASdatasets` R package (Danish fire, French motor, Schedule P).
- **Yield curve:** US Treasury daily par yields (home.treasury.gov) or FRED (`DGS1`…`DGS30`).
- **Volatility index:** **VIX** via FRED.

Keep bundled slices lightweight. Record provenance for anything added here.