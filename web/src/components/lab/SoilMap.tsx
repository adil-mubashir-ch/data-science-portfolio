import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, Select, Slider, Toggle, cx, pct } from "../ui";
import { useTokens } from "../../lib/theme";
import { describeConfig, useLab } from "./LabContext";

const RES = 110;

const hexToRgb = (h: string) => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

interface Grid { cls: Int16Array; conf: Float32Array; res: number; version: number }

export default function SoilMap({ emoji }: { emoji?: (i: number) => string | undefined }) {
  const { domain, live, result, award, config } = useLab();
  const t = useTokens();
  const { data } = domain;
  const ranges = useMemo(
    () => data.features.map((_, j) => {
      const col = data.X.map((r) => r[j]);
      return [Math.min(...col), Math.max(...col)] as [number, number];
    }),
    [data],
  );
  const medians = useMemo(
    () => data.features.map((_, j) => {
      const s = data.X.map((r) => r[j]).sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    }),
    [data],
  );
  const [field, setField] = useState<number[]>(() => medians.map((m) => +m.toFixed(2)));
  const [xi, setXi] = useState(Math.max(0, data.features.indexOf("K")));
  const [yi, setYi] = useState(Math.max(0, data.features.indexOf("P")) || 1);
  const [showPoints, setShowPoints] = useState(true);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [loading, setLoading] = useState(false);
  const [proba, setProba] = useState<number[] | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; cls: number; conf: number; px: number; py: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const touched = useRef(false);

  const pad = (r: [number, number]) => [r[0] - (r[1] - r[0]) * 0.03, r[1] + (r[1] - r[0]) * 0.03] as [number, number];
  const xr = pad(ranges[xi]);
  const yr = pad(ranges[yi]);
  const others = data.features.map((_, j) => j).filter((j) => j !== xi && j !== yi);
  const usedOthers = others.filter((j) => config.features.includes(data.features[j]));

  // Re-render the decision map when the model or the fixed values change.
  const othersKey = others.map((j) => field[j]).join();
  useEffect(() => {
    if (!result) return;
    setLoading(true);
    const timer = setTimeout(() => {
      live
        .call<Grid | null>({ op: "grid", xi, yi, base: field, xRange: xr, yRange: yr, res: RES })
        .then((g) => g && setGrid(g))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 120);
    return () => clearTimeout(timer);
  }, [result?.modelVersion, xi, yi, othersKey]);

  useEffect(() => {
    if (!result) return;
    live.call<{ proba: number[][] } | null>({ op: "predict", rows: [field] }).then((r) => r && setProba(r.proba[0])).catch(() => {});
  }, [result?.modelVersion, field.join()]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !grid) return;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(grid.res, grid.res);
    const colors = data.classes.map((_, i) => hexToRgb(domain.classColor(i)));
    const bg = hexToRgb(t.surface);
    for (let i = 0; i < grid.cls.length; i++) {
      const [r, g, b] = colors[grid.cls[i]];
      const row = Math.floor(i / grid.res), col = i % grid.res;
      const edge = (col + 1 < grid.res && grid.cls[i + 1] !== grid.cls[i]) || (row + 1 < grid.res && grid.cls[i + grid.res] !== grid.cls[i]);
      const a = edge ? 0.95 : 0.28 + 0.5 * grid.conf[i];
      img.data[i * 4] = Math.round(r * a + bg[0] * (1 - a));
      img.data[i * 4 + 1] = Math.round(g * a + bg[1] * (1 - a));
      img.data[i * 4 + 2] = Math.round(b * a + bg[2] * (1 - a));
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [grid, t, data, domain]);

  const toPx = (v: number, r: [number, number]) => ((v - r[0]) / (r[1] - r[0])) * 100;
  const points = useMemo(() => {
    if (!showPoints) return [];
    // Show fields whose hidden coordinates are near the slice, so the dots match the map.
    const tol = others.map((j) => (ranges[j][1] - ranges[j][0]) * 0.18);
    return data.X.map((r, i) => ({ r, c: data.y[i] })).filter(({ r }) => others.every((j, k) => !usedOthers.includes(j) || Math.abs(r[j] - field[j]) <= tol[k]));
  }, [showPoints, othersKey, xi, yi, data, config.features.join()]);

  const top = proba ? proba.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p).slice(0, 5) : [];
  const nearest = useMemo(() => {
    const sd = ranges.map(([a, b]) => b - a || 1);
    return data.X.map((r, i) => ({ i, d: Math.sqrt(r.reduce((s, v, j) => s + ((v - field[j]) / sd[j]) ** 2, 0)) })).sort((a, b) => a.d - b.d).slice(0, 4);
  }, [field.join(), data, ranges]);

  const setF = (j: number, v: number) => {
    setField((f) => f.map((x, k) => (k === j ? v : x)));
    if (!touched.current) {
      touched.current = true;
      award("map");
    }
  };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!grid) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
    const c = Math.min(grid.res - 1, Math.floor(fx * grid.res)), r = Math.min(grid.res - 1, Math.floor(fy * grid.res));
    setHoverInfo({ x: xr[0] + fx * (xr[1] - xr[0]), y: yr[1] - fy * (yr[1] - yr[0]), cls: grid.cls[r * grid.res + c], conf: grid.conf[r * grid.res + c], px: fx * 100, py: fy * 100 });
  };
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
    const round = (v: number, j: number) => +(Math.min(ranges[j][1], Math.max(ranges[j][0], v))).toFixed(data.features[j] === "ph" ? 2 : 0);
    setField((f) => f.map((v, j) => (j === xi ? round(xr[0] + fx * (xr[1] - xr[0]), j) : j === yi ? round(yr[1] - fy * (yr[1] - yr[0]), j) : v)));
    if (!touched.current) {
      touched.current = true;
      award("map");
    }
  };

  const fmt = (v: number, j: number) => (data.features[j] === "ph" ? v.toFixed(2) : Math.round(v).toString());
  const axisOpts = data.features.map((f, j) => ({ value: String(j), label: domain.featureLabel(f) }));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <Card className="lg:col-span-3" title="Your field" subtitle="Set the soil test results">
        <div className="space-y-4">
          {data.features.map((f, j) => (
            <Slider
              key={f}
              label={domain.featureLabel(f)}
              value={field[j]}
              min={+ranges[j][0].toFixed(2)}
              max={+ranges[j][1].toFixed(2)}
              step={f === "ph" ? 0.05 : 1}
              display={fmt(field[j], j)}
              onChange={(v) => setF(j, v)}
            />
          ))}
        </div>
        <div className="mt-5 space-y-3 border-t border-line pt-4">
          <Select label="Horizontal axis" value={String(xi)} options={axisOpts} onChange={(v) => { const n = Number(v); if (n === yi) setYi(xi); setXi(n); }} />
          <Select label="Vertical axis" value={String(yi)} options={axisOpts} onChange={(v) => { const n = Number(v); if (n === xi) setXi(yi); setYi(n); }} />
          <Toggle label="Show real fields near this slice" checked={showPoints} onChange={setShowPoints} />
        </div>
      </Card>

      <Card
        className="lg:col-span-6"
        title={<span className="flex items-center gap-2">What the model would plant, everywhere {loading && <Loader2 size={13} className="animate-spin text-ink-3" />}</span>}
        subtitle={`${domain.featureLabel(data.features[xi])} × ${domain.featureLabel(data.features[yi])}, with ${others.map((j) => `${domain.featureShort(data.features[j])} = ${fmt(field[j], j)}`).join(", ")}. Click to move your field.`}
      >
        <div className="flex gap-2">
          <div className="flex w-5 shrink-0 items-center justify-center">
            <span className="-rotate-90 whitespace-nowrap text-[11px] text-ink-3">{domain.featureLabel(data.features[yi])} →</span>
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="relative aspect-square w-full cursor-crosshair overflow-hidden rounded-xl border border-line bg-surface-2"
              onMouseMove={onMove}
              onMouseLeave={() => setHoverInfo(null)}
              onClick={onClick}
            >
              <canvas ref={canvas} width={RES} height={RES} className={cx("absolute inset-0 h-full w-full transition-opacity", loading && "opacity-80")} style={{ imageRendering: "auto" }} />
              {!result && <div className="absolute inset-0 grid place-items-center text-[13px] text-ink-3">Train a model in the lab first.</div>}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                {points.map(({ r, c }, i) => (
                  <circle key={i} cx={toPx(r[xi], xr)} cy={100 - toPx(r[yi], yr)} r={0.75} fill={domain.classColor(c)} stroke={t.surface} strokeWidth={0.25} vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
              <div className="pointer-events-none absolute" style={{ left: `${toPx(field[xi], xr)}%`, top: `${100 - toPx(field[yi], yr)}%` }}>
                <div className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-ink/40" />
                <div className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-ink shadow-lg" />
              </div>
              {hoverInfo && (
                <div
                  className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 text-[11px] text-ink shadow-lg backdrop-blur"
                  style={{ left: `${Math.min(hoverInfo.px, 70)}%`, top: `${Math.min(hoverInfo.py, 85)}%`, transform: "translate(10px, 10px)" }}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <i className="h-2 w-2 rounded-full" style={{ background: domain.classColor(hoverInfo.cls) }} />
                    {domain.classLabel(hoverInfo.cls)} <span className="font-normal text-ink-3">{pct(hoverInfo.conf, 0)}</span>
                  </div>
                  <div className="font-mono text-ink-3">{domain.featureShort(data.features[xi])} {fmt(hoverInfo.x, xi)} · {domain.featureShort(data.features[yi])} {fmt(hoverInfo.y, yi)}</div>
                </div>
              )}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-ink-3">
              <span className="tabular">{fmt(ranges[xi][0], xi)}</span>
              <span className="text-[11px]">{domain.featureLabel(data.features[xi])} →</span>
              <span className="tabular">{fmt(ranges[xi][1], xi)}</span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] leading-snug text-ink-3">
          Colour = predicted crop; paler = less confident; dark seams = decision boundaries. Model: {describeConfig(config, data.features.length)}.
          Change the model in the lab and watch the map redraw: trees draw boxes, k-NN draws blobs, logistic regression draws straight lines.
        </p>
      </Card>

      <div className="space-y-5 lg:col-span-3">
        <Card title="Recommendation" subtitle="Top 5 crops for your field">
          {top.length ? (
            <ol className="space-y-2.5">
              {top.map(({ p, i }, rank) => (
                <li key={i}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className={cx("flex items-center gap-1.5", rank === 0 ? "font-semibold text-ink" : "text-ink-2")}>
                      {emoji?.(i) ?? <i className="h-2.5 w-2.5 rounded-full" style={{ background: domain.classColor(i) }} />}
                      {domain.classLabel(i)}
                    </span>
                    <span className="tabular font-mono text-[12px] text-ink-2">{pct(p, 0)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${p * 100}%`, background: domain.classColor(i) }} />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[12.5px] text-ink-3">Waiting for a trained model…</p>
          )}
        </Card>
        <Card title="Most similar real fields">
          <ul className="space-y-1.5">
            {nearest.map(({ i }) => (
              <li key={i} className="text-[12px]">
                <span className="flex items-center gap-1.5 text-ink"><i className="h-2 w-2 shrink-0 rounded-full" style={{ background: domain.classColor(data.y[i]) }} />{domain.classLabel(data.y[i])}</span>
                <span className="tabular block pl-3.5 font-mono text-[10.5px] text-ink-3">
                  {data.X[i].map((v, j) => `${domain.featureShort(data.features[j])} ${fmt(v, j)}`).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
