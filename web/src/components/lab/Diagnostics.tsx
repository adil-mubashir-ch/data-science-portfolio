import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Loader2, Play, Wand2 } from "lucide-react";
import EChart, { axisStyle } from "../EChart";
import { Button, Card, Select, pct } from "../ui";
import { useTokens, type Tokens } from "../../lib/theme";
import { MODELS, formatParam, sweepValues } from "../../lib/ml/registry";
import { isCancelled } from "../../lib/ml/client";
import { describeConfig, useLab } from "./LabContext";

interface Pt { x: number; trainAcc: number; testAcc: number }

function curveOption(t: Tokens, pts: Pt[], xName: string, log: boolean, fmtX: (v: number) => string, best?: Pt): EChartsOption {
  const ax = axisStyle(t);
  return {
    grid: { left: 46, right: 18, top: 34, bottom: 44 },
    legend: { top: 0, right: 0, textStyle: { color: t.ink2 }, icon: "roundRect", itemHeight: 3 },
    tooltip: { trigger: "axis", formatter: (ps: any) => `${xName}: <b>${fmtX(ps[0].value[0])}</b><br/>` + ps.map((p: any) => `${p.marker}${p.seriesName}: ${pct(p.value[1])}`).join("<br/>") },
    xAxis: { type: log ? "log" : "value", name: xName, nameLocation: "middle", nameGap: 28, scale: true, ...ax, splitLine: { show: false }, axisLabel: { ...ax.axisLabel, formatter: (v: number) => fmtX(v) } },
    yAxis: { type: "value", max: 1, scale: true, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => pct(v, 0) } },
    series: [
      {
        name: "Train", type: "line", smooth: 0.25, symbolSize: 6, data: pts.map((p) => [p.x, p.trainAcc]),
        lineStyle: { color: t.clay, width: 2 }, itemStyle: { color: t.clay },
      },
      {
        name: "Test", type: "line", smooth: 0.25, symbolSize: 6, data: pts.map((p) => [p.x, p.testAcc]),
        lineStyle: { color: t.accent, width: 2.5 }, itemStyle: { color: t.accent },
        areaStyle: { color: t.accent, opacity: 0.06 },
        markPoint: best ? { symbol: "pin", symbolSize: 36, itemStyle: { color: t.accent }, label: { color: t.dark ? t.paper : "#fff", fontSize: 9, formatter: () => "best" }, data: [{ name: "best", coord: [best.x, best.testAcc] }] } : undefined,
      },
    ],
  };
}

export function ValidationCurve() {
  const { config, batch, update, award, domain } = useLab();
  const t = useTokens();
  const numeric = MODELS[config.model.type].params.filter((p) => p.kind === "int" || p.kind === "log" || p.kind === "float");
  const [key, setKey] = useState(numeric[0]?.key ?? "");
  const [pts, setPts] = useState<Pt[]>([]);
  const [running, setRunning] = useState(false);
  const [ranFor, setRanFor] = useState("");

  useEffect(() => {
    if (!numeric.some((p) => p.key === key)) setKey(numeric[0]?.key ?? "");
    setPts([]);
  }, [config.model.type]);

  const schema = numeric.find((p) => p.key === key);
  const best = pts.length ? pts.reduce((b, p) => (p.testAcc > b.testAcc ? p : b)) : undefined;

  const run = () => {
    if (!schema) return;
    const values = sweepValues(schema, schema.kind === "int" && schema.max - schema.min < 12 ? schema.max - schema.min + 1 : 12);
    setPts([]);
    setRunning(true);
    setRanFor(describeConfig(config, domain.data.features.length));
    batch
      .call<true, { value: number; trainAcc: number; testAcc: number }>({ op: "sweep", config, key, values }, (p) =>
        setPts((prev) => [...prev, { x: p.value, trainAcc: p.trainAcc, testAcc: p.testAcc }]),
      )
      .then(() => award("sweep"))
      .catch((e) => !isCancelled(e) && console.error(e))
      .finally(() => setRunning(false));
  };

  const option = useMemo(
    () => (schema ? curveOption(t, pts, schema.label, schema.kind === "log", (v) => formatParam(schema, v), running ? undefined : best) : {}),
    [t, pts, schema, best, running],
  );

  return (
    <Card
      title="Validation curve"
      subtitle="Sweep one hyperparameter and retrain at each value. Where do train and test accuracy diverge?"
      actions={
        <div className="flex items-end gap-2">
          <Select className="w-48" value={key} onChange={setKey} options={numeric.map((p) => ({ value: p.key, label: p.label }))} />
          <Button variant="primary" size="sm" onClick={run} disabled={running || !schema}>
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Sweep
          </Button>
        </div>
      }
    >
      {pts.length ? (
        <>
          <EChart option={option} height={300} notMerge ariaLabel="Validation curve" />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-3">
            <span className="truncate">Pipeline: {ranFor}</span>
            {best && schema && !running && (
              <Button size="sm" onClick={() => update((c) => ({ ...c, model: { ...c.model, params: { ...c.model.params, [key]: best.x } } }))}>
                <Wand2 size={13} /> Use best ({formatParam(schema, best.x)} → {pct(best.testAcc)})
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="grid h-[300px] place-items-center px-6 text-center text-[13px] text-ink-3">
          {numeric.length ? `Pick a hyperparameter of your ${MODELS[config.model.type].label.toLowerCase()} and press Sweep. Each point is a full retrain on a hold-out split.` : "This model has no numeric hyperparameters to sweep."}
        </div>
      )}
    </Card>
  );
}

export function LearningCurve() {
  const { config, batch, domain } = useLab();
  const t = useTokens();
  const [pts, setPts] = useState<(Pt & { n: number })[]>([]);
  const [running, setRunning] = useState(false);
  const [ranFor, setRanFor] = useState("");
  const run = () => {
    setPts([]);
    setRunning(true);
    setRanFor(describeConfig(config, domain.data.features.length));
    batch
      .call<true, { fraction: number; nTrain: number; trainAcc: number; testAcc: number }>(
        { op: "curve", config, fractions: [0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1] },
        (p) => setPts((prev) => [...prev, { x: p.nTrain, n: p.nTrain, trainAcc: p.trainAcc, testAcc: p.testAcc }]),
      )
      .catch((e) => !isCancelled(e) && console.error(e))
      .finally(() => setRunning(false));
  };
  const option = useMemo(() => curveOption(t, pts, "training fields", false, (v) => String(Math.round(v))), [t, pts]);
  const last = pts[pts.length - 1];
  const verdict = !running && last
    ? last.trainAcc - last.testAcc > 0.1
      ? "Big gap at full size: the model is variance-limited. More data or more regularisation would help."
      : last.testAcc < 0.6
        ? "Both curves are low and close: the model is bias-limited. More data won't help much; try a more flexible model or better features."
        : "Curves are converging: adding more fields would give diminishing returns."
    : null;
  return (
    <Card
      title="Learning curve"
      subtitle="Train on growing slices of the data. Would collecting more fields help?"
      actions={
        <Button variant="primary" size="sm" onClick={run} disabled={running}>
          {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run
        </Button>
      }
    >
      {pts.length ? (
        <>
          <EChart option={option} height={300} notMerge ariaLabel="Learning curve" />
          <p className="mt-2 truncate text-[12px] text-ink-3">Pipeline: {ranFor}</p>
          {verdict && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">{verdict}</p>}
        </>
      ) : (
        <div className="grid h-[300px] place-items-center px-6 text-center text-[13px] text-ink-3">
          Uses your current lab pipeline. Press Run to retrain it on 5% … 100% of the training fields.
        </div>
      )}
    </Card>
  );
}
