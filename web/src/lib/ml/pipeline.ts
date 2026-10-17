import { createModel, argmax, type Classifier, type FitContext } from "./models";
import { fitStep, type FittedStep } from "./preprocess";
import { holdoutSplit, kFold, mulberry32 } from "./random";
import type {
  ColumnSummary, EvalMetrics, LabConfig, Matrix, RunResult, StageSummary, TabularData, HistoryPoint,
} from "./types";

export interface FittedPipeline {
  featureIdx: number[];
  steps: FittedStep[];
  model: Classifier;
  namesOut: string[];
  stages: StageSummary[];
}

function summarize(X: Matrix, names: string[]): ColumnSummary[] {
  return names.slice(0, 8).map((name, j) => {
    const col = X.map((r) => r[j]);
    let min = Infinity, max = -Infinity, sum = 0;
    for (const v of col) {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    const mean = sum / col.length;
    const std = Math.sqrt(col.reduce((a, v) => a + (v - mean) ** 2, 0) / col.length);
    const hist = new Array(16).fill(0);
    const span = max - min || 1;
    for (const v of col) hist[Math.min(15, Math.floor(((v - min) / span) * 16))]++;
    return { name, min, max, mean, std, hist };
  });
}

const selectRows = (data: TabularData, idx: number[], featureIdx: number[]) =>
  idx.map((i) => featureIdx.map((j) => data.X[i][j]));

export function featureIndices(config: LabConfig, data: TabularData): number[] {
  const idx = config.features.map((f) => data.features.indexOf(f)).filter((i) => i >= 0);
  return idx.length ? idx : [0];
}

export async function fitPipeline(
  config: LabConfig,
  data: TabularData,
  trainIdx: number[],
  ctx: Omit<FitContext, "evalSet" | "nClasses">,
  evalIdx?: number[],
): Promise<FittedPipeline> {
  const featureIdx = featureIndices(config, data);
  let X = selectRows(data, trainIdx, featureIdx);
  let E = evalIdx ? selectRows(data, evalIdx, featureIdx) : undefined;
  let names = featureIdx.map((j) => data.features[j]);
  const stages: StageSummary[] = [
    { stepId: null, label: "Input", rows: X.length, cols: names.length, columns: summarize(X, names) },
  ];
  const steps: FittedStep[] = [];
  for (const spec of config.steps) {
    if (!spec.enabled) continue;
    const fitted = fitStep(spec, X, names);
    X = fitted.transform(X);
    E = E && fitted.transform(E);
    names = fitted.names;
    steps.push(fitted);
    stages.push({ stepId: spec.id, label: spec.type, rows: X.length, cols: names.length, columns: summarize(X, names), info: fitted.info });
    await ctx.tick();
  }
  const y = trainIdx.map((i) => data.y[i]);
  const model = createModel(config.model);
  await model.fit(X, y, {
    ...ctx,
    nClasses: data.classes.length,
    evalSet: E && evalIdx ? { X: E, y: evalIdx.map((i) => data.y[i]) } : undefined,
  });
  return { featureIdx, steps, model, namesOut: names, stages };
}

/** Predict class probabilities for raw rows that contain every dataset feature. */
export function predictRaw(fp: FittedPipeline, rows: Matrix): Matrix {
  let X = rows.map((r) => fp.featureIdx.map((j) => r[j]));
  for (const s of fp.steps) X = s.transform(X);
  return fp.model.predictProba(X);
}

export function evaluate(proba: Matrix, y: number[], k: number): EvalMetrics {
  const confusion = Array.from({ length: k }, () => new Array(k).fill(0));
  let ok = 0, top3 = 0;
  proba.forEach((p, i) => {
    const pred = argmax(p);
    confusion[y[i]][pred]++;
    if (pred === y[i]) ok++;
    const pt = p[y[i]];
    if (p.filter((v) => v > pt).length < 3) top3++;
  });
  const perClass = confusion.map((row, c) => {
    const tp = row[c];
    const support = row.reduce((a, b) => a + b, 0);
    const predicted = confusion.reduce((a, r) => a + r[c], 0);
    const precision = predicted ? tp / predicted : 0;
    const recall = support ? tp / support : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { precision, recall, f1, support };
  });
  return {
    accuracy: y.length ? ok / y.length : 0,
    top3: y.length ? top3 / y.length : 0,
    macroF1: perClass.reduce((a, c) => a + c.f1, 0) / k,
    confusion,
    perClass,
  };
}

export interface RunHooks {
  tick: () => Promise<void>;
  onProgress?: (fraction: number, label: string, history?: HistoryPoint[]) => void;
}

/** Train + evaluate a full configuration. Returns the result and the model to keep for predictions. */
export async function runExperiment(
  config: LabConfig,
  data: TabularData,
  hooks: RunHooks,
  modelVersion: number,
): Promise<{ result: RunResult; fitted: FittedPipeline; testIdx: number[] }> {
  const t0 = performance.now();
  const k = data.classes.length;
  const v = config.validation;
  const base = { rng: mulberry32(v.seed + 7), tick: hooks.tick };
  const finish = (fp: FittedPipeline, m: EvalMetrics, trainAcc: number, extra: Partial<RunResult>, nTrain: number, nTest: number): RunResult => ({
    config,
    trainAcc,
    testAcc: m.accuracy,
    macroF1: m.macroF1,
    top3: m.top3,
    confusion: m.confusion,
    perClass: m.perClass,
    history: fp.model.history,
    historyKind: fp.model.historyKind,
    importances: fp.model.importances && fp.namesOut.map((name, j) => ({ name, value: fp.model.importances![j] })),
    stages: fp.stages,
    modelInfo: fp.model.info(),
    nTrain,
    nTest,
    durationMs: performance.now() - t0,
    modelVersion,
    ...extra,
  });

  if (v.mode === "holdout") {
    const { train, test } = holdoutSplit(data.y, v.testSize, v.stratify, v.seed);
    hooks.onProgress?.(0, "Fitting pipeline");
    const fp = await fitPipeline(config, data, train, {
      ...base,
      onHistory: (h, f) => hooks.onProgress?.(f, "Training", h),
    }, test);
    const trainM = evaluate(predictRaw(fp, train.map((i) => data.X[i])), train.map((i) => data.y[i]), k);
    const testM = evaluate(predictRaw(fp, test.map((i) => data.X[i])), test.map((i) => data.y[i]), k);
    return { result: finish(fp, testM, trainM.accuracy, {}, train.length, test.length), fitted: fp, testIdx: test };
  }

  const folds = kFold(data.y, v.folds, v.seed);
  const oofProba: Matrix = new Array(data.y.length);
  const cvScores: number[] = [];
  let trainAccSum = 0;
  for (let f = 0; f < folds.length; f++) {
    const testSet = new Set(folds[f]);
    const train = data.y.map((_, i) => i).filter((i) => !testSet.has(i));
    const fp = await fitPipeline(config, data, train, {
      ...base,
      onHistory: (_h, frac) => hooks.onProgress?.((f + frac) / (folds.length + 1), `Fold ${f + 1} of ${folds.length}`),
    });
    const P = predictRaw(fp, folds[f].map((i) => data.X[i]));
    folds[f].forEach((i, r) => (oofProba[i] = P[r]));
    cvScores.push(evaluate(P, folds[f].map((i) => data.y[i]), k).accuracy);
    trainAccSum += evaluate(predictRaw(fp, train.map((i) => data.X[i])), train.map((i) => data.y[i]), k).accuracy;
    hooks.onProgress?.((f + 1) / (folds.length + 1), `Fold ${f + 1} of ${folds.length}`);
  }
  const all = data.y.map((_, i) => i);
  const fp = await fitPipeline(config, data, all, {
    ...base,
    onHistory: (h, frac) => hooks.onProgress?.((folds.length + frac) / (folds.length + 1), "Final fit on all data", h),
  });
  const m = evaluate(oofProba, data.y, k);
  m.accuracy = cvScores.reduce((a, b) => a + b, 0) / cvScores.length;
  return {
    result: finish(fp, m, trainAccSum / folds.length, { cvScores }, Math.round((data.y.length * (folds.length - 1)) / folds.length), Math.round(data.y.length / folds.length)),
    fitted: fp,
    testIdx: all,
  };
}

/** Light-weight holdout score used by sweeps and curves. */
export async function quickScore(
  config: LabConfig,
  data: TabularData,
  tick: () => Promise<void>,
  trainIdx?: number[],
): Promise<{ trainAcc: number; testAcc: number; nTrain: number; fitted: FittedPipeline; test: number[] }> {
  const v = config.validation;
  const split = holdoutSplit(data.y, v.testSize, v.stratify, v.seed);
  const train = trainIdx ?? split.train;
  const fp = await fitPipeline(config, data, train, { rng: mulberry32(v.seed + 7), tick });
  const k = data.classes.length;
  const acc = (idx: number[]) => evaluate(predictRaw(fp, idx.map((i) => data.X[i])), idx.map((i) => data.y[i]), k).accuracy;
  return { trainAcc: acc(train), testAcc: acc(split.test), nTrain: train.length, fitted: fp, test: split.test };
}
