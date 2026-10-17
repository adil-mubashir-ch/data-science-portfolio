import { useEffect, useState } from "react";

const isDarkNow = () => document.documentElement.classList.contains("dark");

export function setTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {
    /* storage unavailable */
  }
}

/** Re-renders when the html.dark class changes. */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(isDarkNow);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDarkNow()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export interface Tokens {
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  surface: string;
  surface2: string;
  paper: string;
  accent: string;
  clay: string;
  good: string;
  bad: string;
  warn: string;
  dark: boolean;
}

/** CSS custom properties resolved to concrete colours (for canvas / ECharts). */
export function useTokens(): Tokens {
  const dark = useIsDark();
  const [tokens, setTokens] = useState<Tokens>(() => read(dark));
  useEffect(() => setTokens(read(dark)), [dark]);
  return tokens;
}

function read(dark: boolean): Tokens {
  const s = getComputedStyle(document.documentElement);
  const g = (n: string) => s.getPropertyValue(n).trim();
  return {
    ink: g("--ink"), ink2: g("--ink-2"), ink3: g("--ink-3"), line: g("--line"), surface: g("--surface"),
    surface2: g("--surface-2"), paper: g("--paper"), accent: g("--accent"), clay: g("--clay"),
    good: g("--good"), bad: g("--bad"), warn: g("--warn"), dark,
  };
}
