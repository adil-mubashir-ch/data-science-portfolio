import { gaussian, shuffle, type Rng } from "./random";
import type { HistoryPoint, Matrix, ModelSpec } from "./types";

export interface FitContext {
  nClasses: number;
  rng: Rng;
  /** Yields to the event loop now and then; throws if the job was cancelled. */
  tick: () => Promise<void>;
  /** Already-transformed evaluation set, used to draw live training curves. */
  evalSet?: { X: Matrix; y: number[] };
  onHistory?: (h: HistoryPoint[], fraction: number) => void;
}

export interface Classifier {
  fit(X: Matrix, y: number[], ctx: FitContext): Promise<void>;
  predictProba(X: Matrix): Matrix;
  history: HistoryPoint[];
  historyKind: "epoch" | "trees" | null;
  importances?: number[];
  info(): string;
}

const argmax = (r: ArrayLike<number>) => {
  let best = 0;
  for (let i = 1; i < r.length; i++) if (r[i] > r[best]) best = i;
  return best;
};

export function accuracyOf(proba: Matrix, y: number[]): number {
  let ok = 0;
  proba.forEach((p, i) => argmax(p) === y[i] && ok++);
  return y.length ? ok / y.length : 0;
}

function softmaxInPlace(z: Float64Array | number[], off = 0, len = z.length) {
  let m = -Infinity;
  for (let c = 0; c < len; c++) m = Math.max(m, z[off + c]);
  let s = 0;
  for (let c = 0; c < len; c++) s += z[off + c] = Math.exp(z[off + c] - m);
  for (let c = 0; c < len; c++) z[off + c] /= s;
}

