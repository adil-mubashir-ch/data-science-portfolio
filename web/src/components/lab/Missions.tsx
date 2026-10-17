import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Trophy } from "lucide-react";
import { useLab, type RunRecord } from "./LabContext";
import { cx } from "../ui";

const SCALERS = ["standard", "minmax", "robust"];
const scaled = (r: RunRecord) => r.config.steps.some((s) => s.enabled && SCALERS.includes(s.type));
const plainKnn = (r: RunRecord, all: number) => r.config.model.type === "knn" && r.config.features.length === all;

interface Mission {
  id: string;
  title: string;
  hint: string;
  done: (runs: RunRecord[], ach: Set<string>, baseline: number, nFeatures: number) => boolean;
}

export const MISSIONS: Mission[] = [
  { id: "first", title: "Train your first model", hint: "Hit Train, or just change any setting.", done: (r) => r.length > 0 },
  { id: "beat", title: "Beat the notebook", hint: "Get test accuracy above the original logistic regression.", done: (r, _a, b) => r.some((x) => x.testAcc > b + 0.005) },
  {
    id: "scale", title: "Prove that scaling matters", hint: "Train k-NN without a scaler, then with one. Scaled must win by 5+ points.",
    done: (r, _a, _b, n) => {
      const raw = r.filter((x) => plainKnn(x, n) && !scaled(x)).map((x) => x.testAcc);
      const sc = r.filter((x) => plainKnn(x, n) && scaled(x)).map((x) => x.testAcc);
      return raw.length > 0 && sc.length > 0 && Math.max(...sc) - Math.min(...raw) >= 0.05;
    },
  },
  { id: "overfit", title: "Overfit on purpose", hint: "100% train accuracy with a 15+ point gap to test.", done: (r) => r.some((x) => x.trainAcc > 0.999 && x.trainAcc - x.testAcc >= 0.15) },
  { id: "underfit", title: "Underfit on purpose", hint: "Make a model so simple its train accuracy is below 40%.", done: (r) => r.some((x) => x.trainAcc < 0.4) },
  { id: "budget", title: "Farming on a budget", hint: "Reach 50% test accuracy using only two soil tests.", done: (r) => r.some((x) => x.config.features.length <= 2 && x.testAcc >= 0.5) },
  { id: "club", title: "Join the 80% club", hint: "Reach 80% test accuracy with any pipeline.", done: (r) => r.some((x) => x.testAcc >= 0.8) },
  { id: "cv", title: "Trust, but verify", hint: "Evaluate a model with 5-fold (or more) cross-validation.", done: (r) => r.some((x) => x.config.validation.mode === "cv" && x.config.validation.folds >= 5) },
  { id: "sweep", title: "Tune like a pro", hint: "Run a validation-curve sweep in the diagnostics section.", done: (_r, a) => a.has("sweep") },
  { id: "map", title: "Ask the model about your field", hint: "Move the soil sliders on the soil map.", done: (_r, a) => a.has("map") },
];

export default function Missions() {
  const { runs, achievements, domain } = useLab();
  const n = domain.data.features.length;
  const status = MISSIONS.map((m) => m.done(runs, achievements, domain.baseline.testAcc, n));
  const count = status.filter(Boolean).length;
  const prev = useRef<boolean[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (prev.current) {
      const fresh = MISSIONS.find((m, i) => status[i] && !prev.current![i]);
      if (fresh) {
        setToast(fresh.title);
        const t = setTimeout(() => setToast(null), 3200);
        prev.current = status;
        return () => clearTimeout(t);
      }
    }
    prev.current = status;
  }, [status.join()]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink"><Trophy size={15} className="text-clay" /> Missions</div>
        <span className="tabular text-[12px] text-ink-3">{count} / {MISSIONS.length}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-clay transition-[width] duration-500" style={{ width: `${(count / MISSIONS.length) * 100}%` }} />
      </div>
      <ul className="mt-3 space-y-1">
        {MISSIONS.map((m, i) => (
          <li key={m.id} className={cx("flex gap-2 rounded-lg px-2 py-1.5", status[i] ? "opacity-70" : "")}>
            {status[i] ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-good" /> : <Circle size={15} className="mt-0.5 shrink-0 text-ink-3" />}
            <div>
              <div className={cx("text-[12.5px] font-medium", status[i] ? "text-ink-2 line-through decoration-ink-3/50" : "text-ink")}>{m.title}</div>
              {!status[i] && <div className="text-[11px] leading-snug text-ink-3">{m.hint}</div>}
            </div>
          </li>
        ))}
      </ul>
      {toast && (
        <div role="status" className="pop fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-clay/40 bg-surface px-4 py-2.5 text-[13px] font-medium text-ink shadow-2xl">
          <Trophy size={16} className="text-clay" /> Mission complete: {toast}
        </div>
      )}
    </div>
  );
}
