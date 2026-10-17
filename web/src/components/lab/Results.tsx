import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { AlertTriangle, Loader2, Play } from "lucide-react";
import EChart, { axisStyle } from "../EChart";
import CodeBlock from "../CodeBlock";
import { Button, Progress, Segmented, StatTile, Toggle, pct } from "../ui";
import { useTokens } from "../../lib/theme";
import { toSklearn } from "../../lib/ml/codegen";
import { useLab } from "./LabContext";

type Tab = "curve" | "confusion" | "classes" | "importance" | "code";

function delta(cur: number, prev?: number) {
  if (prev === undefined) return undefined;
  const d = (cur - prev) * 100;
  if (Math.abs(d) < 0.05) return { text: "± 0.0 pts vs last run", tone: "neutral" as const };
  return { text: `${d > 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)} pts vs last run`, tone: d > 0 ? ("good" as const) : ("bad" as const) };
}

function TrainingCurve() {
  const { training, result } = useLab();
  const t = useTokens();
  const history = training.running ? training.history : (result?.history ?? []);
  const kind = training.running ? (training.history.length ? (training.history[0].loss !== undefined ? "epoch" : "trees") : null) : result?.historyKind;
  const option = useMemo<EChartsOption>(() => {
    const ax = axisStyle(t);
    if (kind === "trees") {
      return {
        grid: { left: 44, right: 16, top: 30, bottom: 36 },
        tooltip: { trigger: "axis", valueFormatter: (v) => pct(Number(v)) },
        legend: { top: 0, right: 0, textStyle: { color: t.ink2 }, icon: "roundRect", itemHeight: 3 },
        xAxis: { type: "value", name: "trees in the forest", nameLocation: "middle", nameGap: 24, min: 1, ...ax, splitLine: { show: false } },
        yAxis: { type: "value", ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => pct(v, 0) }, scale: true },
        series: [{ name: "Test accuracy", type: "line", showSymbol: false, smooth: 0.2, lineStyle: { width: 2.5, color: t.accent }, itemStyle: { color: t.accent }, areaStyle: { color: t.accent, opacity: 0.08 }, data: history.map((h) => [h.step, h.valAcc]) }],
      };
    }
    const accPts = history.filter((h) => h.trainAcc !== undefined);
    return {
      grid: { left: 44, right: 48, top: 30, bottom: 36 },
      tooltip: { trigger: "axis" },
      legend: { top: 0, right: 0, textStyle: { color: t.ink2 }, icon: "roundRect", itemHeight: 3 },
      xAxis: { type: "value", name: "epoch", nameLocation: "middle", nameGap: 24, min: 0, ...ax, splitLine: { show: false } },
      yAxis: [
        { type: "value", name: "loss", ...ax, scale: true },
        { type: "value", min: 0, max: 1, ...ax, splitLine: { show: false }, axisLabel: { ...ax.axisLabel, formatter: (v: number) => pct(v, 0) } },
      ],
      series: [
        { name: "Loss", type: "line", showSymbol: false, lineStyle: { width: 2, color: t.ink3 }, itemStyle: { color: t.ink3 }, data: history.map((h) => [h.step, h.loss]) },
        { name: "Train acc", type: "line", yAxisIndex: 1, showSymbol: false, lineStyle: { width: 2, color: t.clay }, itemStyle: { color: t.clay }, data: accPts.map((h) => [h.step, h.trainAcc]) },
        { name: "Test acc", type: "line", yAxisIndex: 1, showSymbol: false, lineStyle: { width: 2.5, color: t.accent }, itemStyle: { color: t.accent }, data: accPts.map((h) => [h.step, h.valAcc]) },
      ],
    };
  }, [history, kind, t]);

  if (!kind || !history.length)
    return (
      <div className="grid h-[300px] place-items-center px-8 text-center text-[13px] text-ink-3">
        This model doesn't train in rounds: k-NN memorises, Naive Bayes counts, a single tree grows in one go.
        Try the learning curve in the diagnostics section, or switch to a forest, logistic regression or neural net to watch it learn.
      </div>
    );
  return <EChart option={option} height={300} notMerge ariaLabel="Training curve" />;
}

