import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MLWorker, isCancelled } from "../../lib/ml/client";
import { MODELS, STEPS } from "../../lib/ml/registry";
import type { HistoryPoint, LabConfig, ModelType, RunResult, StepType, TabularData } from "../../lib/ml/types";

/** Everything project-specific the generic lab needs to know. */
export interface LabDomain {
  data: TabularData;
  storageKey: string;
  csvName: string;
  target: string;
  classLabel: (i: number) => string;
  classColor: (i: number) => string;
  featureLabel: (f: string) => string;
  /** Compact name for tight spaces, e.g. "pH" instead of "ph". */
  featureShort: (f: string) => string;
  presets: { name: string; description: string; config: LabConfig }[];
  baseline: { label: string; testAcc: number };
}

export interface RunRecord {
  id: number;
  at: number;
  config: LabConfig;
  trainAcc: number;
  testAcc: number;
  macroF1: number;
  top3: number;
  cvStd?: number;
  durationMs: number;
}

interface TrainingState {
  running: boolean;
  fraction: number;
  label: string;
  history: HistoryPoint[];
}

interface LabState {
  domain: LabDomain;
  config: LabConfig;
  update: (fn: (c: LabConfig) => LabConfig) => void;
  setConfig: (c: LabConfig) => void;
  result: RunResult | null;
  previous: RunResult | null;
  training: TrainingState;
  error: string | null;
  autoTrain: boolean;
  setAutoTrain: (v: boolean) => void;
  train: () => void;
  runs: RunRecord[];
  clearRuns: () => void;
  deleteRun: (id: number) => void;
  selected: string;
  setSelected: (id: string) => void;
  live: MLWorker;
  batch: MLWorker;
  achievements: Set<string>;
  award: (id: string) => void;
}

const Ctx = createContext<LabState | null>(null);

export const useLab = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLab must be used inside <LabProvider>");
  return v;
};

let uid = 0;
export const newId = () => `s${Date.now().toString(36)}${(uid++).toString(36)}`;

export const makeStep = (type: StepType) => ({ id: newId(), type, params: { ...STEPS[type].defaults }, enabled: true });
export const makeModel = (type: ModelType) => ({ type, params: { ...MODELS[type].defaults } });

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export function LabProvider({ domain, initial, children }: { domain: LabDomain; initial: LabConfig; children: ReactNode }) {
  const [config, setConfigState] = useState<LabConfig>(initial);
  const [result, setResult] = useState<RunResult | null>(null);
  const [previous, setPrevious] = useState<RunResult | null>(null);
  const [training, setTraining] = useState<TrainingState>({ running: false, fraction: 0, label: "", history: [] });
  const [error, setError] = useState<string | null>(null);
  const [autoTrain, setAutoTrain] = useState(true);
  const [runs, setRuns] = useState<RunRecord[]>(() => load(`${domain.storageKey}:runs`, []));
  const [achievements, setAchievements] = useState<Set<string>>(() => new Set(load<string[]>(`${domain.storageKey}:ach`, [])));
  const [selected, setSelected] = useState("model");

  // Two workers: "live" trains the lab model, "batch" runs sweeps so they never block each other.
  const [workers, setWorkers] = useState<{ live: MLWorker; batch: MLWorker } | null>(null);
  useEffect(() => {
    const w = { live: new MLWorker(domain.data), batch: new MLWorker(domain.data) };
    setWorkers(w);
    return () => {
      w.live.terminate();
      w.batch.terminate();
    };
  }, [domain.data]);

  const resultRef = useRef(result);
  resultRef.current = result;

  const train = useCallback(() => {
    if (!workers) return;
    const cfg = config;
    setError(null);
    setTraining({ running: true, fraction: 0, label: "Starting", history: [] });
    workers.live
      .call<RunResult, { fraction: number; label: string; history?: HistoryPoint[] }>({ op: "train", config: cfg }, (p) =>
        setTraining((t) => ({ running: true, fraction: p.fraction, label: p.label, history: p.history ?? t.history })),
      )
      .then((r) => {
        setPrevious(resultRef.current);
        setResult(r);
        setTraining({ running: false, fraction: 1, label: "Done", history: r.history });
        setRuns((prev) => {
          const rec: RunRecord = {
            id: (prev[0]?.id ?? 0) + 1,
            at: Date.now(),
            config: cfg,
            trainAcc: r.trainAcc,
            testAcc: r.testAcc,
            macroF1: r.macroF1,
            top3: r.top3,
            cvStd: r.cvScores && Math.sqrt(r.cvScores.reduce((a, s) => a + (s - r.testAcc) ** 2, 0) / r.cvScores.length),
            durationMs: r.durationMs,
          };
          // Re-running an identical pipeline (e.g. after a page reload) replaces the last entry instead of piling up.
          const same = prev[0] && JSON.stringify(prev[0].config) === JSON.stringify(cfg);
          const next = (same ? [{ ...rec, id: prev[0].id }, ...prev.slice(1)] : [rec, ...prev]).slice(0, 60);
          save(`${domain.storageKey}:runs`, next);
          return next;
        });
      })
      .catch((e) => {
        if (isCancelled(e)) return;
        setError(String(e?.message ?? e).split("\n")[0]);
        setTraining((t) => ({ ...t, running: false }));
      });
  }, [config, workers, domain.storageKey]);

  // Auto-train shortly after the configuration settles.
  const trainRef = useRef(train);
  trainRef.current = train;
  useEffect(() => {
    if (!autoTrain) return;
    const t = setTimeout(() => trainRef.current(), result ? 350 : 50);
    return () => clearTimeout(t);
  }, [config, autoTrain, workers]);

  const update = useCallback((fn: (c: LabConfig) => LabConfig) => setConfigState((c) => fn(c)), []);
  const award = useCallback(
    (id: string) =>
      setAchievements((s) => {
        if (s.has(id)) return s;
        const n = new Set(s).add(id);
        save(`${domain.storageKey}:ach`, [...n]);
        return n;
      }),
    [domain.storageKey],
  );

  if (!workers) return null;
  const value: LabState = {
    domain,
    config,
    update,
    setConfig: setConfigState,
    result,
    previous,
    training,
    error,
    autoTrain,
    setAutoTrain,
    train,
    runs,
    clearRuns: () => {
      setRuns([]);
      save(`${domain.storageKey}:runs`, []);
    },
    deleteRun: (id) =>
      setRuns((prev) => {
        const next = prev.filter((r) => r.id !== id);
        save(`${domain.storageKey}:runs`, next);
        return next;
      }),
    selected,
    setSelected,
    live: workers.live,
    batch: workers.batch,
    achievements,
    award,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** One-line human summary of a configuration. */
export function describeConfig(c: LabConfig, totalFeatures: number): string {
  const steps = c.steps.filter((s) => s.enabled).map((s) => STEPS[s.type].label.replace(/ scaler$/i, "").replace("Polynomial features", "Poly"));
  const feats = c.features.length < totalFeatures ? `[${c.features.join(", ")}] ` : "";
  return `${feats}${[...steps, MODELS[c.model.type].label].join(" → ")}`;
}
