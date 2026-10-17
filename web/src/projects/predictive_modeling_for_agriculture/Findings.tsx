import { Card, pct } from "../../components/ui";
import { FEATURES } from "./crops";

const short = (f: string) => FEATURES[f]?.short ?? f;

export interface Reference {
  sklearnVersion: string;
  split: string;
  models: { name: string; train: number; test: number; f1: number }[];
  singleFeatureLogReg: Record<string, number>;
  randomForestSubsets: { features: string[]; test: number }[];
}

export default function Findings({ reference }: { reference: Reference }) {
  const models = [...reference.models].sort((a, b) => b.test - a.test);
  const best = models[0];
  const lr = reference.models[0];
  const knnRaw = reference.models.find((m) => m.name.startsWith("k-NN") && m.name.includes("unscaled"));
  const knnScaled = reference.models.find((m) => m.name.startsWith("k-NN") && m.name.includes("StandardScaler"));
  const singles = Object.entries(reference.singleFeatureLogReg).sort((a, b) => b[1] - a[1]);

  const findings = [
    {
      title: `${short(singles[0][0])} is the single most useful test, but one test is never enough`,
      body: `On its own, ${short(singles[0][0])} predicts the right crop ${pct(singles[0][1])} of the time with logistic regression (vs ${singles
        .slice(1)
        .map(([f, v]) => `${short(f)} ${pct(v)}`)
        .join(", ")}). Combining all four with a random forest reaches ${pct(best.test)}.`,
    },
    {
      title: `Non-linear models add about ${Math.round((best.test - lr.test) * 100)} points over the notebook`,
      body: `Logistic regression plateaus around ${pct(lr.test)} because crop regions aren't separable by straight lines. ${best.name} reaches ${pct(best.test)}: it can carve out the boxy, overlapping regions you can see on the soil map.`,
    },
    ...(knnRaw && knnScaled
      ? [{
          title: "Scaling matters for distance-based models, not for trees",
          body: `k-NN jumps from ${pct(knnRaw.test)} to ${pct(knnScaled.test)} once features are standardised, because otherwise K's large numbers dominate the distance. Trees and forests give identical results with or without scaling.`,
        }]
      : []),
    {
      title: "The remaining error is a data limit, not a modelling one",
      body: "Most mistakes fall in look-alike pairs (apple vs grapes, kidney beans vs pigeon peas, moth beans vs mung beans, muskmelon vs watermelon) whose soil profiles are almost identical. The right crop is in the top 3 suggestions about 99% of the time, so the model works well as a shortlist.",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-7">
        {findings.map((f, i) => (
          <div key={f.title} className="flex gap-4 rounded-2xl border border-line bg-surface p-5">
            <span className="font-serif text-3xl font-semibold leading-none text-clay/70">{i + 1}</span>
            <div>
              <h3 className="text-[15px] font-semibold text-ink">{f.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{f.body}</p>
            </div>
          </div>
        ))}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card title="Recommendation for the farmer">
            <ul className="list-disc space-y-1.5 pl-4 text-[13.5px] leading-relaxed text-ink-2">
              <li>If you can afford one test, buy <strong className="text-ink">potassium (K)</strong>.</li>
              <li>All four tests together are worth it: accuracy roughly doubles compared with any pair.</li>
              <li>Treat the output as a <strong className="text-ink">top-3 shortlist</strong>, then decide with local knowledge such as climate and market prices.</li>
            </ul>
          </Card>
          <Card title="What I'd do next">
            <ul className="list-disc space-y-1.5 pl-4 text-[13.5px] leading-relaxed text-ink-2">
              <li>Add climate features (rainfall, humidity, temperature) to split the look-alike pairs.</li>
              <li>Make feature selection cost-aware: accuracy gained per unit spent on tests.</li>
              <li>Calibrate the probabilities so "70% sure" really means 70%.</li>
            </ul>
          </Card>
        </div>
      </div>

      <div className="space-y-5 lg:col-span-5">
        <Card title="scikit-learn reference results" subtitle={`scikit-learn ${reference.sklearnVersion} · ${reference.split}`}>
          <table className="w-full text-[12.5px]">
            <thead className="text-[10px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="pb-2 text-left font-semibold">Model</th>
                <th className="pb-2 text-right font-semibold">Train</th>
                <th className="pb-2 text-right font-semibold">Test</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.name} className="border-t border-line">
                  <td className="py-2 pr-2 text-ink">
                    {m.name}
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
                      <div className={`h-full rounded-full ${m === best ? "bg-accent" : m === lr ? "bg-ink-3" : "bg-accent/45"}`} style={{ width: `${m.test * 100}%` }} />
                    </div>
                  </td>
                  <td className="tabular py-2 text-right text-ink-3">{pct(m.train)}</td>
                  <td className="tabular py-2 text-right font-semibold text-ink">{pct(m.test)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="How this page works">
          <ol className="list-decimal space-y-1.5 pl-4 text-[13px] leading-relaxed text-ink-2">
            <li>The analysis started in a Jupyter notebook (pandas, seaborn, scikit-learn).</li>
            <li>A Python build script exports the dataset and these reference scores as JSON.</li>
            <li>The models and preprocessing steps are re-implemented in TypeScript and run in a Web Worker, so the page stays responsive while they train.</li>
            <li>The in-browser models are checked against scikit-learn: they land within a few points of the table above. The gaps come from the different train/test split.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
