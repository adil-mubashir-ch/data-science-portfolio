import { Link } from "react-router-dom";
import { ArrowUpRight, FlaskConical } from "lucide-react";
import { projects } from "../projects/registry";
import { site } from "../site";

export default function Home() {
  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6">
      <section className="py-16 sm:py-24">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-clay">{site.name}</p>
        <h1 className="mt-4 max-w-3xl font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
          {site.tagline}
        </h1>
        <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-ink-2">{site.intro}</p>
      </section>

      <section aria-labelledby="projects-heading">
        <div className="mb-5 flex items-end justify-between">
          <h2 id="projects-heading" className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-3">
            Projects · {projects.length}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {projects.map(({ meta }) => (
            <Link
              key={meta.slug}
              to={`/projects/${meta.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/5"
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-surface-2">
                {meta.cover && <img src={meta.cover} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-ink backdrop-blur">
                  <FlaskConical size={12} /> Interactive lab
                </span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="flex items-start justify-between gap-3 font-serif text-xl font-semibold leading-snug text-ink">
                  {meta.title}
                  <ArrowUpRight size={18} className="mt-1 shrink-0 text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{meta.summary}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {meta.tags.map((t) => (
                    <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">{t}</span>
                  ))}
                </div>
                <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-4 mt-5">
                  {meta.highlights.map((h) => (
                    <div key={h.label}>
                      <dt className="text-[10px] uppercase tracking-wider text-ink-3">{h.label}</dt>
                      <dd className="tabular font-serif text-lg font-semibold text-ink">{h.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Link>
          ))}
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-line p-6 text-center text-[13px] text-ink-3">
            More projects growing soon.
          </div>
        </div>
      </section>
    </main>
  );
}
