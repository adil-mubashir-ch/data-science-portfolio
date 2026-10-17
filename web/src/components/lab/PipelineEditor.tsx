import { useEffect, useRef, useState, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BrainCircuit, Database, Eye, EyeOff, GripVertical, Plus, Scale, X } from "lucide-react";
import { MODELS, STEPS, STEP_ORDER, formatParam } from "../../lib/ml/registry";
import type { ColumnSummary, StageSummary, StepSpec, StepType } from "../../lib/ml/types";
import { cx } from "../ui";
import { makeStep, useLab } from "./LabContext";

function MiniHist({ col }: { col: ColumnSummary }) {
  const max = Math.max(...col.hist, 1);
  return (
    <div className="min-w-0" title={`${col.name}: ${col.min.toFixed(2)} … ${col.max.toFixed(2)}, mean ${col.mean.toFixed(2)}`}>
      <svg viewBox="0 0 32 12" className="h-3.5 w-full" preserveAspectRatio="none" aria-hidden>
        {col.hist.map((h, i) => (
          <rect key={i} x={i * 2} y={12 - (h / max) * 12} width={1.6} height={(h / max) * 12} className="fill-accent/70" />
        ))}
      </svg>
      <div className="truncate font-mono text-[9px] text-ink-3">{col.name}</div>
    </div>
  );
}

function Shape({ stage }: { stage?: StageSummary }) {
  if (!stage) return <span className="font-mono text-[10px] text-ink-3">–</span>;
  return (
    <span className="tabular font-mono text-[10px] text-ink-3">
      {stage.rows.toLocaleString()} × {stage.cols}
    </span>
  );
}

