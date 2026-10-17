import { formatParam, type ParamSchema } from "../../lib/ml/registry";
import type { Params, ParamValue } from "../../lib/ml/types";
import { Select, Slider, Toggle } from "../ui";

export default function ParamControls({ schema, params, onChange }: {
  schema: ParamSchema[];
  params: Params;
  onChange: (key: string, v: ParamValue) => void;
}) {
  if (!schema.length) return <p className="text-[12px] text-ink-3">No settings: this step is fully determined by the training data.</p>;
  return (
    <div className="space-y-4">
      {schema.map((s) => {
        const v = params[s.key];
        switch (s.kind) {
          case "int":
          case "float":
          case "log":
            return (
              <Slider
                key={s.key}
                label={s.label}
                help={s.help}
                value={Number(v)}
                min={s.min}
                max={s.max}
                step={s.kind === "int" ? (s.step ?? 1) : s.kind === "float" ? s.step : undefined}
                log={s.kind === "log"}
                display={formatParam(s, v)}
                onChange={(n) => onChange(s.key, s.kind === "int" ? Math.round(n) : n)}
              />
            );
          case "select":
            return <Select key={s.key} label={s.label} help={s.help} value={String(v)} options={s.options} onChange={(x) => onChange(s.key, x)} />;
          case "bool":
            return <Toggle key={s.key} label={s.label} help={s.help} checked={Boolean(v)} onChange={(x) => onChange(s.key, x)} />;
        }
      })}
    </div>
  );
}
