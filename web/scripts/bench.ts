// Sanity check: run every model and step with defaults and compare with scikit-learn ballparks.
// Usage: npx tsx scripts/bench.ts
import { readFileSync } from "node:fs";
import { runExperiment } from "../src/lib/ml/pipeline";
import { MODELS, MODEL_ORDER, STEPS, STEP_ORDER } from "../src/lib/ml/registry";
import { toSklearn } from "../src/lib/ml/codegen";
import { jacobiEigen } from "../src/lib/ml/preprocess";
import type { LabConfig, StepSpec } from "../src/lib/ml/types";

const data = JSON.parse(readFileSync("public/data/predictive_modeling_for_agriculture/soil_measures.json", "utf8"));
const tick = async () => {};
const base = (model: LabConfig["model"], steps: StepSpec[] = []): LabConfig => ({
  features: ["N", "P", "K", "ph"],
  steps,
  model,
  validation: { mode: "holdout", testSize: 0.2, folds: 5, stratify: true, seed: 42 },
});
const scaler: StepSpec = { id: "s", type: "standard", params: {}, enabled: true };

const e = jacobiEigen([[4, 1, 0], [1, 3, 1], [0, 1, 2]]);
console.log("eigenvalues (expect 4.732, 3, 1.268):", e.values.map((v) => v.toFixed(3)).sort().reverse().join(", "));

for (const type of MODEL_ORDER) {
  for (const steps of [[], [scaler]]) {
    const t = performance.now();
    const { result } = await runExperiment(base({ type, params: { ...MODELS[type].defaults } }, steps), data, { tick }, 1);
    console.log(`${type.padEnd(7)} ${steps.length ? "scaled  " : "raw     "} train=${result.trainAcc.toFixed(3)} test=${result.testAcc.toFixed(3)} top3=${result.top3.toFixed(3)} f1=${result.macroF1.toFixed(3)} ${(performance.now() - t).toFixed(0)}ms  ${result.modelInfo}`);
  }
}
for (const type of STEP_ORDER) {
  const step: StepSpec = { id: "x", type, params: { ...STEPS[type].defaults }, enabled: true };
  const { result } = await runExperiment(base({ type: "knn", params: { ...MODELS.knn.defaults } }, [step, scaler]), data, { tick }, 1);
  const st = result.stages[1];
  console.log(`step ${type.padEnd(9)} -> ${st.cols} cols, knn test=${result.testAcc.toFixed(3)} | ${st.info}`);
}
const cv = await runExperiment({ ...base({ type: "gnb", params: { ...MODELS.gnb.defaults } }), validation: { mode: "cv", testSize: 0.2, folds: 5, stratify: true, seed: 1 } }, data, { tick }, 1);
console.log("gnb 5-fold cv", cv.result.cvScores?.map((s) => s.toFixed(3)).join(" "), "mean", cv.result.testAcc.toFixed(3));
console.log(toSklearn(base({ type: "forest", params: { ...MODELS.forest.defaults } }, [{ id: "c", type: "clip", params: { k: 1.5 }, enabled: true }, scaler]), "soil_measures.csv", "crop"));
