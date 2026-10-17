import { Sparkles } from "lucide-react";
import { Card } from "../ui";
import { useLab } from "./LabContext";
import PipelineEditor from "./PipelineEditor";
import Inspector from "./Inspector";
import Results from "./Results";
import ExperimentLog from "./ExperimentLog";
import Missions from "./Missions";

export default function Lab() {
  const { domain, setConfig, setSelected } = useLab();
  return (
    <div className="space-y-5">
      <Card
        title="Pipeline"
        subtitle="Click any block to configure it · drag steps to reorder · the eye icon disables a step without deleting it"
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-ink-3"><Sparkles size={12} /> Presets</span>
            {domain.presets.map((p) => (
              <button
                key={p.name}
                title={p.description}
                onClick={() => {
                  setConfig({ ...p.config, steps: p.config.steps.map((s) => ({ ...s, id: `${s.id}-${Date.now()}` })) });
                  setSelected("model");
                }}
                className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
              >
                {p.name}
              </button>
            ))}
          </div>
        }
      >
        <div>
          <PipelineEditor />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-4">
          <Card><Inspector /></Card>
          <Card><Missions /></Card>
        </div>
        <Card className="lg:col-span-8"><Results /></Card>
      </div>

      <Card title="Experiment log" subtitle="Every training run, so you can compare like a real ML experiment tracker">
        <ExperimentLog />
      </Card>
    </div>
  );
}
