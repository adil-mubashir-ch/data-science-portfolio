import type { LabConfig, StepSpec } from "./types";

const py = (v: unknown) =>
  typeof v === "boolean" ? (v ? "True" : "False") : typeof v === "string" ? `"${v}"` : String(v);
const depth = (v: unknown) => (Number(v) >= 30 ? "None" : String(v));

function stepCode(s: StepSpec, imports: Set<string>, helpers: Set<string>): [string, string] {
  switch (s.type) {
    case "standard":
      imports.add("from sklearn.preprocessing import StandardScaler");
      return ["scale", "StandardScaler()"];
    case "minmax":
      imports.add("from sklearn.preprocessing import MinMaxScaler");
      return ["minmax", "MinMaxScaler()"];
    case "robust":
      imports.add("from sklearn.preprocessing import RobustScaler");
      return ["robust", "RobustScaler()"];
    case "log":
      imports.add("import numpy as np");
      imports.add("from sklearn.preprocessing import FunctionTransformer");
      return ["log", "FunctionTransformer(lambda X: np.sign(X) * np.log1p(np.abs(X)))"];
    case "clip":
      imports.add("import numpy as np");
      imports.add("from sklearn.base import BaseEstimator, TransformerMixin");
      helpers.add(`class IQRClipper(BaseEstimator, TransformerMixin):
    """Cap every column at [Q1 - k*IQR, Q3 + k*IQR] learned on the training data."""

    def __init__(self, k=1.5):
        self.k = k

    def fit(self, X, y=None):
        q1, q3 = np.percentile(X, [25, 75], axis=0)
        self.low_, self.high_ = q1 - self.k * (q3 - q1), q3 + self.k * (q3 - q1)
        return self

    def transform(self, X):
        return np.clip(X, self.low_, self.high_)`);
      return ["clip", `IQRClipper(k=${s.params.k})`];
    case "poly":
      imports.add("from sklearn.preprocessing import PolynomialFeatures");
      return ["poly", `PolynomialFeatures(degree=${s.params.degree}, interaction_only=${py(s.params.interactionOnly)}, include_bias=False)`];
    case "pca":
      imports.add("from sklearn.decomposition import PCA");
      return ["pca", `PCA(n_components=${s.params.nComponents})`];
    case "bins":
      imports.add("from sklearn.preprocessing import KBinsDiscretizer");
      return ["bins", `KBinsDiscretizer(n_bins=${s.params.nBins}, encode="ordinal", strategy="${s.params.strategy}")`];
  }
}

function modelCode(c: LabConfig, imports: Set<string>): string {
  const p = c.model.params;
  const seed = c.validation.seed;
  switch (c.model.type) {
    case "logreg":
      imports.add("from sklearn.linear_model import LogisticRegression");
      return `LogisticRegression(C=${p.C}, max_iter=${p.epochs})  # the web app uses Adam (lr=${p.lr}) instead of lbfgs`;
    case "knn":
      imports.add("from sklearn.neighbors import KNeighborsClassifier");
      return `KNeighborsClassifier(n_neighbors=${p.k}, weights="${p.weights}", metric="${p.metric}")`;
    case "tree":
      imports.add("from sklearn.tree import DecisionTreeClassifier");
      return `DecisionTreeClassifier(criterion="${p.criterion}", max_depth=${depth(p.maxDepth)}, min_samples_leaf=${p.minSamplesLeaf}, random_state=${seed})`;
    case "forest":
      imports.add("from sklearn.ensemble import RandomForestClassifier");
      return `RandomForestClassifier(
        n_estimators=${p.nEstimators},
        max_depth=${depth(p.maxDepth)},
        max_features=${p.maxFeatures === "all" ? "None" : `"${p.maxFeatures}"`},
        min_samples_leaf=${p.minSamplesLeaf},
        bootstrap=${py(p.bootstrap)},
        random_state=${seed},
    )`;
    case "gnb":
      imports.add("from sklearn.naive_bayes import GaussianNB");
      return `GaussianNB(var_smoothing=${p.varSmoothing})`;
    case "mlp": {
      imports.add("from sklearn.neural_network import MLPClassifier");
      const layers = Number(p.hidden2) > 0 ? `(${p.hidden1}, ${p.hidden2})` : `(${p.hidden1},)`;
      return `MLPClassifier(
        hidden_layer_sizes=${layers},
        activation="${p.activation}",
        learning_rate_init=${p.lr},
        alpha=${p.alpha},
        max_iter=${p.epochs},
        random_state=${seed},
    )`;
    }
  }
}

/** Equivalent scikit-learn code for the current lab configuration. */
export function toSklearn(c: LabConfig, csv: string, target: string): string {
  const imports = new Set<string>(["import pandas as pd", "from sklearn.pipeline import Pipeline"]);
  const helpers = new Set<string>();
  const steps = c.steps.filter((s) => s.enabled).map((s) => stepCode(s, imports, helpers));
  const used = new Map<string, number>();
  const named = steps.map(([name, code]) => {
    const n = (used.get(name) ?? 0) + 1;
    used.set(name, n);
    return [n > 1 ? `${name}_${n}` : name, code];
  });
  const model = modelCode(c, imports);
  const v = c.validation;
  if (v.mode === "holdout") {
    imports.add("from sklearn.model_selection import train_test_split");
    imports.add("from sklearn.metrics import classification_report");
  } else imports.add("from sklearn.model_selection import StratifiedKFold, cross_val_score");

  const sorted = [...imports].sort((a, b) => (a.startsWith("import") === b.startsWith("import") ? a.localeCompare(b) : a.startsWith("import") ? -1 : 1));
  const pipe = [...named.map(([n, code]) => `    ("${n}", ${code}),`), `    ("model", ${model}),`].join("\n");
  const evalCode =
    v.mode === "holdout"
      ? `X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=${v.testSize}, ${v.stratify ? "stratify=y, " : ""}random_state=${v.seed}
)

pipe.fit(X_train, y_train)
print(f"Train accuracy: {pipe.score(X_train, y_train):.3f}")
print(f"Test accuracy:  {pipe.score(X_test, y_test):.3f}")
print(classification_report(y_test, pipe.predict(X_test)))`
      : `cv = StratifiedKFold(n_splits=${v.folds}, shuffle=True, random_state=${v.seed})
scores = cross_val_score(pipe, X, y, cv=cv, scoring="accuracy")
print(f"CV accuracy: {scores.mean():.3f} ± {scores.std():.3f}")`;

  return [
    sorted.join("\n"),
    ...(helpers.size ? ["", "", [...helpers].join("\n\n\n")] : []),
    "",
    "",
    `df = pd.read_csv("${csv}")`,
    `X = df[${JSON.stringify(c.features).replace(/,/g, ", ")}]`,
    `y = df["${target}"]`,
    "",
    `pipe = Pipeline([\n${pipe}\n])`,
    "",
    evalCode,
    "",
  ].join("\n");
}
