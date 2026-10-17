import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, BoxplotChart, HeatmapChart, LineChart, ParallelChart, ScatterChart } from "echarts/charts";
import {
  GridComponent, LegendComponent, MarkAreaComponent, MarkPointComponent, ParallelComponent, TooltipComponent, VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption, ECharts } from "echarts";
import { useTokens, type Tokens } from "../lib/theme";

// Register only what the site uses to keep the bundle small.
echarts.use([
  BarChart, BoxplotChart, HeatmapChart, LineChart, ParallelChart, ScatterChart,
  GridComponent, LegendComponent, MarkAreaComponent, MarkPointComponent, ParallelComponent, TooltipComponent, VisualMapComponent,
  CanvasRenderer,
]);

type Handler = (params: any, chart: ECharts) => void;

interface Props {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  on?: Record<string, Handler>;
  /** Replace instead of merging options (use when series count changes). */
  notMerge?: boolean;
  ariaLabel?: string;
}

/** Shared defaults so every chart in the site looks like one family. */
export function baseOption(t: Tokens): EChartsOption {
  return {
    backgroundColor: "transparent",
    textStyle: { fontFamily: "Inter Variable, system-ui, sans-serif", color: t.ink2, fontSize: 11 },
    animationDuration: 500,
    animationDurationUpdate: 350,
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.line,
      textStyle: { color: t.ink, fontSize: 12 },
      extraCssText: "border-radius:10px;box-shadow:0 6px 24px rgb(0 0 0 / .12);",
    },
  };
}

export function axisStyle(t: Tokens) {
  return {
    axisLine: { lineStyle: { color: t.line } },
    axisTick: { show: false },
    axisLabel: { color: t.ink3, fontSize: 10 },
    splitLine: { lineStyle: { color: t.line, opacity: 0.6 } },
    nameTextStyle: { color: t.ink3, fontSize: 11 },
  };
}

export default function EChart({ option, height = 300, className, on, notMerge, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const handlers = useRef(on);
  handlers.current = on;
  const t = useTokens();

  useEffect(() => {
    const c = echarts.init(ref.current!, undefined, { renderer: "canvas" });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current!);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current!;
    const events = Object.keys(handlers.current ?? {});
    events.forEach((ev) => c.on(ev, (p: unknown) => handlers.current?.[ev]?.(p, c)));
    return () => events.forEach((ev) => c.off(ev));
  }, [on ? Object.keys(on).join() : ""]);

  useEffect(() => {
    chart.current?.setOption({ ...baseOption(t), ...option } as EChartsOption, { notMerge, lazyUpdate: true });
  }, [option, t, notMerge]);

  return <div ref={ref} role="img" aria-label={ariaLabel} className={className} style={{ height, width: "100%" }} />;
}
