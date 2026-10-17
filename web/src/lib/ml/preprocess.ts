import type { Matrix, StepSpec } from "./types";

export interface FittedStep {
  names: string[];
  info: string;
  transform(X: Matrix): Matrix;
}

const column = (X: Matrix, j: number) => X.map((r) => r[j]);

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function mapCols(X: Matrix, fns: ((v: number) => number)[]): Matrix {
  return X.map((r) => r.map((v, j) => fns[j](v)));
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2));

export function fitStep(spec: StepSpec, X: Matrix, names: string[]): FittedStep {
  const d = names.length;
  const p = spec.params;

  switch (spec.type) {
    case "standard": {
      const mean = names.map((_, j) => column(X, j).reduce((a, b) => a + b, 0) / X.length);
      const std = names.map((_, j) => {
        const v = column(X, j).reduce((a, b) => a + (b - mean[j]) ** 2, 0) / X.length;
        return Math.sqrt(v) || 1;
      });
      return {
        names,
        info: `Learned ${d} means and ${d} standard deviations, e.g. ${names[0]}: μ=${fmt(mean[0])}, σ=${fmt(std[0])}`,
        transform: (M) => mapCols(M, mean.map((m, j) => (v: number) => (v - m) / std[j])),
      };
    }
    case "minmax": {
      const min = names.map((_, j) => Math.min(...column(X, j)));
      const max = names.map((_, j) => Math.max(...column(X, j)));
      return {
        names,
        info: `Squeezes each column into [0, 1] using the training min and max, e.g. ${names[0]}: ${fmt(min[0])}…${fmt(max[0])}`,
        transform: (M) => mapCols(M, min.map((lo, j) => (v: number) => (v - lo) / (max[j] - lo || 1))),
      };
    }
    case "robust": {
      const stats = names.map((_, j) => {
        const s = column(X, j).sort((a, b) => a - b);
        const q1 = quantile(s, 0.25);
        const q3 = quantile(s, 0.75);
        return { med: quantile(s, 0.5), iqr: q3 - q1 || 1 };
      });
      return {
        names,
        info: `Centres on the median and divides by the IQR, so outliers barely move the scale (${names[0]}: median ${fmt(stats[0].med)}, IQR ${fmt(stats[0].iqr)})`,
        transform: (M) => mapCols(M, stats.map((s) => (v: number) => (v - s.med) / s.iqr)),
      };
    }
    case "log": {
      const f = (v: number) => Math.sign(v) * Math.log1p(Math.abs(v));
      return {
        names: names.map((n) => `log(${n})`),
        info: "Applies sign(x)·log(1+|x|): long right tails get pulled in, small values keep their spacing",
        transform: (M) => M.map((r) => r.map(f)),
      };
    }
    case "clip": {
      const k = Number(p.k);
      const bounds = names.map((_, j) => {
        const s = column(X, j).sort((a, b) => a - b);
        const q1 = quantile(s, 0.25);
        const q3 = quantile(s, 0.75);
        return [q1 - k * (q3 - q1), q3 + k * (q3 - q1)];
      });
      let clipped = 0;
      for (const r of X) r.forEach((v, j) => (v < bounds[j][0] || v > bounds[j][1]) && clipped++);
      return {
        names,
        info: `Caps values outside [Q1 − ${k}·IQR, Q3 + ${k}·IQR]: ${((100 * clipped) / (X.length * d)).toFixed(1)}% of training values were clipped`,
        transform: (M) => mapCols(M, bounds.map(([lo, hi]) => (v: number) => Math.min(hi, Math.max(lo, v)))),
      };
    }
    case "poly": {
      const degree = Number(p.degree);
      const interactionOnly = Boolean(p.interactionOnly);
      const terms: number[][] = [];
      const rec = (start: number, cur: number[], deg: number) => {
        if (cur.length === deg) return void terms.push(cur.slice());
        for (let j = start; j < d; j++) rec(interactionOnly ? j + 1 : j, [...cur, j], deg);
      };
      for (let deg = 1; deg <= degree; deg++) rec(0, [], deg);
      const termName = (t: number[]) => {
        const counts = new Map<number, number>();
        t.forEach((j) => counts.set(j, (counts.get(j) ?? 0) + 1));
        return [...counts].map(([j, c]) => names[j] + (c === 2 ? "²" : c === 3 ? "³" : "")).join("·");
      };
      return {
        names: terms.map(termName),
        info: `Expands ${d} columns into ${terms.length}: every ${interactionOnly ? "interaction" : "product and power"} up to degree ${degree}`,
        transform: (M) => M.map((r) => terms.map((t) => t.reduce((acc, j) => acc * r[j], 1))),
      };
    }
    case "pca": {
      const k = Math.min(Number(p.nComponents), d);
      const mean = names.map((_, j) => column(X, j).reduce((a, b) => a + b, 0) / X.length);
      const cov: Matrix = names.map(() => new Array(d).fill(0));
      for (const r of X)
        for (let a = 0; a < d; a++) for (let b = a; b < d; b++) cov[a][b] += (r[a] - mean[a]) * (r[b] - mean[b]);
      for (let a = 0; a < d; a++)
        for (let b = a; b < d; b++) {
          cov[a][b] /= X.length - 1;
          cov[b][a] = cov[a][b];
        }
      const { values, vectors } = jacobiEigen(cov);
      const order = values.map((_, i) => i).sort((a, b) => values[b] - values[a]).slice(0, k);
      const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
      const comps = order.map((i) => {
        const v = vectors.map((row) => row[i]);
        const big = v.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
        return big < 0 ? v.map((x) => -x) : v;
      });
      const ratios = order.map((i) => values[i] / total);
      const kept = ratios.reduce((a, b) => a + b, 0);
      return {
        names: comps.map((_, i) => `PC${i + 1}`),
        info: `${ratios.map((r, i) => `PC${i + 1} ${(100 * r).toFixed(0)}%`).join(", ")}: keeps ${(100 * kept).toFixed(1)}% of the variance`,
        transform: (M) => M.map((r) => comps.map((c) => c.reduce((acc, w, j) => acc + w * (r[j] - mean[j]), 0))),
      };
    }
    case "bins": {
      const nBins = Number(p.nBins);
      const edges = names.map((_, j) => {
        const s = column(X, j).sort((a, b) => a - b);
        const e =
          p.strategy === "quantile"
            ? Array.from({ length: nBins + 1 }, (_, i) => quantile(s, i / nBins))
            : Array.from({ length: nBins + 1 }, (_, i) => s[0] + ((s[s.length - 1] - s[0]) * i) / nBins);
        return [...new Set(e)].slice(1, -1);
      });
      return {
        names: names.map((n) => `bin(${n})`),
        info: `Replaces each value with its bin number (0…${nBins - 1}, ${p.strategy} bins). Detail inside a bin is thrown away`,
        transform: (M) =>
          M.map((r) =>
            r.map((v, j) => {
              let b = 0;
              while (b < edges[j].length && v >= edges[j][b]) b++;
              return b;
            }),
          ),
      };
    }
  }
}

/** Eigen-decomposition of a small symmetric matrix (cyclic Jacobi). Eigenvectors are columns. */
export function jacobiEigen(A: Matrix): { values: number[]; vectors: Matrix } {
  const n = A.length;
  const a = A.map((r) => r.slice());
  const v: Matrix = a.map((_, i) => a.map((_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}
