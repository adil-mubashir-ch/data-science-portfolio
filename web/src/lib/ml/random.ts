export type Rng = () => number;

/** Small, fast, seedable PRNG so every run is reproducible. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function gaussian(rng: Rng): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function byClass(y: number[], idx: number[]): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  for (const i of idx) {
    const g = groups.get(y[i]);
    if (g) g.push(i);
    else groups.set(y[i], [i]);
  }
  return groups;
}

export function holdoutSplit(
  y: number[],
  testSize: number,
  stratify: boolean,
  seed: number,
): { train: number[]; test: number[] } {
  const rng = mulberry32(seed);
  const all = y.map((_, i) => i);
  const train: number[] = [];
  const test: number[] = [];
  const groups = stratify ? [...byClass(y, all).values()] : [all];
  for (const g of groups) {
    const s = shuffle(g, rng);
    const nTest = Math.round(s.length * testSize);
    test.push(...s.slice(0, nTest));
    train.push(...s.slice(nTest));
  }
  return { train: train.sort((a, b) => a - b), test: test.sort((a, b) => a - b) };
}

/** Stratified k-fold: returns the test indices of each fold. */
export function kFold(y: number[], k: number, seed: number): number[][] {
  const rng = mulberry32(seed);
  const folds: number[][] = Array.from({ length: k }, () => []);
  let offset = 0;
  for (const g of byClass(y, y.map((_, i) => i)).values()) {
    shuffle(g, rng).forEach((idx, i) => folds[(i + offset) % k].push(idx));
    offset += g.length;
  }
  return folds;
}

/** Stratified subsample of `idx` keeping roughly `fraction` of each class. */
export function subsample(y: number[], idx: number[], fraction: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const out: number[] = [];
  for (const g of byClass(y, idx).values()) {
    const n = Math.max(1, Math.round(g.length * fraction));
    out.push(...shuffle(g, rng).slice(0, n));
  }
  return out;
}
