import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Loader2, Play, Star } from "lucide-react";
import EChart, { axisStyle } from "../EChart";
import { Badge, Button, Card, pct } from "../ui";
import { useTokens } from "../../lib/theme";
import { isCancelled } from "../../lib/ml/client";
import { describeConfig, useLab } from "./LabContext";

const keyOf = (fs: string[]) => [...fs].sort().join("+");

function Lattice({ features, scores, label }: { features: string[]; scores: Map<string, number>; label: (f: string) => string }) {
  const [hover, setHover] = useState<string | null>(null);
  const n = features.length;
  const levels = useMemo(() => {
    const out: string[][][] = Array.from({ length: n }, () => []);
    for (let mask = 1; mask < 1 << n; mask++) {
      const s = features.filter((_, j) => mask & (1 << j));
      out[s.length - 1].push(s);
    }
    return out;
  }, [features, n]);
  const W = 860, H = 110 * n + 20, NW = 128, NH = 52;
  const pos = new Map<string, { x: number; y: number }>();
  levels.forEach((lvl, li) => lvl.forEach((s, i) => pos.set(keyOf(s), { x: ((i + 0.5) / lvl.length) * W, y: 40 + li * 110 })));
  const bestPerLevel = levels.map((lvl) => lvl.reduce<string | null>((b, s) => {
    const k = keyOf(s);
    return scores.has(k) && (!b || scores.get(k)! > scores.get(b)!) ? k : b;
  }, null));
  const edges: { from: string; to: string; gain?: number; f: string }[] = [];
  levels.slice(0, -1).forEach((lvl) =>
    lvl.forEach((s) =>
      features.filter((f) => !s.includes(f)).forEach((f) => {
        const a = keyOf(s), b = keyOf([...s, f]);
        const gain = scores.has(a) && scores.has(b) ? scores.get(b)! - scores.get(a)! : undefined;
        edges.push({ from: a, to: b, gain, f });
      }),
    ),
  );
  const maxAcc = Math.max(...scores.values(), 0.01);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Accuracy for every combination of soil tests">
      {edges.map((e) => {
        const a = pos.get(e.from)!, b = pos.get(e.to)!;
        const on = hover && (hover === e.from || hover === e.to);
        const g = e.gain ?? 0;
        return (
          <g key={e.from + ">" + e.to} opacity={hover && !on ? 0.12 : 1}>
            <line x1={a.x} y1={a.y + NH / 2} x2={b.x} y2={b.y - NH / 2} stroke={g > 0.15 ? "var(--accent)" : "var(--ink-3)"} strokeOpacity={on ? 0.9 : 0.35} strokeWidth={1 + Math.max(0, g) * 14} />
            {on && e.gain !== undefined && (
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 + 4} textAnchor="middle" className="fill-ink font-mono text-[12px] font-semibold" paintOrder="stroke" stroke="var(--surface)" strokeWidth={4}>
                +{e.f} {g >= 0 ? "+" : ""}{(g * 100).toFixed(1)}
              </text>
            )}
          </g>
        );
      })}
      {[...pos].map(([k, p]) => {
        const s = scores.get(k);
        const li = k.split("+").length - 1;
        const best = bestPerLevel[li] === k;
        return (
          <g key={k} transform={`translate(${p.x - NW / 2},${p.y - NH / 2})`} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} className="cursor-default" opacity={hover && hover !== k && !edges.some((e) => (e.from === hover && e.to === k) || (e.to === hover && e.from === k)) ? 0.35 : 1}>
            <rect width={NW} height={NH} rx={12} fill="var(--surface)" stroke={best ? "var(--clay)" : "var(--line)"} strokeWidth={best ? 2 : 1} />
            {s !== undefined && <rect x={4} y={NH - 8} width={(NW - 8) * (s / maxAcc)} height={4} rx={2} fill="var(--accent)" opacity={0.8} />}
            <text x={NW / 2} y={20} textAnchor="middle" className="fill-ink-2 font-mono text-[12px]">{k.split("+").map(label).join(" · ")}</text>
            <text x={NW / 2} y={38} textAnchor="middle" className="fill-ink font-serif text-[15px] font-semibold">{s === undefined ? "…" : pct(s)}</text>
            {best && <text x={NW - 12} y={16} textAnchor="middle" className="fill-clay text-[12px]">★</text>}
          </g>
        );
      })}
    </svg>
  );
}