/** Adam optimiser state for one flat parameter array. */
class Adam {
  m: Float64Array;
  v: Float64Array;
  t = 0;
  constructor(size: number, private lr: number) {
    this.m = new Float64Array(size);
    this.v = new Float64Array(size);
  }
  step(w: Float64Array, g: Float64Array, t: number) {
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;
    const c1 = 1 - b1 ** t, c2 = 1 - b2 ** t;
    for (let i = 0; i < w.length; i++) {
      this.m[i] = b1 * this.m[i] + (1 - b1) * g[i];
      this.v[i] = b2 * this.v[i] + (1 - b2) * g[i] * g[i];
      w[i] -= (this.lr * (this.m[i] / c1)) / (Math.sqrt(this.v[i] / c2) + eps);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Logistic regression (multinomial, L2, full-batch Adam)              */
/* ------------------------------------------------------------------ */
class LogisticRegression implements Classifier {
  history: HistoryPoint[] = [];
  historyKind = "epoch" as const;
  private W = new Float64Array(0);
  private b = new Float64Array(0);
  private d = 0;
  private k = 0;
  constructor(private p: { C: number; epochs: number; lr: number }) {}

  private logits(X: Matrix): Float64Array {
    const { d, k, W, b } = this;
    const out = new Float64Array(X.length * k);
    for (let i = 0; i < X.length; i++)
      for (let c = 0; c < k; c++) {
        let z = b[c];
        for (let j = 0; j < d; j++) z += X[i][j] * W[j * k + c];
        out[i * k + c] = z;
      }
    return out;
  }

  async fit(X: Matrix, y: number[], ctx: FitContext) {
    const n = X.length;
    this.d = X[0]?.length ?? 0;
    this.k = ctx.nClasses;
    const { d, k } = this;
    this.W = new Float64Array(d * k);
    this.b = new Float64Array(k);
    const optW = new Adam(d * k, this.p.lr);
    const optB = new Adam(k, this.p.lr);
    const lambda = 1 / (this.p.C * n);
    const every = Math.max(1, Math.round(this.p.epochs / 60));
    for (let epoch = 1; epoch <= this.p.epochs; epoch++) {
      const P = this.logits(X);
      const gW = new Float64Array(d * k);
      const gB = new Float64Array(k);
      let loss = 0;
      for (let i = 0; i < n; i++) {
        softmaxInPlace(P, i * k, k);
        loss -= Math.log(Math.max(P[i * k + y[i]], 1e-15));
        for (let c = 0; c < k; c++) {
          const g = P[i * k + c] - (c === y[i] ? 1 : 0);
          gB[c] += g;
          for (let j = 0; j < d; j++) gW[j * k + c] += X[i][j] * g;
        }
      }
      let reg = 0;
      for (let i = 0; i < gW.length; i++) {
        gW[i] = gW[i] / n + lambda * this.W[i];
        reg += this.W[i] ** 2;
      }
      for (let c = 0; c < k; c++) gB[c] /= n;
      optW.step(this.W, gW, epoch);
      optB.step(this.b, gB, epoch);
      const point: HistoryPoint = { step: epoch, loss: loss / n + 0.5 * lambda * reg };
      if (epoch % every === 0 || epoch === this.p.epochs) {
        point.trainAcc = accuracyOf(this.predictProba(X), y);
        if (ctx.evalSet) point.valAcc = accuracyOf(this.predictProba(ctx.evalSet.X), ctx.evalSet.y);
        ctx.onHistory?.(this.history.concat(point), epoch / this.p.epochs);
      }
      this.history.push(point);
      await ctx.tick();
    }
    this.importances = Array.from({ length: d }, (_, j) => {
      let s = 0;
      for (let c = 0; c < k; c++) s += Math.abs(this.W[j * k + c]);
      return s / k;
    });
  }
  importances?: number[];

  predictProba(X: Matrix): Matrix {
    const P = this.logits(X);
    const out: Matrix = [];
    for (let i = 0; i < X.length; i++) {
      softmaxInPlace(P, i * this.k, this.k);
      out.push(Array.from(P.subarray(i * this.k, (i + 1) * this.k)));
    }
    return out;
  }
  info() {
    const last = this.history[this.history.length - 1];
    return `${this.history.length} epochs · final loss ${last?.loss?.toFixed(3) ?? "–"}`;
  }
}

/* ------------------------------------------------------------------ */
/* k-nearest neighbours                                                */
/* ------------------------------------------------------------------ */
class KNN implements Classifier {
  history: HistoryPoint[] = [];
  historyKind = null;
  private X: Matrix = [];
  private y: number[] = [];
  private k = 0;
  constructor(private p: { k: number; weights: string; metric: string }) {}
  async fit(X: Matrix, y: number[], ctx: FitContext) {
    this.X = X;
    this.y = y;
    this.k = ctx.nClasses;
  }
  predictProba(Q: Matrix): Matrix {
    const K = Math.min(this.p.k, this.X.length);
    const manhattan = this.p.metric === "manhattan";
    const dist = new Float64Array(K);
    const lab = new Int32Array(K);
    return Q.map((q) => {
      dist.fill(Infinity);
      for (let i = 0; i < this.X.length; i++) {
        const r = this.X[i];
        let s = 0;
        for (let j = 0; j < q.length; j++) {
          const dd = q[j] - r[j];
          s += manhattan ? Math.abs(dd) : dd * dd;
        }
        if (s >= dist[K - 1]) continue;
        let pos = K - 1;
        while (pos > 0 && dist[pos - 1] > s) {
          dist[pos] = dist[pos - 1];
          lab[pos] = lab[pos - 1];
          pos--;
        }
        dist[pos] = s;
        lab[pos] = this.y[i];
      }
      const votes = new Array(this.k).fill(0);
      const exact = dist[0] === 0;
      for (let i = 0; i < K; i++) {
        const dd = manhattan ? dist[i] : Math.sqrt(dist[i]);
        const w = this.p.weights === "distance" ? (exact ? (dd === 0 ? 1 : 0) : 1 / dd) : 1;
        votes[lab[i]] += w;
      }
      const total = votes.reduce((a, b) => a + b, 0) || 1;
      return votes.map((v) => v / total);
    });
  }
  info() {
    return `Memorised ${this.X.length} training fields · votes from ${this.p.k} neighbour${this.p.k > 1 ? "s" : ""}`;
  }
}

/* ------------------------------------------------------------------ */
/* CART decision tree                                                  */
/* ------------------------------------------------------------------ */
interface TreeNode {
  f: number;
  t: number;
  l: TreeNode | null;
  r: TreeNode | null;
  value: number[] | null;
}
interface TreeParams {
  criterion: string;
  maxDepth: number;
  minSamplesLeaf: number;
  maxFeatures: number;
}

const xlogx = (x: number) => (x > 0 ? x * Math.log(x) : 0);

function buildTree(
  X: Matrix,
  y: number[],
  idx: number[],
  p: TreeParams,
  k: number,
  rng: Rng,
  imp: number[],
  depth: number,
  stats: { depth: number; leaves: number },
): TreeNode {
  const n = idx.length;
  const counts = new Array(k).fill(0);
  for (const i of idx) counts[y[i]]++;
  const leaf = (): TreeNode => {
    stats.leaves++;
    stats.depth = Math.max(stats.depth, depth);
    return { f: -1, t: 0, l: null, r: null, value: counts.map((c) => c / n) };
  };
  const pure = counts.some((c) => c === n);
  if (pure || depth >= p.maxDepth || n < 2 * p.minSamplesLeaf || n < 2) return leaf();

  const gini = p.criterion === "gini";
  const impurity = (cnt: number, sq: number, S: number) =>
    cnt === 0 ? 0 : gini ? 1 - sq / (cnt * cnt) : (Math.log(cnt) - S / cnt) / Math.LN2;
  let sqAll = 0, Sall = 0;
  for (const c of counts) {
    sqAll += c * c;
    Sall += xlogx(c);
  }
  const parent = impurity(n, sqAll, Sall);

  const d = X[0].length;
  const feats = p.maxFeatures >= d ? [...Array(d).keys()] : shuffle([...Array(d).keys()], rng).slice(0, p.maxFeatures);
  let bestF = -1, bestT = 0, bestImp = parent - 1e-12;
  const cl = new Array(k);
  const cr = new Array(k);
  for (const f of feats) {
    const sorted = idx.slice().sort((a, b) => X[a][f] - X[b][f]);
    cl.fill(0);
    for (let c = 0; c < k; c++) cr[c] = counts[c];
    let sqL = 0, sqR = sqAll, SL = 0, SR = Sall;
    for (let i = 0; i < n - 1; i++) {
      const c = y[sorted[i]];
      if (gini) {
        sqL += 2 * cl[c] + 1;
        sqR -= 2 * cr[c] - 1;
      } else {
        SL += xlogx(cl[c] + 1) - xlogx(cl[c]);
        SR += xlogx(cr[c] - 1) - xlogx(cr[c]);
      }
      cl[c]++;
      cr[c]--;
      const v = X[sorted[i]][f];
      const next = X[sorted[i + 1]][f];
      if (v === next) continue;
      const nl = i + 1, nr = n - nl;
      if (nl < p.minSamplesLeaf || nr < p.minSamplesLeaf) continue;
      const w = (nl * impurity(nl, sqL, SL) + nr * impurity(nr, sqR, SR)) / n;
      if (w < bestImp) {
        bestImp = w;
        bestF = f;
        bestT = (v + next) / 2;
      }
    }
  }
  if (bestF < 0) return leaf();
  imp[bestF] += n * (parent - bestImp);
  const L: number[] = [], R: number[] = [];
  for (const i of idx) (X[i][bestF] <= bestT ? L : R).push(i);
  return {
    f: bestF,
    t: bestT,
    l: buildTree(X, y, L, p, k, rng, imp, depth + 1, stats),
    r: buildTree(X, y, R, p, k, rng, imp, depth + 1, stats),
    value: null,
  };
}

function treePredict(node: TreeNode, x: number[]): number[] {
  while (!node.value) node = x[node.f] <= node.t ? node.l! : node.r!;
  return node.value;
}

const depthParam = (v: number) => (v >= 30 ? Infinity : v);

class DecisionTree implements Classifier {
  history: HistoryPoint[] = [];
  historyKind = null;
  importances?: number[];
  private root: TreeNode | null = null;
  private stats = { depth: 0, leaves: 0 };
  constructor(private p: { criterion: string; maxDepth: number; minSamplesLeaf: number }) {}
  async fit(X: Matrix, y: number[], ctx: FitContext) {
    const d = X[0].length;
    const imp = new Array(d).fill(0);
    this.root = buildTree(
      X, y, X.map((_, i) => i),
      { ...this.p, maxDepth: depthParam(this.p.maxDepth), maxFeatures: d },
      ctx.nClasses, ctx.rng, imp, 0, this.stats,
    );
    const total = imp.reduce((a, b) => a + b, 0) || 1;
    this.importances = imp.map((v) => v / total);
  }
  predictProba(X: Matrix) {
    return X.map((x) => treePredict(this.root!, x));
  }
  info() {
    return `Depth ${this.stats.depth} · ${this.stats.leaves} leaves (decision rules)`;
  }
}

class RandomForest implements Classifier {
  history: HistoryPoint[] = [];
  historyKind = "trees" as const;
  importances?: number[];
  private trees: TreeNode[] = [];
  private depths: number[] = [];
  constructor(
    private p: { nEstimators: number; maxDepth: number; maxFeatures: string; minSamplesLeaf: number; bootstrap: boolean },
  ) {}
  async fit(X: Matrix, y: number[], ctx: FitContext) {
    const n = X.length, d = X[0].length;
    const mf =
      this.p.maxFeatures === "sqrt" ? Math.max(1, Math.floor(Math.sqrt(d)))
      : this.p.maxFeatures === "log2" ? Math.max(1, Math.floor(Math.log2(d)))
      : d;
    const imp = new Array(d).fill(0);
    const evalSum = ctx.evalSet?.X.map(() => new Array(ctx.nClasses).fill(0));
    for (let t = 0; t < this.p.nEstimators; t++) {
      const idx = this.p.bootstrap ? Array.from({ length: n }, () => Math.floor(ctx.rng() * n)) : X.map((_, i) => i);
      const stats = { depth: 0, leaves: 0 };
      const treeImp = new Array(d).fill(0);
      const tree = buildTree(
        X, y, idx,
        { criterion: "gini", maxDepth: depthParam(this.p.maxDepth), minSamplesLeaf: this.p.minSamplesLeaf, maxFeatures: mf },
        ctx.nClasses, ctx.rng, treeImp, 0, stats,
      );
      const s = treeImp.reduce((a, b) => a + b, 0) || 1;
      treeImp.forEach((v, j) => (imp[j] += v / s));
      this.trees.push(tree);
      this.depths.push(stats.depth);
      if (evalSum && ctx.evalSet) {
        ctx.evalSet.X.forEach((x, i) => treePredict(tree, x).forEach((v, c) => (evalSum[i][c] += v)));
        this.history.push({ step: t + 1, valAcc: accuracyOf(evalSum, ctx.evalSet.y) });
      } else this.history.push({ step: t + 1 });
      ctx.onHistory?.(this.history, (t + 1) / this.p.nEstimators);
      await ctx.tick();
    }
    this.importances = imp.map((v) => v / this.trees.length);
  }
  predictProba(X: Matrix) {
    return X.map((x) => {
      const acc = treePredict(this.trees[0], x).slice();
      for (let t = 1; t < this.trees.length; t++) treePredict(this.trees[t], x).forEach((v, c) => (acc[c] += v));
      return acc.map((v) => v / this.trees.length);
    });
  }
  info() {
    const avg = this.depths.reduce((a, b) => a + b, 0) / (this.depths.length || 1);
    return `${this.trees.length} trees · average depth ${avg.toFixed(1)}`;
  }
}

/* ------------------------------------------------------------------ */
/* Gaussian Naive Bayes                                                */
/* ------------------------------------------------------------------ */
class GaussianNB implements Classifier {
  history: HistoryPoint[] = [];
  historyKind = null;
  private mean: Matrix = [];
  private vari: Matrix = [];
  private logPrior: number[] = [];
  constructor(private p: { varSmoothing: number }) {}
  async fit(X: Matrix, y: number[], ctx: FitContext) {
    const d = X[0].length, k = ctx.nClasses, n = X.length;
    const cnt = new Array(k).fill(0);
    this.mean = Array.from({ length: k }, () => new Array(d).fill(0));
    this.vari = Array.from({ length: k }, () => new Array(d).fill(0));
    X.forEach((x, i) => {
      cnt[y[i]]++;
      x.forEach((v, j) => (this.mean[y[i]][j] += v));
    });
    this.mean.forEach((m, c) => m.forEach((_, j) => (m[j] /= cnt[c] || 1)));
    X.forEach((x, i) => x.forEach((v, j) => (this.vari[y[i]][j] += (v - this.mean[y[i]][j]) ** 2)));
    let maxVar = 0;
    for (let j = 0; j < d; j++) {
      const mu = X.reduce((a, r) => a + r[j], 0) / n;
      maxVar = Math.max(maxVar, X.reduce((a, r) => a + (r[j] - mu) ** 2, 0) / n);
    }
    const eps = this.p.varSmoothing * maxVar;
    this.vari.forEach((v, c) => v.forEach((_, j) => (v[j] = v[j] / (cnt[c] || 1) + eps)));
    this.logPrior = cnt.map((c) => Math.log(Math.max(c, 1e-12) / n));
  }
  predictProba(X: Matrix) {
    return X.map((x) => {
      const z = this.logPrior.map((lp, c) => {
        let s = lp;
        x.forEach((v, j) => {
          const va = this.vari[c][j];
          s -= 0.5 * Math.log(2 * Math.PI * va) + (v - this.mean[c][j]) ** 2 / (2 * va);
        });
        return s;
      });
      softmaxInPlace(z);
      return z;
    });
  }
  info() {
    return `One bell curve per crop and column (${this.mean.length} × ${this.mean[0]?.length ?? 0} Gaussians)`;
  }
}

/* ------------------------------------------------------------------ */
/* Multi-layer perceptron (mini-batch Adam)                            */
/* ------------------------------------------------------------------ */
class MLP implements Classifier {
  history: HistoryPoint[] = [];
  historyKind = "epoch" as const;
  private sizes: number[] = [];
  private W: Float64Array[] = [];
  private b: Float64Array[] = [];
  constructor(
    private p: { hidden1: number; hidden2: number; activation: string; lr: number; alpha: number; epochs: number },
  ) {}

  private forward(X: Matrix, from: number, B: number, idx?: number[]): Float64Array[] {
    const acts: Float64Array[] = [];
    const a0 = new Float64Array(B * this.sizes[0]);
    for (let r = 0; r < B; r++) {
      const row = X[idx ? idx[from + r] : from + r];
      for (let j = 0; j < this.sizes[0]; j++) a0[r * this.sizes[0] + j] = row[j];
    }
    acts.push(a0);
    const relu = this.p.activation === "relu";
    for (let l = 0; l < this.W.length; l++) {
      const nin = this.sizes[l], nout = this.sizes[l + 1];
      const prev = acts[l], W = this.W[l], b = this.b[l];
      const out = new Float64Array(B * nout);
      for (let r = 0; r < B; r++) {
        for (let o = 0; o < nout; o++) out[r * nout + o] = b[o];
        for (let i = 0; i < nin; i++) {
          const a = prev[r * nin + i];
          if (a === 0) continue;
          for (let o = 0; o < nout; o++) out[r * nout + o] += a * W[i * nout + o];
        }
      }
      const last = l === this.W.length - 1;
      if (last) for (let r = 0; r < B; r++) softmaxInPlace(out, r * nout, nout);
      else for (let i = 0; i < out.length; i++) out[i] = relu ? Math.max(0, out[i]) : Math.tanh(out[i]);
      acts.push(out);
    }
    return acts;
  }

  async fit(X: Matrix, y: number[], ctx: FitContext) {
    const n = X.length;
    this.sizes = [X[0].length, this.p.hidden1, ...(this.p.hidden2 > 0 ? [this.p.hidden2] : []), ctx.nClasses];
    const L = this.sizes.length - 1;
    for (let l = 0; l < L; l++) {
      const nin = this.sizes[l], nout = this.sizes[l + 1];
      const bound = Math.sqrt(6 / (nin + nout));
      this.W.push(Float64Array.from({ length: nin * nout }, () => (ctx.rng() * 2 - 1) * bound));
      this.b.push(Float64Array.from({ length: nout }, () => (ctx.rng() * 2 - 1) * bound));
    }
    const optW = this.W.map((w) => new Adam(w.length, this.p.lr));
    const optB = this.b.map((b) => new Adam(b.length, this.p.lr));
    const batch = Math.min(200, n);
    const relu = this.p.activation === "relu";
    const every = Math.max(1, Math.round(this.p.epochs / 60));
    let t = 0;
    for (let epoch = 1; epoch <= this.p.epochs; epoch++) {
      const order = shuffle(X.map((_, i) => i), ctx.rng);
      let lossSum = 0;
      for (let from = 0; from < n; from += batch) {
        const B = Math.min(batch, n - from);
        const acts = this.forward(X, from, B, order);
        const k = ctx.nClasses;
        let delta = Float64Array.from(acts[L]);
        for (let r = 0; r < B; r++) {
          const yi = y[order[from + r]];
          lossSum -= Math.log(Math.max(acts[L][r * k + yi], 1e-15));
          delta[r * k + yi] -= 1;
        }
        for (let i = 0; i < delta.length; i++) delta[i] /= B;
        t++;
        for (let l = L - 1; l >= 0; l--) {
          const nin = this.sizes[l], nout = this.sizes[l + 1];
          const prev = acts[l];
          const gW = new Float64Array(nin * nout);
          const gB = new Float64Array(nout);
          for (let r = 0; r < B; r++)
            for (let o = 0; o < nout; o++) {
              const dlt = delta[r * nout + o];
              gB[o] += dlt;
              if (dlt === 0) continue;
              for (let i = 0; i < nin; i++) gW[i * nout + o] += prev[r * nin + i] * dlt;
            }
          let reg = 0;
          for (let i = 0; i < gW.length; i++) {
            gW[i] += (this.p.alpha * this.W[l][i]) / B;
            reg += this.W[l][i] ** 2;
          }
          lossSum += ((0.5 * this.p.alpha * reg) / B) * B;
          if (l > 0) {
            const nd = new Float64Array(B * nin);
            for (let r = 0; r < B; r++)
              for (let i = 0; i < nin; i++) {
                const a = prev[r * nin + i];
                const deriv = relu ? (a > 0 ? 1 : 0) : 1 - a * a;
                if (deriv === 0) continue;
                let s = 0;
                for (let o = 0; o < nout; o++) s += delta[r * nout + o] * this.W[l][i * nout + o];
                nd[r * nin + i] = s * deriv;
              }
            optW[l].step(this.W[l], gW, t);
            optB[l].step(this.b[l], gB, t);
            delta = nd;
          } else {
            optW[l].step(this.W[l], gW, t);
            optB[l].step(this.b[l], gB, t);
          }
        }
        await ctx.tick();
      }
      const point: HistoryPoint = { step: epoch, loss: lossSum / n };
      if (epoch % every === 0 || epoch === this.p.epochs) {
        point.trainAcc = accuracyOf(this.predictProba(X), y);
        if (ctx.evalSet) point.valAcc = accuracyOf(this.predictProba(ctx.evalSet.X), ctx.evalSet.y);
        ctx.onHistory?.(this.history.concat(point), epoch / this.p.epochs);
      }
      this.history.push(point);
    }
  }
  predictProba(X: Matrix): Matrix {
    const out: Matrix = [];
    const k = this.sizes[this.sizes.length - 1];
    for (let from = 0; from < X.length; from += 512) {
      const B = Math.min(512, X.length - from);
      const a = this.forward(X, from, B)[this.sizes.length - 1];
      for (let r = 0; r < B; r++) out.push(Array.from(a.subarray(r * k, (r + 1) * k)));
    }
    return out;
  }
  info() {
    const params = this.W.reduce((a, w) => a + w.length, 0) + this.b.reduce((a, b) => a + b.length, 0);
    return `Layers ${this.sizes.join(" → ")} · ${params.toLocaleString()} weights · ${this.history.length} epochs`;
  }
}

export function createModel(spec: ModelSpec): Classifier {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = spec.params as any;
  switch (spec.type) {
    case "logreg": return new LogisticRegression(p);
    case "knn": return new KNN(p);
    case "tree": return new DecisionTree(p);
    case "forest": return new RandomForest(p);
    case "gnb": return new GaussianNB(p);
    case "mlp": return new MLP(p);
  }
}

export { argmax, gaussian };
