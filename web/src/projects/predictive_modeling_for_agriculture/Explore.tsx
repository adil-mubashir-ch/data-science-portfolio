import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { X } from "lucide-react";
import EChart, { axisStyle } from "../../components/EChart";
import { Card, Segmented, Select, StatTile, cx } from "../../components/ui";
import { useTokens } from "../../lib/theme";
import { quantile } from "../../lib/ml/preprocess";
import type { TabularData } from "../../lib/ml/types";
import { CROPS, FAMILIES, FEATURES, cropColor, cropLabel } from "./crops";

function useStats(data: TabularData) {
  return useMemo(() => {
    const d = data.features.length;
    const col = (j: number) => data.X.map((r) => r[j]);
    const mean = data.features.map((_, j) => col(j).reduce((a, b) => a + b, 0) / data.X.length);
    const std = data.features.map((_, j) => Math.sqrt(col(j).reduce((a, b) => a + (b - mean[j]) ** 2, 0) / data.X.length));
    const byCrop = data.classes.map((_, c) => data.X.filter((_, i) => data.y[i] === c));
    const cropMean = byCrop.map((rows) => data.features.map((_, j) => rows.reduce((a, r) => a + r[j], 0) / rows.length));
    const z = cropMean.map((m) => m.map((v, j) => (v - mean[j]) / std[j]));
    const corr = data.features.map((_, a) => data.features.map((_, b) => {
      let s = 0;
      for (const r of data.X) s += ((r[a] - mean[a]) / std[a]) * ((r[b] - mean[b]) / std[b]);
      return s / data.X.length;
    }));
    const boxes = data.features.map((_, j) =>
      byCrop.map((rows) => {
        const s = rows.map((r) => r[j]).sort((a, b) => a - b);
        return [s[0], quantile(s, 0.25), quantile(s, 0.5), quantile(s, 0.75), s[s.length - 1]];
      }),
    );
    const similar = z.map((zi, c) => {
      let best = -1, bd = Infinity;
      z.forEach((zj, k) => {
        if (k === c) return;
        const dd = Math.sqrt(zi.reduce((a, v, j) => a + (v - zj[j]) ** 2, 0));
        if (dd < bd) { bd = dd; best = k; }
      });
      return { crop: best, dist: bd };
    });
    return { d, mean, std, cropMean, z, corr, boxes, similar };
  }, [data]);
}

