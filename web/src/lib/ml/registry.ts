import type { ModelType, Params, StepType } from "./types";

export type ParamSchema =
  | { key: string; label: string; kind: "int"; min: number; max: number; step?: number; help: string; noneAtMax?: boolean }
  | { key: string; label: string; kind: "float"; min: number; max: number; step: number; help: string }
  | { key: string; label: string; kind: "log"; min: number; max: number; help: string }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[]; help: string }
  | { key: string; label: string; kind: "bool"; help: string };

export interface Learn {
  what: string;
  how: string;
  tryThis: string;
}

export interface ComponentInfo {
  label: string;
  short: string;
  /** Category used to group items in the palette. */
  group: string;
  params: ParamSchema[];
  defaults: Params;
  learn: Learn;
}

export const STEPS: Record<StepType, ComponentInfo> = {
  standard: {
    label: "Standard scaler",
    short: "Mean 0, std 1 for every column",
    group: "Scaling",
    params: [],
    defaults: {},
    learn: {
      what: "Rescales every column so it has mean 0 and standard deviation 1.",
      how: "Distance-based and gradient-based models (k-NN, logistic regression, neural nets) treat a column with big numbers as more important. K ranges up to 205 while pH tops out near 10, so without scaling pH barely registers.",
      tryThis: "Train k-NN without this step, then with it. Tree models shouldn't care. Can you see why?",
    },
  },
  minmax: {
    label: "Min-max scaler",
    short: "Squeeze every column into [0, 1]",
    group: "Scaling",
    params: [],
    defaults: {},
    learn: {
      what: "Linearly maps each column so the training minimum becomes 0 and the maximum becomes 1.",
      how: "Same goal as standard scaling, but a single extreme value (like K ≈ 200 for apples and grapes) squashes everyone else into a narrow band.",
      tryThis: "Compare min-max with standard scaling on k-NN. Watch the K histogram in the step card.",
    },
  },
  robust: {
    label: "Robust scaler",
    short: "Median & IQR: outlier-proof scaling",
    group: "Scaling",
    params: [],
    defaults: {},
    learn: {
      what: "Subtracts the median and divides by the interquartile range (the middle 50% of values).",
      how: "Medians and quartiles ignore extreme values, so a handful of outliers can't distort the scale for everyone else.",
      tryThis: "Look at K's histogram after robust vs min-max scaling. Which one keeps the bulk of the data spread out?",
    },
  },
  log: {
    label: "Log transform",
    short: "Tame long right-skewed tails",
    group: "Shape",
    params: [],
    defaults: {},
    learn: {
      what: "Applies sign(x)·log(1 + |x|) to every value.",
      how: "K is heavily right-skewed: most fields sit below 50 but a few hit 200. A log compresses large values far more than small ones, giving models a more even spread to work with.",
      tryThis: "Order matters! Put the log before a scaler, then after. After standard scaling, values are already near 0, so the log does very little.",
    },
  },
  clip: {
    label: "Clip outliers",
    short: "Cap values beyond k·IQR",
    group: "Shape",
    params: [{ key: "k", label: "IQR multiplier", kind: "float", min: 0.5, max: 4, step: 0.25, help: "Smaller = more aggressive clipping. 1.5 is the classic boxplot whisker." }],
    defaults: { k: 1.5 },
    learn: {
      what: "Caps each value at the boxplot whiskers: [Q1 − k·IQR, Q3 + k·IQR].",
      how: "Outliers are not always noise. Here, extreme K is exactly what identifies apples and grapes. Clipping them can destroy the signal.",
      tryThis: "Set k to 0.5 and watch accuracy for apple and grapes in the per-crop view drop.",
    },
  },
  poly: {
    label: "Polynomial features",
    short: "Add products & powers of columns",
    group: "Features",
    params: [
      { key: "degree", label: "Degree", kind: "int", min: 2, max: 3, help: "Degree 2 adds N², N·P, …; degree 3 adds N³, N²·P, …" },
      { key: "interactionOnly", label: "Interactions only", kind: "bool", help: "Only products of different columns (N·P), no powers (N²)." },
    ],
    defaults: { degree: 2, interactionOnly: false },
    learn: {
      what: "Creates new columns from products and powers of the existing ones.",
      how: "A linear model can only draw straight boundaries. With N², N·P etc. it can draw curves, but it needs more data and is easier to overfit.",
      tryThis: "Add this before logistic regression (with a scaler after it). Does a linear model become competitive with the tree models?",
    },
  },
  pca: {
    label: "PCA",
    short: "Rotate to principal components",
    group: "Features",
    params: [{ key: "nComponents", label: "Components", kind: "int", min: 1, max: 8, help: "How many directions of greatest variance to keep." }],
    defaults: { nComponents: 2 },
    learn: {
      what: "Finds the directions along which the data varies most and keeps only the top few.",
      how: "PCA is unsupervised: it doesn't know which crop is which. Directions with the most variance are not always the ones that separate classes. P and K are 74% correlated, so PCA merges them.",
      tryThis: "Without a scaler first, PCA is dominated by K (largest numbers). Add a standard scaler before PCA and compare.",
    },
  },
  bins: {
    label: "Binning",
    short: "Bucket values into discrete bins",
    group: "Features",
    params: [
      { key: "nBins", label: "Bins", kind: "int", min: 2, max: 20, help: "Number of buckets per column." },
      {
        key: "strategy", label: "Strategy", kind: "select", help: "Uniform = equal width; quantile = equal count.",
        options: [{ value: "uniform", label: "Uniform width" }, { value: "quantile", label: "Quantile (equal count)" }],
      },
    ],
    defaults: { nBins: 5, strategy: "quantile" },
    learn: {
      what: "Replaces each number with the bucket it falls into (0, 1, 2, …).",
      how: "Binning trades detail for robustness. Farmers often get soil readings as low/medium/high bands, so this tells you how much accuracy you lose when measurements are coarse.",
      tryThis: "Drop to 3 bins (low / medium / high). How much accuracy survives?",
    },
  },
};

