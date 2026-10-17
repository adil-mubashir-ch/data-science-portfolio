import { useId, useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { Info } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

export function Card({ children, className, title, subtitle, actions, padded = true }: {
  children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; padded?: boolean;
}) {
  return (
    <section className={cx("rounded-2xl border border-line bg-surface shadow-[0_1px_0_rgb(0_0_0/0.02)]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-semibold text-ink">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function SectionHeader({ index, kicker, title, children, id }: {
  index: string; kicker: string; title: ReactNode; children?: ReactNode; id: string;
}) {
  return (
    <header id={id} className="scroll-mt-28 pb-6 pt-20">
      <div className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-clay">
        <span className="tabular rounded-full border border-clay/30 px-2 py-0.5">{index}</span>
        {kicker}
      </div>
      <h2 className="mt-3 max-w-3xl font-serif text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">{title}</h2>
      {children && <div className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">{children}</div>}
    </header>
  );
}

export function Button({ variant = "secondary", size = "md", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md";
}) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        size === "sm" ? "h-8 px-3 text-[12px]" : "h-9 px-4 text-[13px]",
        variant === "primary" && "bg-accent text-accent-ink hover:opacity-90",
        variant === "secondary" && "border border-line bg-surface text-ink hover:bg-surface-2",
        variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
        className,
      )}
    />
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "clay" | "good" | "bad" | "warn"; className?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2",
    accent: "bg-accent-soft text-accent",
    clay: "bg-clay-soft text-clay",
    good: "bg-accent-soft text-good",
    bad: "bg-clay-soft text-bad",
    warn: "bg-clay-soft text-warn",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>{children}</span>;
}

export function InfoTip({ text, className }: { text: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={cx("relative inline-flex", className)}>
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label="More info"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-ink-3 hover:text-ink"
      >
        <Info size={13} />
      </button>
      {open && (
        <span id={id} role="tooltip" className="pop absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 text-[12px] font-normal normal-case leading-snug tracking-normal text-ink-2 shadow-xl">
          {text}
        </span>
      )}
    </span>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, display, help, log }: {
  label: ReactNode; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
  display?: string; help?: string; log?: boolean;
}) {
  const id = useId();
  const toPos = (v: number) => (log ? Math.log10(v) : v);
  const fromPos = (p: number) => (log ? +(10 ** p).toPrecision(3) : p);
  const lo = toPos(min), hi = toPos(max);
  const pos = toPos(value);
  const fill = ((pos - lo) / (hi - lo)) * 100;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
          {label}
          {help && <InfoTip text={help} />}
        </label>
        <span className="tabular rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink">{display ?? value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={lo}
        max={hi}
        step={log ? (hi - lo) / 200 : step}
        value={pos}
        style={{ ["--fill" as string]: `${fill}%` }}
        onChange={(e) => onChange(fromPos(Number(e.target.value)))}
      />
    </div>
  );
}

export function Select<T extends string>({ label, value, options, onChange, help, className }: {
  label?: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; help?: string; className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
          {label}
          {help && <InfoTip text={help} />}
        </label>
      )}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function Toggle({ label, checked, onChange, help }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-[12px] font-medium text-ink-2">
      <span className="flex items-center gap-1.5">
        {label}
        {help && <InfoTip text={help} />}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-line")}
      >
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: "sm" | "md";
}) {
  return (
    <div role="tablist" className="inline-flex rounded-full border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-full font-medium transition-all",
            size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-[12px]",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatTile({ label, value, sub, tone, help }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "neutral"; help?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-3">
        {label}
        {help && <InfoTip text={help} />}
      </div>
      <div className="tabular mt-1 font-serif text-[28px] font-semibold leading-none text-ink">{value}</div>
      {sub && <div className={cx("tabular mt-1.5 text-[12px]", tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink-3")}>{sub}</div>}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx("h-1 overflow-hidden rounded-full bg-line", className)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
