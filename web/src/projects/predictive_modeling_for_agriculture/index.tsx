import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SectionHeader, cx } from "../../components/ui";
import { LabProvider, type LabDomain } from "../../components/lab/LabContext";
import Lab from "../../components/lab/Lab";
import { LearningCurve, ValidationCurve } from "../../components/lab/Diagnostics";
import FeatureBudget from "../../components/lab/FeatureBudget";
import SoilMap from "../../components/lab/SoilMap";
import type { LabConfig, TabularData } from "../../lib/ml/types";
import { CROPS, FEATURES, cropColor, cropLabel, featureLabel } from "./crops";
import { meta } from "./meta";
import Explore from "./Explore";
import Findings, { type Reference } from "./Findings";

const BASE = `/data/${meta.slug}`;
const NOTEBOOK_ACCURACY = 0.6636;

const validation: LabConfig["validation"] = { mode: "holdout", testSize: 0.2, folds: 5, stratify: true, seed: 42 };
const ALL = ["N", "P", "K", "ph"];
const scaler = (id: string) => ({ id, type: "standard" as const, params: {}, enabled: true });

const PRESETS: LabDomain["presets"] = [
  {
    name: "Notebook baseline",
    description: "Where the original notebook ended: logistic regression on raw values.",
    config: { features: ALL, steps: [], model: { type: "logreg", params: { C: 1, epochs: 300, lr: 0.05 } }, validation },
  },
  {
    name: "Scaled k-NN",
    description: "Standard scaling + 5 nearest neighbours.",
    config: { features: ALL, steps: [scaler("p1")], model: { type: "knn", params: { k: 5, weights: "uniform", metric: "euclidean" } }, validation },
  },
  {
    name: "Random forest",
    description: "100 trees: the strongest model on this data.",
    config: { features: ALL, steps: [], model: { type: "forest", params: { nEstimators: 100, maxDepth: 30, maxFeatures: "sqrt", minSamplesLeaf: 1, bootstrap: true } }, validation },
  },
  {
    name: "Neural net",
    description: "Scaled inputs into a 64-32 ReLU network.",
    config: { features: ALL, steps: [scaler("p2")], model: { type: "mlp", params: { hidden1: 64, hidden2: 32, activation: "relu", lr: 0.005, alpha: 0.0001, epochs: 100 } }, validation },
  },
  {
    name: "Curvy logistic",
    description: "Polynomial features let a linear model draw curves.",
    config: {
      features: ALL,
      steps: [{ id: "p3", type: "poly", params: { degree: 2, interactionOnly: false }, enabled: true }, scaler("p4")],
      model: { type: "logreg", params: { C: 10, epochs: 600, lr: 0.05 } },
      validation,
    },
  },
];

const CHAPTERS = [
  { id: "explore", label: "Explore" },
  { id: "lab", label: "ML lab" },
  { id: "diagnose", label: "Diagnose" },
  { id: "budget", label: "Which test?" },
  { id: "map", label: "Soil map" },
  { id: "findings", label: "Findings" },
];

