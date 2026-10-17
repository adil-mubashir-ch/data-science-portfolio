import { BookOpen, Dices, Lightbulb, Wrench } from "lucide-react";
import { MODELS, MODEL_ORDER, STEPS, type Learn } from "../../lib/ml/registry";
import type { ModelType } from "../../lib/ml/types";
import { Segmented, Slider, Toggle, cx } from "../ui";
import { makeModel, useLab } from "./LabContext";
import ParamControls from "./ParamControls";

function LearnBox({ learn }: { learn: Learn }) {
  return (
    <div className="space-y-2.5 rounded-xl bg-surface-2/70 p-3.5 text-[12.5px] leading-relaxed">
      <p className="flex gap-2 text-ink"><BookOpen size={14} className="mt-0.5 shrink-0 text-accent" />{learn.what}</p>
      <p className="flex gap-2 text-ink-2"><Wrench size={14} className="mt-0.5 shrink-0 text-ink-3" />{learn.how}</p>
      <p className="flex gap-2 text-ink-2"><Lightbulb size={14} className="mt-0.5 shrink-0 text-clay" /><span><strong className="font-semibold text-clay">Try this: </strong>{learn.tryThis}</span></p>
    </div>
  );
}

function StageTable() {
  const { result, selected } = useLab();
  const idx = result?.stages.findIndex((s) => s.stepId === selected) ?? -1;
  if (!result || idx < 0) return null;
  const before = result.stages[idx - 1];
  const after = result.stages[idx];
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
  return (
    <div className="mt-4">
      {after.info && <p className="mb-3 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-[12px] text-ink">{after.info}</p>}
      <div className="grid grid-cols-2 gap-3">
        {[["Before", before], ["After", after]].map(([label, st]) => {
          const s = st as typeof after;
          return (
            <div key={label as string}>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label as string} <span className="font-mono normal-case">({s.rows}×{s.cols})</span></div>
              <div className="space-y-1.5">
                {s.columns.slice(0, 6).map((c) => {
                  const max = Math.max(...c.hist, 1);
                  return (
                    <div key={c.name} className="rounded-lg border border-line p-1.5">
                      <div className="flex justify-between font-mono text-[10px] text-ink-2"><span className="truncate">{c.name}</span><span className="text-ink-3">μ {fmt(c.mean)}</span></div>
                      <svg viewBox="0 0 64 16" className="mt-0.5 h-5 w-full" preserveAspectRatio="none" aria-hidden>
                        {c.hist.map((h, i) => <rect key={i} x={i * 4} y={16 - (h / max) * 16} width={3.4} height={(h / max) * 16} className={label === "After" ? "fill-accent/80" : "fill-ink-3/50"} />)}
                      </svg>
                      <div className="flex justify-between font-mono text-[9px] text-ink-3"><span>{fmt(c.min)}</span><span>{fmt(c.max)}</span></div>
                    </div>
                  );
                })}
                {s.cols > 6 && <div className="text-[10px] text-ink-3">+{s.cols - 6} more columns</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Inspector() {
  const { config, update, selected, domain } = useLab();
  const step = config.steps.find((s) => s.id === selected);

  if (selected === "data") {
    return (
      <div>
        <h4 className="text-[14px] font-semibold text-ink">Which soil tests to use</h4>
        <p className="mt-1 text-[12.5px] text-ink-2">Each test costs the farmer money. Switch some off and see how much accuracy each one buys.</p>
        <div className="mt-4 space-y-3">
          {domain.data.features.map((f) => (
            <Toggle
              key={f}
              label={<span><span className="font-mono">{f}</span> · {domain.featureLabel(f)}</span>}
              checked={config.features.includes(f)}
              onChange={(on) =>
                update((c) => {
                  const next = on ? domain.data.features.filter((x) => x === f || c.features.includes(x)) : c.features.filter((x) => x !== f);
                  return next.length ? { ...c, features: next } : c;
                })
              }
            />
          ))}
        </div>
      </div>
    );
  }

  if (selected === "validation") {
    const v = config.validation;
    const set = (patch: Partial<typeof v>) => update((c) => ({ ...c, validation: { ...c.validation, ...patch } }));
    return (
      <div className="space-y-4">
        <h4 className="text-[14px] font-semibold text-ink">How the model is graded</h4>
        <Segmented value={v.mode} onChange={(mode) => set({ mode })} options={[{ value: "holdout", label: "Hold-out split" }, { value: "cv", label: "Cross-validation" }]} />
        {v.mode === "holdout" ? (
          <>
            <Slider label="Test set size" value={v.testSize} min={0.1} max={0.5} step={0.05} display={`${Math.round(v.testSize * 100)}%`} onChange={(testSize) => set({ testSize })} help="Fields hidden from the model during training and used only for grading." />
            <Toggle label="Stratify by crop" checked={v.stratify} onChange={(stratify) => set({ stratify })} help="Keep the same share of each crop in train and test." />
          </>
        ) : (
          <Slider label="Folds" value={v.folds} min={3} max={10} display={`${v.folds}`} onChange={(folds) => set({ folds })} help="Train k times, each time holding out a different 1/k of the data. More stable estimate, k times slower." />
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1"><Slider label="Random seed" value={v.seed} min={0} max={100} display={`${v.seed}`} onChange={(seed) => set({ seed })} help="Changes which fields land in the test set. If accuracy jumps around a lot between seeds, your estimate is noisy." /></div>
          <button onClick={() => set({ seed: Math.floor(Math.random() * 101) })} className="mb-0.5 rounded-lg border border-line p-1.5 text-ink-2 hover:text-ink" aria-label="Random seed"><Dices size={15} /></button>
        </div>
        <LearnBox
          learn={{
            what: "The model is always graded on fields it never saw during training: that's the only honest estimate of how it'll do for a new farmer.",
            how: "A single split can be lucky or unlucky. Cross-validation repeats the experiment on k different splits and averages them, and the spread tells you how much to trust the number.",
            tryThis: "Change the seed a few times on hold-out and note how much test accuracy moves. Then switch to 5-fold CV.",
          }}
        />
      </div>
    );
  }

  if (step) {
    const info = STEPS[step.type];
    return (
      <div>
        <div className="flex items-center justify-between">
          <h4 className="text-[14px] font-semibold text-ink">{info.label}</h4>
          {!step.enabled && <span className="text-[11px] text-warn">Disabled</span>}
        </div>
        <p className="mt-0.5 text-[12px] text-ink-3">{info.short}</p>
        <div className="mt-4">
          <ParamControls
            schema={info.params}
            params={step.params}
            onChange={(k, val) => update((c) => ({ ...c, steps: c.steps.map((s) => (s.id === step.id ? { ...s, params: { ...s.params, [k]: val } } : s)) }))}
          />
        </div>
        <div className="mt-4"><LearnBox learn={info.learn} /></div>
        <StageTable />
      </div>
    );
  }

  const model = MODELS[config.model.type];
  return (
    <div>
      <h4 className="text-[14px] font-semibold text-ink">Choose a model</h4>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {MODEL_ORDER.map((t: ModelType) => (
          <button
            key={t}
            onClick={() => t !== config.model.type && update((c) => ({ ...c, model: makeModel(t) }))}
            aria-pressed={t === config.model.type}
            className={cx(
              "rounded-lg border px-2.5 py-2 text-left transition-colors",
              t === config.model.type ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2",
            )}
          >
            <div className="text-[12px] font-semibold text-ink">{MODELS[t].label}</div>
            <div className="text-[10.5px] leading-snug text-ink-3">{MODELS[t].short}</div>
          </button>
        ))}
      </div>
      <div className="mt-5">
        <ParamControls
          schema={model.params}
          params={config.model.params}
          onChange={(k, val) => update((c) => ({ ...c, model: { ...c.model, params: { ...c.model.params, [k]: val } } }))}
        />
      </div>
      <div className="mt-5"><LearnBox learn={model.learn} /></div>
    </div>
  );
}
