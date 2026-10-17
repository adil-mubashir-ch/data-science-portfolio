import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Moon, Sprout, Sun } from "lucide-react";
import { setTheme, useIsDark } from "../lib/theme";
import { site } from "../site";

export default function Layout() {
  const dark = useIsDark();
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-ink">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-ink">
              <Sprout size={16} />
            </span>
            <span className="text-[14px]">{site.title}</span>
          </Link>
          <nav className="flex items-center gap-1 text-[13px]">
            <NavLink to="/" end className={({ isActive }) => `rounded-full px-3 py-1.5 ${isActive ? "text-ink" : "text-ink-3 hover:text-ink"}`}>
              Projects
            </NavLink>
            <a href={site.links.github} target="_blank" rel="noreferrer" className="rounded-full px-3 py-1.5 text-ink-3 hover:text-ink">
              GitHub
            </a>
            <button
              onClick={() => setTheme(!dark)}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="ml-1 grid h-8 w-8 place-items-center rounded-full border border-line text-ink-2 hover:text-ink"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </nav>
        </div>
      </header>
      <Outlet />
      <footer className="mt-24 border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-8 text-[12px] text-ink-3 sm:px-6">
          <span>© {new Date().getFullYear()} {site.name}</span>
          <span>All models train in your browser. No server, no tracking.</span>
        </div>
      </footer>
    </div>
  );
}
