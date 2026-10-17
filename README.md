# Data Science Portfolio Platform

One deployed site that holds many small DS/ML projects. Each project starts as a Jupyter notebook and ends up as its own interactive page on the site.

```
notebook + data  ──►  pipeline (Python)  ──►  web-ready assets (JSON / model)  ──►  page on the site
   (you write)         (precompute, export)        (committed to web/public)          (React)
```

The site is static (Vercel or GitHub Pages), so **no Python runs on a server**. Heavy work happens ahead of time in `pipeline/`. In the browser, the page either renders precomputed results or trains small models live with the built-in TypeScript ML engine (see "The ML lab" below).

---

## Repo structure

```
data-science-portfolio/
├── README.md                     ← this file
│
├── notebooks/                    ← YOUR work: the source of truth for each project
│   └── <slug>/
│       ├── notebook.ipynb
│       ├── data/                 ← raw data (small files only, see "Data rules")
│       └── NOTES.md              ← brief for turning it into an app (template below)
│
├── pipeline/                     ← Python that turns a notebook into web assets
│   ├── requirements.txt
│   └── <slug>/
│       └── build.py              ← cleans data, trains/exports model, writes to web/public/data/<slug>/
│
├── web/                          ← the platform itself (Vite + React + TypeScript)
│   ├── package.json
│   ├── vercel.json               ← SPA rewrites for Vercel
│   ├── scripts/bench.ts          ← sanity-checks the TS models against sklearn ballparks
│   ├── public/
│   │   └── data/<slug>/          ← generated output from pipeline (JSON, images); don't hand-edit
│   └── src/
│       ├── App.tsx               ← routing (one route per registered project)
│       ├── site.ts               ← your name, tagline, links
│       ├── pages/Home.tsx        ← project gallery (cards built from the registry)
│       ├── components/           ← shared UI: Card, Slider, StatTile, EChart wrapper, CodeBlock…
│       │   └── lab/              ← reusable ML lab: pipeline editor, results, sweeps, soil-map style decision map…
│       ├── lib/ml/               ← in-browser ML engine (preprocessing, 6 models, metrics, Web Worker, sklearn codegen)
│       └── projects/
│           ├── registry.ts       ← list of all projects; adding one here adds it to the home page + routing
│           └── <slug>/
│               ├── meta.ts       ← title, summary, tags, cover, highlight numbers
│               └── index.tsx     ← the interactive page
│
└── .github/workflows/deploy.yml  ← only if deploying to GitHub Pages
```

**One slug per project, used everywhere.** If the project is `movie_ratings`, it lives at `notebooks/movie_ratings/`, `pipeline/movie_ratings/`, `web/src/projects/movie_ratings/`, `web/public/data/movie_ratings/`, and is served at `/projects/movie_ratings`. Lowercase, words joined by `_` or `-`; just keep it identical in every folder.

---

## How a notebook becomes a web app

Each project uses one (or a mix) of three patterns. Pick the lightest one that does the job.

| Pattern | When to use | How it works | Cost in the browser |
|---|---|---|---|
| **1. Precomputed results** (default) | EDA, statistics, clustering, time series, anything where the user explores results | `build.py` computes aggregates/charts data → JSON. The page renders interactive charts with filters and toggles over that JSON. | Tiny, instant |
| **2. Exported model** | "Enter inputs → get a prediction" demos | Train in `build.py`, export to **ONNX** (`skl2onnx`) and run with `onnxruntime-web`. For linear/logistic models, exporting the coefficients to JSON is enough. | Small, instant |
| **3. Live ML lab** | Small tabular classification datasets (up to a few thousand rows) where visitors should *build* models | Reuse `components/lab/`: the dataset is trained live in a Web Worker by the TypeScript engine in `lib/ml/` | ~260 kB gzipped, trains in 0.1–3 s |
| **4. Python in the browser** | You need real pandas/sklearn live in the page (e.g. user uploads their own CSV) | **Pyodide** runs Python in WebAssembly | Several MB download, a few seconds to load; use rarely |

Pattern 1 is the default. Use pattern 3 whenever the project is "predict a category from a table". It's what makes a page feel like a tool rather than a report.

### The ML lab (pattern 3)

`web/src/components/lab/` is project-agnostic. A project page wraps its sections in `<LabProvider domain={...}>` with:

- the dataset (`features`, `classes`, `X`, `y`), as written by `build.py`
- labels, colours and short names for classes and features
- a few presets (starting pipelines) and a baseline accuracy to beat (usually the notebook's)

…and gets, for free:

| Component | What visitors can do |
|---|---|
| `Lab` | Build a pipeline visually (drag to reorder steps, toggle or remove them), pick from 6 models, tune hyperparameters with sliders, auto-retrain, see train/test accuracy, confusion matrix, per-class F1, training curves, feature importance, the equivalent scikit-learn code, an experiment log, and missions |
| `ValidationCurve` / `LearningCurve` | Sweep a hyperparameter or the training-set size and spot over- and underfitting |
| `FeatureBudget` | Accuracy for every combination of input features, plus permutation importance |
| `SoilMap` | Decision regions of the current model over any two features, with a "your input" predictor |

Steps available: standard / min-max / robust scaling, log transform, outlier clipping, polynomial features, PCA, binning.
Models: logistic regression, k-NN, decision tree, random forest, Gaussian Naive Bayes, MLP. Run `npx tsx scripts/bench.ts` in `web/` after changing the engine.

---

## Adding a new project (workflow)

**Your part**

1. Create `notebooks/<slug>/`.
2. Put the finished `notebook.ipynb` and its data in it.
3. Fill in `NOTES.md` (template below).
4. Ask Claude: *"Integrate `notebooks/<slug>` into the platform."*

**What gets done from there**

1. Read the notebook, tidy up and improve the analysis where it helps (better validation, clearer charts, an extra insight).
2. Write `pipeline/<slug>/build.py`, which produces `web/public/data/<slug>/`.
3. Build `web/src/projects/<slug>/` (page + meta) and register it in `registry.ts`.
4. Run it locally, check it on desktop and mobile widths, then deploy.

### `NOTES.md` template

```markdown
# <Project title>

**Source:** e.g. DataCamp project link / Kaggle dataset / own idea
**Question:** What is this project trying to answer?
**Data:** files in data/, where they came from, licence if known
**Key findings:** 2–4 bullets, in your words
**App ideas:** what should a visitor be able to *do*? (filter by X, predict Y, compare A vs B)
**Must keep:** anything from the notebook that has to appear on the page
**Skip:** cells that were scratch work / dead ends
```

---

## Every project page has the same structure

Recruiters skim, so every page follows the same shape (numbered chapters built with the shared `SectionHeader`, plus a sticky chapter nav):

1. **Header:** title, one-line summary, tags (e.g. `regression`, `EDA`, `NLP`), links to notebook and source
2. **The question:** 2–3 sentences on why this matters
3. **Interactive demo:** the main event, above the fold where possible
4. **Approach:** data, method, how it was validated
5. **Findings:** short bullets with numbers
6. **What I'd do next:** shows judgement

The home page is a gallery of project cards built automatically from `registry.ts`.

---

## Data rules

- **Raw data in `notebooks/<slug>/data/`:** keep files under ~50 MB (GitHub rejects files over 100 MB). For anything larger, add a `DATA.md` with the download link instead of committing it.
- **Shipped data in `web/public/data/<slug>/`:** aim for **under ~2 MB per project**. Aggregate, sample, or round in `build.py`; the browser never needs the raw dataset.
- Check the dataset licence before publishing (DataCamp course datasets are usually fine to show in a portfolio, but read the terms).
- Never commit API keys or personal data.

---

## Tech stack (recommended)

| Concern | Choice | Why |
|---|---|---|
| Framework | Vite + React + TypeScript | Fast, simple, every mini-app is just a component |
| Routing | React Router | One route per project (`/projects/<slug>`) |
| Charts | Apache ECharts (tree-shaken) | Heatmaps, box plots, parallel coordinates, smooth animated updates |
| Styling | Tailwind CSS v4, light + dark theme | Consistent look across projects without per-page CSS |
| In-browser ML | Own TypeScript engine in a Web Worker (`lib/ml/`) | Lets visitors retrain models live; add onnxruntime-web later for big pre-trained models |
| Hosting | **Vercel** (recommended) or GitHub Pages | Vercel deploys on every push and handles client-side routes with no extra config. GitHub Pages works too, but needs a workflow file and a SPA routing workaround. |

### Local commands

```bash
# Python side (uv shown; plain venv + pip works too)
uv venv .venv && source .venv/bin/activate
uv pip install -r pipeline/requirements.txt
python pipeline/<slug>/build.py          # regenerate one project's web assets

# Web side
cd web
npm install
npm run dev                              # http://localhost:5173
npm run build                            # production build into web/dist
```

---

## Making the projects stand out

Lots of candidates have done the same guided projects (DataCamp, Kaggle starters). Give each one something of your own:

- Go **one step past the guided project**: an extra model, a new feature, a different dataset, or a sharper question.
- Make the demo **let people do something**, not just look at charts.
- Write findings as **decisions** ("prioritise X because Y"), not just observations.
- Link the site from your CV, LinkedIn, and GitHub profile README, and pin the repo.

---

## Project index

| # | Project | Slug | Status |
|---|---|---|---|---|
| 1 | Sowing Success: Crop Recommendation Lab | `predictive_modeling_for_agriculture` | Live: interactive ML lab |
| 2 | _TBD_ | | Notebook in progress |