function Confusion() {
  const { result, domain } = useLab();
  const t = useTokens();
  const [normalize, setNormalize] = useState(true);
  const option = useMemo<EChartsOption>(() => {
    if (!result) return {};
    const k = domain.data.classes.length;
    const labels = domain.data.classes.map((_, i) => domain.classLabel(i));
    const data: [number, number, number, number][] = [];
    result.confusion.forEach((row, i) => {
      const total = row.reduce((a, b) => a + b, 0) || 1;
      row.forEach((v, j) => v > 0 && data.push([j, k - 1 - i, normalize ? v / total : v, v]));
    });
    const ax = axisStyle(t);
    return {
      grid: { left: 92, right: 12, top: 8, bottom: 84 },
      tooltip: {
        formatter: (p: any) => {
          const [j, ii, , n] = p.data;
          const i = k - 1 - ii;
          return `<b>${labels[i]}</b> predicted as <b>${labels[j]}</b><br/>${n} field${n === 1 ? "" : "s"}${i === j ? " ✓" : ""}`;
        },
      },
      xAxis: { type: "category", data: labels, ...ax, axisLabel: { ...ax.axisLabel, rotate: 55, interval: 0, fontSize: 9 }, name: "predicted", nameLocation: "middle", nameGap: 70, splitLine: { show: false } },
      yAxis: { type: "category", data: [...labels].reverse(), ...ax, axisLabel: { ...ax.axisLabel, interval: 0, fontSize: 9 }, splitLine: { show: false } },
      visualMap: { show: false, dimension: 2, min: 0, max: normalize ? 1 : Math.max(...result.confusion.flat()), inRange: { color: [t.surface2, t.dark ? "#3d8a5f" : "#8cc5a0", t.accent] } },
      series: [{ type: "heatmap", data, itemStyle: { borderColor: t.surface, borderWidth: 1, borderRadius: 2 }, emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1.5 } } }],
    };
  }, [result, normalize, t, domain]);
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[12px] text-ink-3">Rows: true crop · Columns: predicted. Off-diagonal cells are mistakes. Which crops get confused?</p>
        <div className="w-44"><Toggle label="Row %" checked={normalize} onChange={setNormalize} /></div>
      </div>
      <EChart option={option} height={460} ariaLabel="Confusion matrix" />
    </div>
  );
}

