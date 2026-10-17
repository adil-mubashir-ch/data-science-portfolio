/// <reference lib="webworker" />
import { argmax } from "./models";
import { predictRaw, quickScore, runExperiment, type FittedPipeline } from "./pipeline";
import { mulberry32, holdoutSplit, shuffle, subsample } from "./random";
import type { LabConfig, TabularData } from "./types";

export type Op =
  | { op: "init"; data: TabularData }
  | { op: "train"; config: LabConfig }
  | { op: "predict"; rows: number[][] }
  | { op: "grid"; xi: number; yi: number; base: number[]; xRange: [number, number]; yRange: [number, number]; res: number }
  | { op: "sweep"; config: LabConfig; key: string; values: number[] }
  | { op: "curve"; config: LabConfig; fractions: number[] }
  | { op: "subsets"; config: LabConfig }
  | { op: "permutation"; config: LabConfig; repeats: number };

let data: TabularData | null = null;
let current: FittedPipeline | null = null;
let version = 0;
const active: Record<string, number> = {};

class Cancelled extends Error {}

// Yield via MessageChannel rather than setTimeout: timers are throttled in background tabs.
const channel = new MessageChannel();
const waiting: (() => void)[] = [];
channel.port1.onmessage = () => waiting.shift()?.();
const yieldToEventLoop = () => new Promise<void>((r) => (waiting.push(r), channel.port2.postMessage(0)));

function makeTick(op: string, id: number) {
  let last = performance.now();
  return async () => {
    if (performance.now() - last > 100) {
      await yieldToEventLoop();
      last = performance.now();
    }
    if (active[op] !== id) throw new Cancelled();
  };
}

const post = (id: number, kind: "progress" | "result" | "error" | "cancelled", payload?: unknown) =>
  (self as unknown as Worker).postMessage({ id, kind, payload });

self.onmessage = async (e: MessageEvent<{ id: number } & Op>) => {
  const msg = e.data;
  const { id } = msg;
  active[msg.op] = id;
  const tick = makeTick(msg.op, id);
  try {
    switch (msg.op) {
      case "init":
        data = msg.data;
        return post(id, "result", true);

      case "train": {
        let lastPost = 0;
        const { result, fitted } = await runExperiment(msg.config, data!, {
          tick,
          onProgress: (fraction, label, history) => {
            const now = performance.now();
            if (now - lastPost < 40 && fraction < 1) return;
            lastPost = now;
            post(id, "progress", { fraction, label, history });
          },
        }, version + 1);
        current = fitted;
        version++;
        return post(id, "result", result);
      }

      case "predict":
        if (!current) return post(id, "result", null);
        return post(id, "result", { proba: predictRaw(current, msg.rows), version });

      case "grid": {
        if (!current) return post(id, "result", null);
        const { res, xRange, yRange, xi, yi, base } = msg;
        const rows: number[][] = [];
        for (let r = 0; r < res; r++)
          for (let c = 0; c < res; c++) {
            const row = base.slice();
            row[xi] = xRange[0] + ((xRange[1] - xRange[0]) * (c + 0.5)) / res;
            row[yi] = yRange[1] - ((yRange[1] - yRange[0]) * (r + 0.5)) / res;
            rows.push(row);
          }
        const P = predictRaw(current, rows);
        const cls = new Int16Array(P.length);
        const conf = new Float32Array(P.length);
        P.forEach((p, i) => {
          cls[i] = argmax(p);
          conf[i] = p[cls[i]];
        });
        return post(id, "result", { cls, conf, res, version });
      }

      case "sweep": {
        for (const value of msg.values) {
          const config = { ...msg.config, model: { ...msg.config.model, params: { ...msg.config.model.params, [msg.key]: value } } };
          const s = await quickScore(config, data!, tick);
          post(id, "progress", { value, trainAcc: s.trainAcc, testAcc: s.testAcc });
        }
        return post(id, "result", true);
      }

      case "curve": {
        const v = msg.config.validation;
        const { train } = holdoutSplit(data!.y, v.testSize, v.stratify, v.seed);
        for (const fraction of msg.fractions) {
          const idx = fraction >= 1 ? train : subsample(data!.y, train, fraction, v.seed + 1);
          const s = await quickScore(msg.config, data!, tick, idx);
          post(id, "progress", { fraction, nTrain: s.nTrain, trainAcc: s.trainAcc, testAcc: s.testAcc });
        }
        return post(id, "result", true);
      }

      case "subsets": {
        const feats = data!.features;
        const subsets: string[][] = [];
        for (let mask = 1; mask < 1 << feats.length; mask++) subsets.push(feats.filter((_, j) => mask & (1 << j)));
        subsets.sort((a, b) => a.length - b.length);
        for (const features of subsets) {
          const s = await quickScore({ ...msg.config, features }, data!, tick);
          post(id, "progress", { features, testAcc: s.testAcc });
        }
        return post(id, "result", true);
      }

      case "permutation": {
        const s = await quickScore({ ...msg.config, features: data!.features }, data!, tick);
        const rows = s.test.map((i) => data!.X[i]);
        const y = s.test.map((i) => data!.y[i]);
        const acc = (R: number[][]) => {
          const P = predictRaw(s.fitted, R);
          return P.filter((p, i) => argmax(p) === y[i]).length / y.length;
        };
        const baseline = acc(rows);
        const rng = mulberry32(msg.config.validation.seed + 99);
        const out = [];
        for (let j = 0; j < data!.features.length; j++) {
          const drops: number[] = [];
          for (let r = 0; r < msg.repeats; r++) {
            const perm = shuffle(rows.map((row) => row[j]), rng);
            drops.push(baseline - acc(rows.map((row, i) => row.map((v, jj) => (jj === j ? perm[i] : v)))));
            await tick();
          }
          const mean = drops.reduce((a, b) => a + b, 0) / drops.length;
          const std = Math.sqrt(drops.reduce((a, b) => a + (b - mean) ** 2, 0) / drops.length);
          out.push({ feature: data!.features[j], mean, std });
        }
        return post(id, "result", { baseline, importances: out });
      }
    }
  } catch (err) {
    if (err instanceof Cancelled) return post(id, "cancelled");
    post(id, "error", String((err as Error)?.stack ?? err));
  }
};
