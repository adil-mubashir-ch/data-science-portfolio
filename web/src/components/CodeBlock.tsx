import { useState, type ReactElement } from "react";
import { Check, Copy } from "lucide-react";

const KEYWORDS = new Set([
  "import", "from", "as", "def", "class", "return", "self", "None", "True", "False", "print", "for", "in", "if", "else", "lambda",
]);

/** Tiny Python highlighter: enough for generated sklearn snippets. */
function highlight(code: string) {
  const re = /(#[^\n]*)|("""[\s\S]*?"""|f?"[^"\n]*")|(\b\d+(?:\.\d+)?(?:e-?\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;
  const out: (string | ReactElement)[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const [tok, comment, str, num, word] = m;
    const cls = comment ? "text-ink-3 italic"
      : str ? "text-clay"
      : num ? "text-warn"
      : word && KEYWORDS.has(word) ? "text-accent font-semibold"
      : word && /^[A-Z]/.test(word) ? "text-ink font-semibold"
      : "";
    out.push(cls ? <span key={k++} className={cls}>{tok}</span> : tok);
    last = m.index + tok.length;
  }
  out.push(code.slice(last));
  return out;
}

export default function CodeBlock({ code, filename }: { code: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-2/60">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-mono text-[11px] text-ink-3">{filename ?? "python"}</span>
        <button onClick={copy} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-2 hover:bg-surface hover:text-ink">
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto p-4 font-mono text-[12px] leading-relaxed text-ink-2">
        <code>{highlight(code)}</code>
      </pre>
    </div>
  );
}