export default function Explore({ data }: { data: TabularData }) {
  const t = useTokens();
  const stats = useStats(data);
  const [sel, setSel] = useState<number | null>(null);
  const [view, setView] = useState<"scatter" | "parallel">("scatter");
  const [sx, setSx] = useState("K");
  const [sy, setSy] = useState("P");
  const [boxFeat, setBoxFeat] = useState("K");
  const ax = axisStyle(t);
  const select = (c: number | null) => setSel((s) => (s === c ? null : c));
  const featOpts = data.features.map((f) => ({ value: f, label: `${FEATURES[f].label} (${FEATURES[f].short})` }));

  // Crops sorted by family then name, used for the fingerprint rows.
  const order = useMemo(
    () => data.classes.map((c, i) => ({ c, i })).sort((a, b) => FAMILIES.indexOf(CROPS[a.c].family) - FAMILIES.indexOf(CROPS[b.c].family) || a.c.localeCompare(b.c)).map((x) => x.i),
    [data],
  );

  const fingerprint = useMemo<EChartsOption>(() => {
    const rows = [...order].reverse();
    const values: any[] = [];
    rows.forEach((c, r) => data.features.forEach((_, j) => values.push({
      value: [j, r, +stats.z[c][j].toFixed(2), stats.cropMean[c][j]],
      itemStyle: sel !== null && sel !== c ? { opacity: 0.25 } : undefined,
    })));
    return {
      grid: { left: 86, right: 8, top: 24, bottom: 8 },
      tooltip: { formatter: (p: any) => {
        const [j, r, zz, m] = p.value;
        const c = rows[r];
        return `<b>${cropLabel(data.classes[c])}</b> · ${FEATURES[data.features[j]].label}<br/>Average ${m.toFixed(data.features[j] === "ph" ? 2 : 0)} (${zz >= 0 ? "+" : ""}${zz} σ vs all fields)`;
      } },
      xAxis: { type: "category", position: "top", data: data.features.map((f) => FEATURES[f].short), ...ax, axisLabel: { ...ax.axisLabel, fontSize: 11, color: t.ink2 }, splitLine: { show: false } },
      yAxis: { type: "category", data: rows.map((c) => cropLabel(data.classes[c])), ...ax, axisLabel: { ...ax.axisLabel, interval: 0, fontSize: 10, color: (_: any, i: number) => (sel === rows[i] ? t.ink : t.ink3) } as any, splitLine: { show: false } },
      visualMap: { show: false, dimension: 2, min: -2.5, max: 2.5, inRange: { color: t.dark ? ["#4f7cac", "#1b251f", "#ee9a6a"] : ["#4f7cac", "#f4efe4", "#b85c32"] } },
      series: [{
        type: "heatmap", data: values, itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
        label: { show: true, fontSize: 9, color: t.ink, formatter: (p: any) => p.value[3].toFixed(data.features[p.value[0]] === "ph" ? 1 : 0) },
        emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } },
      }],
    };
  }, [order, stats, sel, t, data]);

  const scatter = useMemo<EChartsOption>(() => {
    const xi = data.features.indexOf(sx), yi = data.features.indexOf(sy);
    return {
      grid: { left: 44, right: 12, top: 12, bottom: 40 },
      tooltip: { formatter: (p: any) => `<b>${p.seriesName}</b><br/>${sx} ${p.value[0]} · ${sy} ${p.value[1]}` },
      xAxis: { type: "value", name: FEATURES[sx].label, nameLocation: "middle", nameGap: 26, scale: true, ...ax },
      yAxis: { type: "value", name: FEATURES[sy].label, nameLocation: "middle", nameGap: 32, scale: true, ...ax },
      series: data.classes.map((c, k) => ({
        name: cropLabel(c),
        type: "scatter",
        symbolSize: sel === k ? 8 : 5,
        z: sel === k ? 10 : 2,
        itemStyle: { color: cropColor(c), opacity: sel === null ? 0.75 : sel === k ? 1 : 0.08, borderColor: sel === k ? t.surface : undefined, borderWidth: sel === k ? 1 : 0 },
        emphasis: { focus: "series" },
        data: data.X.filter((_, i) => data.y[i] === k).map((r) => [+r[xi].toFixed(2), +r[yi].toFixed(2)]),
      })),
    };
  }, [sx, sy, sel, t, data]);

  const parallel = useMemo<EChartsOption>(() => ({
    parallelAxis: data.features.map((f, j) => ({
      dim: j, name: FEATURES[f].short, nameTextStyle: { color: t.ink2, fontSize: 11 },
      axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.ink3, fontSize: 9 }, axisTick: { show: false },
    })),
    parallel: { left: 30, right: 36, top: 30, bottom: 20 },
    series: data.classes.map((c, k) => ({
      name: cropLabel(c), type: "parallel", smooth: true,
      lineStyle: { color: cropColor(c), width: sel === k ? 1.6 : 1, opacity: sel === null ? 0.25 : sel === k ? 0.85 : 0.03 },
      data: data.X.filter((_, i) => data.y[i] === k).filter((_, i) => sel === k || i % 3 === 0),
    })),
  }), [sel, t, data]);

  const boxes = useMemo<EChartsOption>(() => {
    const j = data.features.indexOf(boxFeat);
    const b = stats.boxes[j];
    const sorted = data.classes.map((_, i) => i).sort((a, c) => b[a][2] - b[c][2]);
    return {
      grid: { left: 40, right: 12, top: 12, bottom: 70 },
      tooltip: { formatter: (p: any) => { const c = sorted[p.dataIndex]; const v = b[c]; return `<b>${cropLabel(data.classes[c])}</b><br/>median ${v[2].toFixed(1)} · IQR ${v[1].toFixed(1)}–${v[3].toFixed(1)}<br/>range ${v[0].toFixed(1)}–${v[4].toFixed(1)}`; } },
      xAxis: { type: "category", data: sorted.map((c) => cropLabel(data.classes[c])), ...ax, axisLabel: { ...ax.axisLabel, rotate: 55, interval: 0, fontSize: 9 }, splitLine: { show: false } },
      yAxis: { type: "value", name: FEATURES[boxFeat].label, ...ax, scale: true },
      series: [{
        type: "boxplot", boxWidth: ["40%", "70%"],
        data: sorted.map((c) => ({ value: b[c], itemStyle: { color: cropColor(data.classes[c]) + (sel === null || sel === c ? "55" : "15"), borderColor: sel === null || sel === c ? cropColor(data.classes[c]) : t.line, borderWidth: sel === c ? 2 : 1.2 } })),
      }],
    };
  }, [boxFeat, stats, sel, t, data]);

  const corr = useMemo<EChartsOption>(() => {
    const vals: any[] = [];
    const k = data.features.length;
    stats.corr.forEach((row, a) => row.forEach((v, b) => vals.push([b, k - 1 - a, +v.toFixed(2)])));
    return {
      grid: { left: 36, right: 8, top: 8, bottom: 26 },
      tooltip: { formatter: (p: any) => `${data.features[k - 1 - p.value[1]]} × ${data.features[p.value[0]]}: <b>${p.value[2]}</b>` },
      xAxis: { type: "category", data: data.features.map((f) => FEATURES[f].short), ...ax, splitLine: { show: false } },
      yAxis: { type: "category", data: [...data.features].reverse().map((f) => FEATURES[f].short), ...ax, splitLine: { show: false } },
      visualMap: { show: false, min: -1, max: 1, inRange: { color: t.dark ? ["#4f7cac", "#1b251f", "#ee9a6a"] : ["#4f7cac", "#f4efe4", "#b85c32"] } },
      series: [{ type: "heatmap", data: vals, label: { show: true, fontSize: 11, color: t.ink }, itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 } }],
    };
  }, [stats, t, data]);

  const selName = sel !== null ? data.classes[sel] : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
        <StatTile label="Fields" value="2,200" sub="rows in the dataset" />
        <StatTile label="Crops" value={data.classes.length} sub="classes to predict" />
        <StatTile label="Per crop" value="100" sub="perfectly balanced" help="Every crop has exactly 100 fields, so plain accuracy is a fair metric and a random guess scores 1/22 ≈ 4.5%." />
        <StatTile label="Soil tests" value="4" sub="N · P · K · pH" />
        <StatTile label="Missing" value="0" sub="no cleaning needed" />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
          <span className="text-[12px] font-medium text-ink-2">Highlight a crop:</span>
          {FAMILIES.map((fam) => (
            <div key={fam} className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3">{fam}</span>
              {data.classes.map((c, i) => ({ c, i })).filter(({ c }) => CROPS[c].family === fam).map(({ c, i }) => (
                <button
                  key={c}
                  onClick={() => select(i)}
                  aria-pressed={sel === i}
                  className={cx(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-all",
                    sel === i ? "border-ink bg-ink text-paper" : "border-line text-ink-2 hover:border-ink-3",
                    sel !== null && sel !== i && "opacity-50",
                  )}
                >
                  <i className="h-2 w-2 rounded-full" style={{ background: cropColor(c) }} />
                  {cropLabel(c)}
                </button>
              ))}
            </div>
          ))}
          {sel !== null && (
            <button onClick={() => setSel(null)} className="ml-auto flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink"><X size={12} /> Clear</button>
          )}
        </div>
        {selName && (
          <div className="pop border-t border-line bg-surface-2/50 px-5 py-3 text-[13px] leading-relaxed text-ink-2">
            <strong className="text-ink">{CROPS[selName].emoji} {cropLabel(selName)}</strong> fields average{" "}
            {data.features.map((f, j) => (
              <span key={f}>
                <span className="font-mono text-ink">{f} {stats.cropMean[sel!][j].toFixed(f === "ph" ? 1 : 0)}</span>
                <span className={stats.z[sel!][j] > 0.5 ? "text-clay" : stats.z[sel!][j] < -0.5 ? "text-[#4f7cac]" : "text-ink-3"}> ({stats.z[sel!][j] >= 0 ? "+" : ""}{stats.z[sel!][j].toFixed(1)}σ)</span>
                {j < data.features.length - 1 ? ", " : ". "}
              </span>
            ))}
            Its closest soil look-alike is <strong className="text-ink">{cropLabel(data.classes[stats.similar[sel!].crop])}</strong>
            {stats.similar[sel!].dist < 0.5 ? ": nearly identical profiles, so expect the models to confuse these two." : stats.similar[sel!].dist > 1.5 ? ": quite different, so this crop should be easy to spot." : "."}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-4" title="Soil fingerprint" subtitle="Average test result per crop. Colour = how unusual vs all fields. Click a row.">
          <EChart option={fingerprint} height={560} on={{ click: (p) => select(order[order.length - 1 - p.value[1]]) }} ariaLabel="Average soil values per crop" />
        </Card>
        <div className="space-y-5 lg:col-span-8">
          <Card
            title={view === "scatter" ? "Fields in soil space" : "Every field across all four tests"}
            subtitle={view === "scatter" ? "Each dot is one field, coloured by its best crop. Overlapping colours are what make this hard." : "Each line is one field. Crops with distinctive soils form tight bundles."}
            actions={
              <>
                {view === "scatter" && (
                  <>
                    <Select className="w-36" value={sx} onChange={setSx} options={featOpts} />
                    <Select className="w-36" value={sy} onChange={setSy} options={featOpts} />
                  </>
                )}
                <Segmented size="sm" value={view} onChange={setView} options={[{ value: "scatter", label: "Scatter" }, { value: "parallel", label: "Parallel" }]} />
              </>
            }
          >
            <EChart
              option={view === "scatter" ? scatter : parallel}
              notMerge
              height={340}
              on={{ click: (p) => p.seriesIndex !== undefined && select(p.seriesIndex) }}
              ariaLabel="Fields plotted by soil measurements"
            />
          </Card>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Card
              className="md:col-span-2"
              title="Distribution by crop"
              subtitle="Sorted by median. Wide boxes = variable soils."
              actions={<Select className="w-36" value={boxFeat} onChange={setBoxFeat} options={featOpts} />}
            >
              <EChart option={boxes} height={260} on={{ click: (p) => { const j = data.features.indexOf(boxFeat); const sorted = data.classes.map((_, i) => i).sort((a, c) => stats.boxes[j][a][2] - stats.boxes[j][c][2]); select(sorted[p.dataIndex]); } }} ariaLabel="Box plots per crop" />
            </Card>
            <Card title="Correlation" subtitle="P and K move together (0.74).">
              <EChart option={corr} height={260} ariaLabel="Correlation matrix" />
            </Card>
          </div>
        </div>
      </div>
      <p className="max-w-4xl text-[13px] leading-relaxed text-ink-3">
        A few crops stand out: apple and grapes need K near 200, chickpea pairs high K with the most alkaline soil. But some pairs are
        almost indistinguishable on soil alone: apple vs grapes, kidney beans vs pigeon peas, moth beans vs mung beans, muskmelon vs watermelon.
        No model can reliably split those with four soil tests, which caps accuracy well below 100%. Climate measurements such as rainfall and
        humidity usually separate them, and they're not in this dataset.
      </p>
    </div>
  );
}