const DEPTH = { min: 1, max: 30, noneAtMax: true } as const;

export const MODELS: Record<ModelType, ComponentInfo> = {
  logreg: {
    label: "Logistic regression",
    short: "Linear boundaries, probabilistic",
    group: "Linear",
    params: [
      { key: "C", label: "C (inverse regularisation)", kind: "log", min: 0.001, max: 1000, help: "Small C = strong penalty on weights = simpler model." },
      { key: "epochs", label: "Training epochs", kind: "int", min: 10, max: 2000, step: 10, help: "Full passes of gradient descent over the training data." },
      { key: "lr", label: "Learning rate", kind: "log", min: 0.0005, max: 1, help: "Step size for the Adam optimiser." },
    ],
    defaults: { C: 1, epochs: 300, lr: 0.05 },
    learn: {
      what: "Learns one weight per column per crop, then turns the weighted sums into probabilities with a softmax.",
      how: "Each pair of crops is separated by a straight line (a flat plane in 4D). Crops whose soil profiles overlap or curve around each other are hard for it, which is why the notebook stopped at ~66%.",
      tryThis: "Watch the loss curve with and without a scaler. Unscaled data makes the optimiser zig-zag.",
    },
  },
  knn: {
    label: "k-nearest neighbours",
    short: "Vote among the most similar fields",
    group: "Instance-based",
    params: [
      { key: "k", label: "Neighbours (k)", kind: "int", min: 1, max: 60, help: "How many similar fields get a vote." },
      {
        key: "weights", label: "Vote weighting", kind: "select", help: "Distance weighting lets closer fields count more.",
        options: [{ value: "uniform", label: "Uniform" }, { value: "distance", label: "By distance" }],
      },
      {
        key: "metric", label: "Distance", kind: "select", help: "How 'similar' is measured.",
        options: [{ value: "euclidean", label: "Euclidean" }, { value: "manhattan", label: "Manhattan" }],
      },
    ],
    defaults: { k: 5, weights: "uniform", metric: "euclidean" },
    learn: {
      what: "No training at all: to classify a field, find the k most similar fields in the training set and let them vote.",
      how: "Small k memorises noise (jagged boundaries, overfitting); large k blurs crops together (underfitting). It depends completely on how distance is measured, so scaling matters a lot.",
      tryThis: "Set k = 1: train accuracy hits 100%. Is the test accuracy as impressive?",
    },
  },
  tree: {
    label: "Decision tree",
    short: "A flowchart of if/else soil rules",
    group: "Trees",
    params: [
      { key: "maxDepth", label: "Max depth", kind: "int", ...DEPTH, help: "Max number of questions asked in a row. 30 = no limit." },
      { key: "minSamplesLeaf", label: "Min fields per leaf", kind: "int", min: 1, max: 50, help: "Each final rule must cover at least this many training fields." },
      {
        key: "criterion", label: "Split criterion", kind: "select", help: "How 'mixed' a group of crops is measured.",
        options: [{ value: "gini", label: "Gini impurity" }, { value: "entropy", label: "Entropy" }],
      },
    ],
    defaults: { maxDepth: 30, minSamplesLeaf: 1, criterion: "gini" },
    learn: {
      what: "Repeatedly asks yes/no questions like 'K ≤ 120?' that best separate the crops, building a flowchart.",
      how: "Trees don't care about scale (only the order of values matters) and can carve out boxy regions. Unlimited depth means every training field gets its own rule, which is a classic overfit.",
      tryThis: "Slide max depth from 2 to 30 and watch the gap between train and test accuracy grow.",
    },
  },
  forest: {
    label: "Random forest",
    short: "Hundreds of trees voting together",
    group: "Trees",
    params: [
      { key: "nEstimators", label: "Number of trees", kind: "int", min: 1, max: 300, help: "More trees = smoother, more stable votes (slower)." },
      { key: "maxDepth", label: "Max depth", kind: "int", ...DEPTH, help: "Per-tree depth limit. 30 = no limit." },
      {
        key: "maxFeatures", label: "Columns per split", kind: "select", help: "Random subset of columns each split may consider. Decorrelates the trees.",
        options: [{ value: "sqrt", label: "√columns" }, { value: "log2", label: "log₂ columns" }, { value: "all", label: "All columns" }],
      },
      { key: "minSamplesLeaf", label: "Min fields per leaf", kind: "int", min: 1, max: 50, help: "Regularises each tree." },
      { key: "bootstrap", label: "Bootstrap samples", kind: "bool", help: "Each tree trains on a random resample of the fields." },
    ],
    defaults: { nEstimators: 100, maxDepth: 30, maxFeatures: "sqrt", minSamplesLeaf: 1, bootstrap: true },
    learn: {
      what: "Trains many decision trees on random resamples of the data and random subsets of columns, then averages their votes.",
      how: "Each tree overfits differently; averaging cancels out much of that noise (lower variance) while keeping the flexibility. This is usually the strongest model here.",
      tryThis: "Watch the 'accuracy vs number of trees' curve: where does adding trees stop helping?",
    },
  },
  gnb: {
    label: "Gaussian Naive Bayes",
    short: "Bell curves per crop, Bayes' rule",
    group: "Probabilistic",
    params: [{ key: "varSmoothing", label: "Variance smoothing", kind: "log", min: 1e-12, max: 1, help: "Adds a fraction of the largest variance to every bell curve, making them wider." }],
    defaults: { varSmoothing: 1e-9 },
    learn: {
      what: "Models each column for each crop as a bell curve, then uses Bayes' rule to ask which crop makes this soil most likely.",
      how: "It assumes columns are independent within a crop. P and K are strongly correlated, which breaks that assumption, yet it still does surprisingly well because each crop's soil is tightly clustered.",
      tryThis: "Raise variance smoothing towards 1 and watch the bell curves flatten until every crop looks the same.",
    },
  },
  mlp: {
    label: "Neural network",
    short: "Layers of learned non-linear features",
    group: "Neural",
    params: [
      { key: "hidden1", label: "Hidden layer 1 units", kind: "int", min: 2, max: 128, help: "Neurons in the first hidden layer." },
      { key: "hidden2", label: "Hidden layer 2 units", kind: "int", min: 0, max: 128, help: "0 = no second layer." },
      {
        key: "activation", label: "Activation", kind: "select", help: "The non-linearity applied by each neuron.",
        options: [{ value: "relu", label: "ReLU" }, { value: "tanh", label: "tanh" }],
      },
      { key: "lr", label: "Learning rate", kind: "log", min: 0.0001, max: 0.3, help: "Adam step size." },
      { key: "alpha", label: "L2 penalty (alpha)", kind: "log", min: 1e-6, max: 10, help: "Weight decay; bigger = simpler network." },
      { key: "epochs", label: "Epochs", kind: "int", min: 5, max: 600, step: 5, help: "Passes over the data (mini-batches of 200)." },
    ],
    defaults: { hidden1: 32, hidden2: 0, activation: "relu", lr: 0.005, alpha: 0.0001, epochs: 200 },
    learn: {
      what: "Stacks layers of neurons that each compute a weighted sum followed by a non-linearity; trained by back-propagation.",
      how: "Hidden layers learn their own features (like 'high P and high K'), so a network can draw curved boundaries. It is very sensitive to scaling and learning rate.",
      tryThis: "Remove the scaler and watch the loss curve. Then crank the learning rate up to 0.3: training becomes unstable.",
    },
  },
};

