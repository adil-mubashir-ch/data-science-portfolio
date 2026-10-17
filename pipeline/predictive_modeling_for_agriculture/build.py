"""Build web assets for the crop recommendation project.

Outputs to web/public/data/predictive_modeling_for_agriculture/:
  - soil_measures.json : the dataset in a compact, browser-friendly shape
  - reference.json     : scikit-learn results used as ground truth on the page
  - cover.jpg          : card image for the home page gallery

Run from the repo root:
    python pipeline/predictive_modeling_for_agriculture/build.py
"""

import itertools
import json
import shutil
from pathlib import Path

import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

SLUG = "predictive_modeling_for_agriculture"
ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "notebooks" / SLUG
OUT = ROOT / "web" / "public" / "data" / SLUG
FEATURES = ["N", "P", "K", "ph"]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    crops = pd.read_csv(SRC / "soil_measures.csv")
    classes = sorted(crops["crop"].unique())
    class_index = {c: i for i, c in enumerate(classes)}

    # 1. Dataset ------------------------------------------------------------
    dataset = {
        "features": FEATURES,
        "classes": classes,
        "X": [
            [int(r.N), int(r.P), int(r.K), round(float(r.ph), 3)]
            for r in crops.itertuples(index=False)
        ],
        "y": [class_index[c] for c in crops["crop"]],
    }
    (OUT / "soil_measures.json").write_text(json.dumps(dataset, separators=(",", ":")))

    # 2. Reference results (same split as the notebook) ---------------------
    X, y = crops[FEATURES], crops["crop"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    def score(model, cols=FEATURES):
        model.fit(X_train[cols], y_train)
        pred = model.predict(X_test[cols])
        return {
            "train": round(model.score(X_train[cols], y_train), 4),
            "test": round(accuracy_score(y_test, pred), 4),
            "f1": round(f1_score(y_test, pred, average="macro"), 4),
        }

    scaled = lambda m: make_pipeline(StandardScaler(), m)  # noqa: E731
    models = {
        "Logistic regression (notebook, unscaled)": LogisticRegression(max_iter=2000, random_state=42),
        "Logistic regression + StandardScaler": scaled(LogisticRegression(max_iter=2000)),
        "k-NN (k=5), unscaled": KNeighborsClassifier(5),
        "k-NN (k=5) + StandardScaler": scaled(KNeighborsClassifier(5)),
        "Gaussian Naive Bayes": GaussianNB(),
        "Decision tree (no depth limit)": DecisionTreeClassifier(random_state=0),
        "Random forest (200 trees)": RandomForestClassifier(200, random_state=0),
        "Neural network (64-64) + StandardScaler": scaled(
            MLPClassifier((64, 64), max_iter=2000, random_state=0)
        ),
    }
    model_results = [{"name": name, **score(m)} for name, m in models.items()]

    single_feature = {
        f: score(LogisticRegression(max_iter=2000, random_state=42), [f])["test"]
        for f in FEATURES
    }

    subsets = []
    for k in range(1, len(FEATURES) + 1):
        for cols in itertools.combinations(FEATURES, k):
            subsets.append(
                {
                    "features": list(cols),
                    "test": score(RandomForestClassifier(200, random_state=0), list(cols))["test"],
                }
            )

    reference = {
        "sklearnVersion": sklearn.__version__,
        "split": "train_test_split(test_size=0.2, random_state=42), as in the notebook",
        "models": model_results,
        "singleFeatureLogReg": single_feature,
        "randomForestSubsets": subsets,
    }
    (OUT / "reference.json").write_text(json.dumps(reference, indent=2))

    # 3. Cover image ---------------------------------------------------------
    shutil.copy(SRC / "farmer_in_a_field.jpg", OUT / "cover.jpg")

    print(f"Wrote {len(dataset['X'])} rows, {len(classes)} classes to {OUT}")
    for r in model_results:
        print(f"  {r['name']:<45} train={r['train']:.3f} test={r['test']:.3f}")


if __name__ == "__main__":
    main()