function Node({ selected, onClick, children, className, accent }: { selected: boolean; onClick: () => void; children: ReactNode; className?: string; accent?: "clay" | "accent" }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      className={cx(
        "relative w-full rounded-xl border bg-surface p-3 text-left transition-all sm:w-[188px]",
        selected ? "border-accent shadow-[0_0_0_3px_var(--accent-soft)]" : "border-line hover:border-ink-3",
        accent === "clay" && !selected && "border-clay/40",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Arrow({ active }: { active: boolean }) {
  return (
    <svg className="mx-auto h-5 w-6 shrink-0 rotate-90 text-ink-3 sm:h-6 sm:w-6 sm:rotate-0" viewBox="0 0 24 24" aria-hidden>
      <line x1="2" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1.5" className={active ? "flow-line" : ""} />
      <path d="M16 8l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function StepNode({ step, stage, selected, onSelect, onToggle, onRemove }: {
  step: StepSpec; stage?: StageSummary; selected: boolean; onSelect: () => void; onToggle: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const info = STEPS[step.type];
  const summary = info.params.map((p) => `${p.label.split(" ")[0]} ${formatParam(p, step.params[p.key])}`).join(" · ");
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cx("flex flex-col items-stretch gap-1 sm:flex-row sm:items-center", isDragging && "z-10 opacity-80")}>
      <Node selected={selected} onClick={onSelect} className={cx(!step.enabled && "opacity-50")}>
        <div className="flex items-center gap-1">
          <button {...attributes} {...listeners} aria-label={`Drag to reorder ${info.label}`} onClick={(e) => e.stopPropagation()} className="-ml-1 cursor-grab touch-none rounded p-0.5 text-ink-3 hover:text-ink active:cursor-grabbing">
            <GripVertical size={13} />
          </button>
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">{info.label}</span>
          <button onClick={(e) => (e.stopPropagation(), onToggle())} aria-label={step.enabled ? "Disable step" : "Enable step"} className="rounded p-0.5 text-ink-3 hover:text-ink">
            {step.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button onClick={(e) => (e.stopPropagation(), onRemove())} aria-label="Remove step" className="rounded p-0.5 text-ink-3 hover:text-bad">
            <X size={13} />
          </button>
        </div>
        <div className="mt-0.5 truncate text-[10px] text-ink-3">{summary || info.short}</div>
        {step.enabled && stage && (
          <div className="mt-2 grid grid-cols-4 gap-1">
            {stage.columns.slice(0, 4).map((c) => <MiniHist key={c.name} col={c} />)}
          </div>
        )}
        <div className="mt-1 flex justify-end"><Shape stage={step.enabled ? stage : undefined} /></div>
      </Node>
      <Arrow active={false} />
    </div>
  );
}

function AddStep({ onAdd }: { onAdd: (t: StepType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const groups = [...new Set(STEP_ORDER.map((t) => STEPS[t].group))];
  return (
    <div ref={ref} className="relative flex flex-col items-stretch gap-1 sm:flex-row sm:items-center">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-full min-h-[64px] w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink-3/50 px-3 text-[11px] font-medium text-ink-2 transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent sm:w-[92px]"
      >
        <Plus size={16} /> Add step
      </button>
      {open && (
        <div className="pop absolute left-0 top-full z-50 mt-2 w-[300px] rounded-2xl border border-line bg-surface p-2 shadow-2xl">
          {groups.map((g) => (
            <div key={g} className="mb-1">
              <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-3">{g}</div>
              {STEP_ORDER.filter((t) => STEPS[t].group === g).map((t) => (
                <button
                  key={t}
                  onClick={() => (onAdd(t), setOpen(false))}
                  className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
                >
                  <span className="text-[12px] font-medium text-ink">{STEPS[t].label}</span>
                  <span className="text-[11px] text-ink-3">{STEPS[t].short}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <Arrow active={false} />
    </div>
  );
}

export default function PipelineEditor() {
  const { config, update, selected, setSelected, result, training, domain } = useLab();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const stages = result?.stages ?? [];
  const stageFor = (id: string) => stages.find((s) => s.stepId === id);
  const input = stages[0];

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    update((c) => {
      const from = c.steps.findIndex((s) => s.id === active.id);
      const to = c.steps.findIndex((s) => s.id === over.id);
      return { ...c, steps: arrayMove(c.steps, from, to) };
    });
  };
  const model = MODELS[config.model.type];
  const v = config.validation;

  return (
    <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-y-3">
      <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center">
        <Node selected={selected === "data"} onClick={() => setSelected("data")}>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
            <Database size={13} className="text-clay" /> Soil tests
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {domain.data.features.map((f) => {
              const on = config.features.includes(f);
              return (
                <button
                  key={f}
                  onClick={(e) => {
                    e.stopPropagation();
                    update((c) => {
                      const next = on ? c.features.filter((x) => x !== f) : domain.data.features.filter((x) => x === f || c.features.includes(x));
                      return next.length ? { ...c, features: next } : c;
                    });
                  }}
                  aria-pressed={on}
                  className={cx("rounded-md px-1.5 py-0.5 font-mono text-[11px] transition-colors", on ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-3 line-through")}
                >
                  {f}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-end"><Shape stage={input} /></div>
        </Node>
        <Arrow active={training.running} />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={config.steps.map((s) => s.id)} strategy={rectSortingStrategy}>
          {config.steps.map((s) => (
            <StepNode
              key={s.id}
              step={s}
              stage={stageFor(s.id)}
              selected={selected === s.id}
              onSelect={() => setSelected(s.id)}
              onToggle={() => update((c) => ({ ...c, steps: c.steps.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)) }))}
              onRemove={() => {
                update((c) => ({ ...c, steps: c.steps.filter((x) => x.id !== s.id) }));
                if (selected === s.id) setSelected("model");
              }}
            />
          ))}
        </SortableContext>
      </DndContext>

      <AddStep
        onAdd={(t) => {
          const step = makeStep(t);
          update((c) => ({ ...c, steps: [...c.steps, step] }));
          setSelected(step.id);
        }}
      />

      <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center">
        <Node selected={selected === "model"} onClick={() => setSelected("model")} accent="clay">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
            <BrainCircuit size={13} className="text-clay" /> Model
          </div>
          <div className="mt-1 text-[13px] font-medium text-ink">{model.label}</div>
          <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-ink-3">
            {model.params.slice(0, 2).map((p) => `${p.label.replace(/ \(.*\)/, "")}: ${formatParam(p, config.model.params[p.key])}`).join(" · ")}
          </div>
          <div className="mt-1 flex justify-end">
            <span className="tabular font-mono text-[10px] text-ink-3">{result ? `${result.stages[result.stages.length - 1].cols} → ${domain.data.classes.length} classes` : ""}</span>
          </div>
        </Node>
        <Arrow active={training.running} />
      </div>

      <Node selected={selected === "validation"} onClick={() => setSelected("validation")}>
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          <Scale size={13} className="text-clay" /> Evaluate
        </div>
        <div className="mt-1 text-[13px] font-medium text-ink">{v.mode === "holdout" ? `Hold-out ${Math.round((1 - v.testSize) * 100)}/${Math.round(v.testSize * 100)}` : `${v.folds}-fold CV`}</div>
        <div className="mt-0.5 text-[10px] text-ink-3">{v.stratify || v.mode === "cv" ? "Stratified" : "Random"} · seed {v.seed}</div>
      </Node>
    </div>
  );
}