export const STEP_ORDER: StepType[] = ["standard", "minmax", "robust", "log", "clip", "poly", "pca", "bins"];
export const MODEL_ORDER: ModelType[] = ["logreg", "knn", "tree", "forest", "gnb", "mlp"];

export function formatParam(schema: ParamSchema, v: unknown): string {
  if (schema.kind === "bool") return v ? "on" : "off";
  if (schema.kind === "select") return schema.options.find((o) => o.value === v)?.label ?? String(v);
  const n = Number(v);
  if (schema.kind === "int" && schema.noneAtMax && n >= schema.max) return "no limit";
  if (schema.kind === "log") return n >= 1000 || n < 0.001 ? n.toExponential(0) : String(+n.toPrecision(2));
  return String(+n.toFixed(3));
}

/** Values to try when sweeping a numeric parameter. */
export function sweepValues(schema: ParamSchema, count = 12): number[] {
  if (schema.kind === "log") {
    const a = Math.log10(schema.min), b = Math.log10(schema.max);
    return Array.from({ length: count }, (_, i) => +(10 ** (a + ((b - a) * i) / (count - 1))).toPrecision(3));
  }
  if (schema.kind === "int") {
    const vals = Array.from({ length: count }, (_, i) => Math.round(schema.min + ((schema.max - schema.min) * i) / (count - 1)));
    return [...new Set(vals)];
  }
  if (schema.kind === "float")
    return Array.from({ length: count }, (_, i) => +(schema.min + ((schema.max - schema.min) * i) / (count - 1)).toFixed(3));
  return [];
}