function ChapterNav({ ready }: { ready: boolean }) {
  const [active, setActive] = useState("explore");
  useEffect(() => {
    if (!ready) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id.replace("-section", ""))),
      { rootMargin: "-30% 0px -60% 0px" },
    );
    // Sections mount just after the data loads; wait a moment, then observe them and honour a #chapter link.
    const timer = setTimeout(() => {
      CHAPTERS.forEach((c) => {
        const el = document.getElementById(`${c.id}-section`);
        if (el) obs.observe(el);
      });
      const target = location.hash && document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView({ behavior: "instant" });
    }, 100);
    return () => {
      clearTimeout(timer);
      obs.disconnect();
    };
  }, [ready]);
  return (
    <nav aria-label="Chapters" className="sticky top-14 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 sm:px-6">
        {CHAPTERS.map((c, i) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            className={cx(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] transition-colors",
              active === c.id ? "bg-ink text-paper" : "text-ink-3 hover:text-ink",
            )}
          >
            <span className="tabular font-mono text-[10px] opacity-60">0{i + 1}</span>
            {c.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

export default function CropProject() {
  const [data, setData] = useState<TabularData | null>(null);
  const [reference, setReference] = useState<Reference | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([fetch(`${BASE}/soil_measures.json`).then((r) => r.json()), fetch(`${BASE}/reference.json`).then((r) => r.json())])
      .then(([d, ref]) => {
        setData(d);
        setReference(ref);
      })
      .catch(() => setFailed(true));
  }, []);

  const domain = useMemo<LabDomain | null>(
    () =>
      data && {
        data,
        storageKey: meta.slug,
        csvName: "soil_measures.csv",
        target: "crop",
        classLabel: (i) => cropLabel(data.classes[i]),
        classColor: (i) => cropColor(data.classes[i]),
        featureLabel,
        featureShort: (f) => FEATURES[f]?.short ?? f,
        presets: PRESETS,
        baseline: { label: "Notebook", testAcc: NOTEBOOK_ACCURACY },
      },
    [data],
  );

  return (
    <main>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Link to="/" className="mt-8 inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
          <ArrowLeft size={13} /> All projects
        </Link>
        <header className="grid gap-10 pb-6 pt-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="flex flex-wrap gap-1.5">
              {meta.tags.map((t) => (
                <span key={t} className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-ink-2">{t}</span>
              ))}
            </div>
            <h1 className="mt-5 font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              Which crop should this field grow?
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-ink-2">
              Soil tests cost money, so farmers often measure only some of them. Using 2,200 fields and four cheap tests (nitrogen,
              phosphorus, potassium and pH), this project asks how well we can recommend one of 22 crops, and which test is worth paying for.
            </p>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-3">
              The original notebook stopped at a logistic regression with {Math.round(NOTEBOOK_ACCURACY * 100)}% accuracy. This page turns it into a
              lab: every model below trains live in your browser, so you can rebuild the pipeline, tune it, and see why some models do better.
            </p>
            <a href="#lab" className="mt-7 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[14px] font-medium text-accent-ink transition-opacity hover:opacity-90">
              Jump into the ML lab <ArrowRight size={15} />
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3 self-end lg:col-span-5">
            {Object.entries(FEATURES).map(([k, f]) => (
              <div key={k} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-serif text-3xl font-semibold text-accent">{f.short}</span>
                  <span className="text-[11px] uppercase tracking-wider text-ink-3">{f.label}</span>
                </div>
                <p className="mt-2 text-[12.5px] leading-snug text-ink-2">{f.blurb}</p>
              </div>
            ))}
          </div>
        </header>
      </div>

      <ChapterNav ready={!!data} />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {failed && <p className="py-20 text-center text-bad">Couldn't load the dataset. Run the pipeline script first.</p>}
        {!data && !failed && <p className="py-20 text-center text-ink-3">Loading 2,200 fields…</p>}
        {data && domain && (
          <LabProvider domain={domain} initial={PRESETS[0].config}>
            <section id="explore-section">
              <SectionHeader id="explore" index="01" kicker="Explore the soil" title="Every crop has a soil fingerprint, but some fingerprints overlap">
                Before modelling, look at the data. Pick a crop to highlight it in every chart and get a short profile.
              </SectionHeader>
              <Explore data={data} />
            </section>

            <section id="lab-section">
              <SectionHeader id="lab" index="02" kicker="Build a model" title="The ML lab: start from the notebook and beat it">
                You start where the notebook ended. Add preprocessing steps, swap models, drag hyperparameter sliders. Every change retrains a
                real model in a background thread and updates the results. Tick off the missions as you go.
              </SectionHeader>
              <Lab />
            </section>

            <section id="diagnose-section">
              <SectionHeader id="diagnose" index="03" kicker="Diagnose" title="Is the model too simple, or memorising?">
                Two classic diagnostics, run on whatever pipeline is in the lab. A validation curve shows the sweet spot for one hyperparameter;
                a learning curve shows whether more data would help.
              </SectionHeader>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <ValidationCurve />
                <LearningCurve />
              </div>
            </section>

            <section id="budget-section">
              <SectionHeader id="budget" index="04" kicker="The notebook's question" title="Which soil test is worth paying for?">
                The original task: find the single most predictive feature. Here's the full answer: accuracy for every one of the 15 possible
                combinations of tests, plus how much each test matters to the trained model.
              </SectionHeader>
              <FeatureBudget reference={reference?.randomForestSubsets} />
            </section>

            <section id="map-section">
              <SectionHeader id="map" index="05" kicker="Ask the model" title="A map of what the model would plant">
                The model's decision regions for a slice of soil space. Set your field's soil tests to get a recommendation, and see how
                close it sits to a boundary.
              </SectionHeader>
              <SoilMap emoji={(i) => CROPS[data.classes[i]]?.emoji} />
            </section>

            <section id="findings-section">
              <SectionHeader id="findings" index="06" kicker="Takeaways" title="What I found">
                Numbers below come from scikit-learn (the Python pipeline), using the notebook's own train/test split.
              </SectionHeader>
              {reference && <Findings reference={reference} />}
            </section>
          </LabProvider>
        )}
      </div>
    </main>
  );
}
