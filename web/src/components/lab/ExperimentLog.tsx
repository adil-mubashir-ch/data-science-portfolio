import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { RotateCcw, Star, Trash2 } from "lucide-react";
import EChart, { axisStyle } from "../EChart";
import { Button, pct } from "../ui";
import { useTokens } from "../../lib/theme";
import { MODELS, MODEL_ORDER } from "../../lib/ml/registry";
import { describeConfig, useLab } from "./LabContext";

const MODEL_COLORS = ["#2f6b47", "#b85c32", "#4f7cac", "#8a5a9e", "#c7a53a", "#3a9a9a"];

export default function ExperimentLog() {
  const { runs, setConfig, clearRuns, deleteRun, domain, setSelected } = useLab();
  const t = useTokens();
  const bestId = runs.reduce((b, r) => (!b || r.testAcc > b.testAcc ? r : b), null as (typeof runs)[number] | null)?.id;
  const nFeat = domain.data.features.length;

  const option = useMemo<EChartsOption>(() => {
    const ax = axisStyle(t);
    const lo = Math.max(0, Math.floor((Math.min(0.3, ...runs.map((r) => Math.min(r.trainAcc, r.testAcc))) - 0.05) * 10) / 10);
    return {
      grid: { left: 48, right: 16, top: 52, bottom: 44 },
      legend: { top: 0, right: 0, textStyle: { color: t.ink2, fontSize: 10 }, itemWidth: 8, itemHeight: 8 },
      tooltip: {
        formatter: (p: any) => {
          const r = runs.find((x) => x.id === p.data[2]);
          return r ? `<b>Run #${r.id}</b><br/>${describeConfig(r.config, nFeat)}<br/>Train ${pct(r.trainAcc)} · Test ${pct(r.testAcc)}` : "";
        },
      },
      xAxis: { type: "value", name: "train accuracy", nameLocation: "middle", nameGap: 28, min: lo, max: 1, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => pct(v, 0) } },
      yAxis: { type: "value", name: "test accuracy", nameLocation: "middle", nameGap: 36, min: lo, max: 1, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => pct(v, 0) } },
      series: [
        {
          type: "line", silent: true, showSymbol: false, data: [[lo, lo], [1, 1]],
          lineStyle: { color: t.ink3, type: "dashed", width: 1 },
          markArea: { silent: true, itemStyle: { color: t.clay, opacity: 0.05 }, data: [[{ coord: [lo, lo] }, { coord: [1, 1] }]] as any },
        },
        ...MODEL_ORDER.map((m, i) => ({
          name: MODELS[m].label,
          type: "scatter" as const,
          symbolSize: (d: number[]) => (d[2] === bestId ? 16 : 10),
          itemStyle: { color: MODEL_COLORS[i], opacity: 0.85, borderColor: t.surface, borderWidth: 1 },
          data: runs.filter((r) => r.config.model.type === m).map((r) => [r.trainAcc, r.testAcc, r.id]),
        })),
      ],
    };
  }, [runs, t, bestId, nFeat]);

  if (!runs.length) return <p className="text-[13px] text-ink-3">Every model you train is logged here so you can compare experiments.</p>;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
        <EChart option={option} height={300} notMerge ariaLabel="Train vs test accuracy of every run" />
        <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
          Points on the dashed line generalise perfectly. The further right of the line, the more a model memorised its training data (overfitting). Bottom-left = too simple (underfitting).
        </p>
      </div>
      <div className="min-w-0">
        <div className="max-h-[340px] overflow-auto rounded-xl border border-line">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-2 py-2 font-semibold">Pipeline</th>
                <th className="px-2 py-2 text-right font-semibold">Test</th>
                <th className="px-2 py-2 text-right font-semibold">Gap</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="group border-t border-line">
                  <td className="tabular px-3 py-1.5 text-ink-3">
                    <span className="flex items-center gap-1">{r.id === bestId && <Star size={11} className="fill-clay text-clay" />}{r.id}</span>
                  </td>
                  <td className="max-w-0 px-2 py-1.5">
                    <div className="truncate text-ink" title={describeConfig(r.config, nFeat)}>{describeConfig(r.config, nFeat)}</div>
                    <div className="text-[10px] text-ink-3">{r.config.validation.mode === "cv" ? `${r.config.validation.folds}-fold CV` : `hold-out, seed ${r.config.validation.seed}`}</div>
                  </td>
                  <td className="tabular px-2 py-1.5 text-right font-semibold text-ink">{pct(r.testAcc)}</td>
                  <td className={`tabular px-2 py-1.5 text-right ${r.trainAcc - r.testAcc > 0.12 ? "text-bad" : "text-ink-3"}`}>{((r.trainAcc - r.testAcc) * 100).toFixed(1)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <button onClick={() => (setConfig(r.config), setSelected("model"))} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-accent" aria-label={`Restore run ${r.id}`} title="Restore this pipeline"><RotateCcw size={13} /></button>
                    <button onClick={() => deleteRun(r.id)} className="rounded p-1 text-ink-3 opacity-0 hover:bg-surface-2 hover:text-bad group-hover:opacity-100 focus:opacity-100" aria-label={`Delete run ${r.id}`}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-ink-3">
          <span>{runs.length} runs · saved in this browser</span>
          <Button size="sm" variant="ghost" onClick={clearRuns}>Clear log</Button>
        </div>
      </div>
    </div>
  );
}