function PerClass() {
  const { result, domain } = useLab();
  const t = useTokens();
  const option = useMemo<EChartsOption>(() => {
    if (!result) return {};
    const rows = result.perClass.map((m, i) => ({ i, ...m })).sort((a, b) => a.f1 - b.f1);
    const ax = axisStyle(t);
    return {
      grid: { left: 92, right: 40, top: 8, bottom: 24 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps: any) => {
        const r = rows[ps[0].dataIndex];
        return `<b>${domain.classLabel(r.i)}</b><br/>Recall ${pct(r.recall)} · Precision ${pct(r.precision)}<br/>F1 ${pct(r.f1)} · ${r.support} test fields`;
      } },
      xAxis: { type: "value", max: 1, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => pct(v, 0) } },
      yAxis: { type: "category", data: rows.map((r) => domain.classLabel(r.i)), ...ax, axisLabel: { ...ax.axisLabel, fontSize: 10, interval: 0 }, splitLine: { show: false } },
      series: [{
        type: "bar", barWidth: "62%", data: rows.map((r) => ({ value: r.f1, itemStyle: { color: domain.classColor(r.i), borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: "right", color: t.ink3, fontSize: 9, formatter: (p: any) => pct(p.value, 0) },
      }],
    };
  }, [result, t, domain]);
  return (
    <div>
      <p className="mb-1 px-1 text-[12px] text-ink-3">F1 score per crop, worst first. Hover for precision and recall.</p>
      <EChart option={option} height={460} ariaLabel="Per-crop F1 scores" />
    </div>
  );
}

function Importance() {
  const { result } = useLab();
  const t = useTokens();
  const imp = result?.importances;
  const option = useMemo<EChartsOption>(() => {
    if (!imp) return {};
    const rows = [...imp].sort((a, b) => a.value - b.value).slice(-16);
    const ax = axisStyle(t);
    return {
      grid: { left: 80, right: 40, top: 8, bottom: 24 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "value", ...ax },
      yAxis: { type: "category", data: rows.map((r) => r.name), ...ax, axisLabel: { ...ax.axisLabel, fontFamily: "JetBrains Mono Variable" }, splitLine: { show: false } },
      series: [{ type: "bar", data: rows.map((r) => r.value), barWidth: "55%", itemStyle: { color: t.clay, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: "right", color: t.ink3, fontSize: 10, formatter: (p: any) => Number(p.value).toFixed(3) } }],
    };
  }, [imp, t]);
  if (!imp)
    return <div className="grid h-[300px] place-items-center px-8 text-center text-[13px] text-ink-3">This model has no built-in importance score. Scroll down to "Which test matters most?" for model-agnostic permutation importance.</div>;
  return (
    <div>
      <p className="mb-1 px-1 text-[12px] text-ink-3">
        {result?.config.model.type === "logreg" ? "Mean absolute weight per column (only comparable when columns are scaled)." : "Impurity-based importance: how much each column's splits purify the crops."}
      </p>
      <EChart option={option} height={Math.max(220, imp.length * 26 + 40)} ariaLabel="Feature importance" />
    </div>
  );
}

export default function Results() {
  const { result, previous, training, error, train, autoTrain, setAutoTrain, config, domain, runs } = useLab();
  const [tab, setTab] = useState<Tab>("curve");
  const best = runs.reduce((m, r) => Math.max(m, r.testAcc), 0);
  const cvStd = result?.cvScores && Math.sqrt(result.cvScores.reduce((a, s) => a + (s - result.testAcc) ** 2, 0) / result.cvScores.length);
  const gap = result ? result.trainAcc - result.testAcc : 0;
  const d = result && previous ? delta(result.testAcc, previous.testAcc) : undefined;
  const code = useMemo(() => toSklearn(config, domain.csvName, domain.target), [config, domain]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={train} disabled={training.running && !autoTrain}>
            {training.running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} {training.running ? "Training…" : "Train"}
          </Button>
          <div className="w-40"><Toggle label="Auto-train" checked={autoTrain} onChange={setAutoTrain} help="Retrain automatically whenever you change the pipeline." /></div>
        </div>
        <div className="min-w-[160px] flex-1 sm:max-w-xs">
          <div className="mb-1 flex justify-between text-[11px] text-ink-3">
            <span>{training.running ? training.label : result ? result.modelInfo : "Ready"}</span>
            {result && !training.running && <span className="tabular">{result.durationMs < 1000 ? `${result.durationMs.toFixed(0)} ms` : `${(result.durationMs / 1000).toFixed(1)} s`}</span>}
          </div>
          <Progress value={training.running ? training.fraction : result ? 1 : 0} />
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-bad/40 bg-clay-soft px-3 py-2 text-[12px] text-bad">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className={`mt-4 grid grid-cols-2 gap-2.5 transition-opacity lg:grid-cols-4 ${training.running ? "opacity-60" : ""}`}>
        <StatTile
          label={config.validation.mode === "cv" ? "CV accuracy" : "Test accuracy"}
          value={result ? pct(result.testAcc) : "–"}
          sub={cvStd !== undefined ? `± ${(cvStd * 100).toFixed(1)} pts across folds` : d?.text}
          tone={d?.tone}
          help="Share of unseen fields where the model's top pick was the right crop."
        />
        <StatTile
          label="Train accuracy"
          value={result ? pct(result.trainAcc) : "–"}
          sub={result ? `gap ${(gap * 100).toFixed(1)} pts ${gap > 0.12 ? "· overfitting" : gap < 0.03 ? "· well matched" : ""}` : undefined}
          tone={gap > 0.12 ? "bad" : "neutral"}
          help="Accuracy on the fields the model trained on. A big gap to test accuracy means it memorised rather than learned."
        />
        <StatTile label="Top-3 accuracy" value={result ? pct(result.top3) : "–"} sub="right crop in the top 3 picks" help="If you show a farmer 3 suggestions, how often is the right crop among them?" />
        <StatTile label="Macro F1" value={result ? result.macroF1.toFixed(3) : "–"} sub="balanced over all 22 crops" help="Average of per-crop F1 scores, so every crop counts equally." />
      </div>

      {result && (
        <div className="mt-3 rounded-xl border border-line px-3 py-2.5">
          <div className="relative h-6">
            <div className="absolute inset-y-2.5 left-0 right-0 rounded-full bg-surface-2" />
            {[
              { v: domain.baseline.testAcc, label: domain.baseline.label, cls: "bg-ink-3" },
              { v: best, label: "Your best", cls: "bg-clay" },
              { v: result.testAcc, label: "This run", cls: "bg-accent" },
            ].map((m) => (
              <div key={m.label} className="absolute top-0 h-6 transition-[left] duration-500" style={{ left: `${m.v * 100}%` }} title={`${m.label}: ${pct(m.v)}`}>
                <div className={`h-6 w-1 -translate-x-1/2 rounded-full ${m.cls}`} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-ink-3" />{domain.baseline.label} {pct(domain.baseline.testAcc)}</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-clay" />Your best {pct(best)}</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent" />This run {pct(result.testAcc)}</span>
          </div>
        </div>
      )}

      <div className="mt-5 overflow-x-auto pb-1">
        <Segmented
          value={tab}
          onChange={setTab}
          size="sm"
          options={[
            { value: "curve", label: "Training" },
            { value: "confusion", label: "Confusion matrix" },
            { value: "classes", label: "Per crop" },
            { value: "importance", label: "Importance" },
            { value: "code", label: "scikit-learn code" },
          ]}
        />
      </div>
      <div className="mt-3">
        {tab === "code" ? <CodeBlock code={code} filename="pipeline.py" /> : !result && !training.running ? (
          <div className="grid h-[300px] place-items-center text-[13px] text-ink-3">Train a model to see results.</div>
        ) : tab === "curve" ? <TrainingCurve /> : tab === "confusion" ? <Confusion /> : tab === "classes" ? <PerClass /> : <Importance />}
      </div>
    </div>
  );
}