export default function FeatureBudget({ reference }: { reference?: { features: string[]; test: number }[] }) {
  const { config, batch, domain } = useLab();
  const t = useTokens();
  const feats = domain.data.features;
  const [scores, setScores] = useState<Map<string, number>>(() => new Map(reference?.map((r) => [keyOf(r.features), r.test]) ?? []));
  const [source, setSource] = useState(reference ? "scikit-learn random forest (reference)" : "");
  const [running, setRunning] = useState(false);
  const [perm, setPerm] = useState<{ baseline: number; importances: { feature: string; mean: number; std: number }[] } | null>(null);
  const [permRunning, setPermRunning] = useState(false);

  const runSubsets = () => {
    setScores(new Map());
    setRunning(true);
    setSource(`your lab pipeline: ${describeConfig({ ...config, features: feats }, feats.length)}`);
    batch
      .call<true, { features: string[]; testAcc: number }>({ op: "subsets", config }, (p) => setScores((m) => new Map(m).set(keyOf(p.features), p.testAcc)))
      .catch((e) => !isCancelled(e) && console.error(e))
      .finally(() => setRunning(false));
  };
  const runPerm = () => {
    setPermRunning(true);
    batch
      .call<typeof perm>({ op: "permutation", config, repeats: 5 })
      .then(setPerm)
      .catch((e) => !isCancelled(e) && console.error(e))
      .finally(() => setPermRunning(false));
  };

  const singles = feats.map((f) => ({ f, s: scores.get(f) })).filter((x) => x.s !== undefined) as { f: string; s: number }[];
  const bestSingle = singles.sort((a, b) => b.s - a.s)[0];

  const permOption = useMemo<EChartsOption>(() => {
    if (!perm) return {};
    const ax = axisStyle(t);
    const rows = [...perm.importances].sort((a, b) => a.mean - b.mean);
    return {
      grid: { left: 84, right: 56, top: 8, bottom: 28 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps: any) => { const r = rows[ps[0].dataIndex]; return `Shuffling <b>${domain.featureLabel(r.feature)}</b> drops accuracy by <b>${(r.mean * 100).toFixed(1)} pts</b> (± ${(r.std * 100).toFixed(1)})`; } },
      xAxis: { type: "value", ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => `${(v * 100).toFixed(0)} pts` } },
      yAxis: { type: "category", data: rows.map((r) => domain.featureLabel(r.feature)), ...ax, splitLine: { show: false } },
      series: [{ type: "bar", data: rows.map((r) => r.mean), barWidth: "50%", itemStyle: { color: t.clay, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: "right", color: t.ink2, fontSize: 11, formatter: (p: any) => `−${(p.value * 100).toFixed(1)}` } }],
    };
  }, [perm, t, domain]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <Card
        className="lg:col-span-8"
        title="Every combination of soil tests"
        subtitle="Each box is a model trained with only those tests. Hover a box to see what adding each test buys. Thick lines are big gains."
        actions={
          <Button variant="primary" size="sm" onClick={runSubsets} disabled={running}>
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run with my lab pipeline
          </Button>
        }
      >
        <div className="-mx-2 overflow-x-auto px-2">
          <div className="min-w-[620px]">
            <Lattice features={feats} scores={scores} label={domain.featureShort} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <Badge tone={source.startsWith("scikit") ? "neutral" : "accent"}>Source</Badge>
          <span className="min-w-0 truncate">{source}</span>
          <span className="ml-auto flex items-center gap-1"><Star size={11} className="fill-clay text-clay" /> best at each budget</span>
        </div>
      </Card>
      <div className="space-y-5 lg:col-span-4">
        {bestSingle && (
          <Card>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-clay">The notebook's question</div>
            <p className="mt-2 font-serif text-[22px] font-semibold leading-snug text-ink">
              If a farmer can afford only one test, measure <span className="text-accent">{domain.featureLabel(bestSingle.f)} ({domain.featureShort(bestSingle.f)})</span>.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
              On its own it gets {pct(bestSingle.s)} accuracy, against {pct(1 / domain.data.classes.length)} for random guessing among {domain.data.classes.length} crops. But no single test is enough: the big jumps come from combining them.
            </p>
          </Card>
        )}
        <Card
          title="Permutation importance"
          subtitle="Shuffle one column in the test set and measure how much accuracy collapses. Works for any model."
          actions={
            <Button size="sm" onClick={runPerm} disabled={permRunning}>
              {permRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Compute
            </Button>
          }
        >
          {perm ? (
            <>
              <EChart option={permOption} height={200} notMerge ariaLabel="Permutation importance" />
              <p className="mt-1 text-[11.5px] text-ink-3">Baseline accuracy {pct(perm.baseline)} with the current lab pipeline (all four tests).</p>
            </>
          ) : (
            <div className="grid h-[200px] place-items-center text-center text-[12.5px] text-ink-3">Uses your current lab model. Press Compute.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
