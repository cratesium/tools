"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import type { ToolSummary } from "@/types/tool";
import { searchTools } from "@/lib/tools/search";
import { CategoryIcon } from "@/components/ui/category-icon";
import { StatusBadge } from "@/components/ui/feedback";
import { cn } from "@/lib/utils/cn";

let indexPromise: Promise<ToolSummary[]> | null = null;
/** Fetches the static search index once per page load (it is a ~40 KB static JSON file). */
export function loadSearchIndex(): Promise<ToolSummary[]> {
  if (!indexPromise) {
    indexPromise = fetch("/search-index.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ToolSummary[]>;
      })
      .catch((e) => {
        indexPromise = null;
        throw e;
      });
  }
  return indexPromise;
}

function useSearchIndex(enabled: boolean) {
  const [index, setIndex] = useState<ToolSummary[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled || index) return;
    loadSearchIndex()
      .then(setIndex)
      .catch(() => setError(true));
  }, [enabled, index]);
  return { index, error };
}

function Results({
  results,
  active,
  setActive,
  onPick,
  listId,
}: {
  results: ToolSummary[];
  active: number;
  setActive: (i: number) => void;
  onPick: (t: ToolSummary) => void;
  listId: string;
}) {
  return (
    <ul id={listId} role="listbox" className="max-h-[min(60vh,420px)] overflow-auto p-1.5">
      {results.map((t, i) => (
        <li
          key={t.slug}
          id={`${listId}-${i}`}
          role="option"
          aria-selected={i === active}
          onMouseEnter={() => setActive(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(t);
          }}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
            i === active ? "bg-bg-muted" : "",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-fg-muted">
            <CategoryIcon category={t.category} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-medium text-fg">
              {t.name} <StatusBadge status={t.status} />
            </span>
            <span className="block truncate text-xs text-fg-subtle">{t.shortDescription}</span>
          </span>
          {i === active ? <CornerDownLeft className="h-3.5 w-3.5 text-fg-subtle" aria-hidden /> : null}
        </li>
      ))}
    </ul>
  );
}

/** Large inline search box (homepage hero, tools page). */
export function InlineSearch({ autoFocus, placeholder = "Search 304 tools…" }: { autoFocus?: boolean; placeholder?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const { index, error } = useSearchIndex(focused || q.length > 0);
  const results = useMemo(() => (index && q.trim() ? searchTools(index, q, { limit: 8 }) : []), [index, q]);
  const open = focused && q.trim().length > 0;
  const pick = useCallback((t: ToolSummary) => router.push(`/tools/${t.slug}`), [router]);

  return (
    <div className="relative w-full">
      <div className="flex h-12 items-center gap-3 rounded-xl border border-border bg-card px-4 shadow-card focus-within:border-border-strong">
        <Search className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="hero-search-list"
          aria-activedescendant={open && results.length ? `hero-search-list-${active}` : undefined}
          aria-label="Search tools"
          autoFocus={autoFocus}
          value={q}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              if (results[active]) pick(results[active]);
              else if (q.trim()) router.push(`/tools?q=${encodeURIComponent(q.trim())}`);
            }
          }}
          className="h-full w-full bg-transparent text-[15px] text-fg placeholder:text-fg-subtle focus:outline-none"
        />
      </div>
      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-border bg-card text-left shadow-pop">
          {error ? (
            <p className="px-4 py-6 text-sm text-fg-subtle">Search is unavailable offline.</p>
          ) : !index ? (
            <p className="px-4 py-6 text-sm text-fg-subtle">Loading…</p>
          ) : results.length ? (
            <Results results={results} active={active} setActive={setActive} onPick={pick} listId="hero-search-list" />
          ) : (
            <p className="px-4 py-6 text-sm text-fg-subtle">No tools match “{q}”.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** ⌘K / Ctrl+K command palette available on every page. */
export function CommandSearch() {
  const router = useRouter();
  const [open, setOpenState] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const setOpen = useCallback((v: boolean | ((o: boolean) => boolean)) => {
    setOpenState((o) => {
      const next = typeof v === "function" ? v(o) : v;
      if (next && !o) {
        setQ("");
        setActive(0);
      }
      return next;
    });
  }, []);
  const inputRef = useRef<HTMLInputElement>(null);
  const { index, error } = useSearchIndex(open);
  const results = useMemo(() => (index ? searchTools(index, q, { limit: 10 }) : []), [index, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !open) {
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const pick = (t: ToolSummary) => {
    setOpen(false);
    router.push(`/tools/${t.slug}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-bg-subtle px-3 text-sm text-fg-subtle transition-colors hover:text-fg md:w-64"
        aria-label="Search tools"
      >
        <Search className="h-4 w-4" aria-hidden />
        <span className="hidden md:inline">Search tools…</span>
        <kbd className="ml-auto hidden rounded border border-border bg-card px-1.5 font-mono text-[11px] md:inline">⌘K</kbd>
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]"
          onMouseDown={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search tools"
            className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-pop"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex h-12 items-center gap-3 border-b border-border px-4">
              <Search className="h-4 w-4 text-fg-subtle" aria-hidden />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded="true"
                aria-controls="cmd-search-list"
                aria-activedescendant={results.length ? `cmd-search-list-${active}` : undefined}
                aria-label="Search tools"
                value={q}
                placeholder="Search 304 tools…"
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === "Enter" && results[active]) pick(results[active]);
                }}
                className="h-full w-full bg-transparent text-[15px] text-fg placeholder:text-fg-subtle focus:outline-none"
              />
              <kbd className="rounded border border-border px-1.5 font-mono text-[11px] text-fg-subtle">Esc</kbd>
            </div>
            {error ? (
              <p className="px-4 py-6 text-sm text-fg-subtle">Search is unavailable offline.</p>
            ) : !index ? (
              <p className="px-4 py-6 text-sm text-fg-subtle">Loading…</p>
            ) : results.length ? (
              <Results results={results} active={active} setActive={setActive} onPick={pick} listId="cmd-search-list" />
            ) : (
              <p className="px-4 py-6 text-sm text-fg-subtle">No tools match “{q}”.</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
