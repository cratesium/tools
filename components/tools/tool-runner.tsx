"use client";

import { Component, useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Alert } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/button";
import { categoryLoaders } from "./loaders";

type Props = ToolComponentProps;

/**
 * Loads the category UI bundle for this tool and renders the processor component.
 * Each mounted runner has its own React state: nothing is shared between visitors,
 * tabs or tool instances.
 */
export function ToolRunner({ tool }: Props) {
  const planned = tool.status === "planned" || tool.processor === "planned";
  const [loaded, setLoaded] = useState<{ key: string; comp: ComponentType<ToolComponentProps> | null; error: string | null } | null>(null);
  const key = `${tool.category}/${tool.processor}`;
  const current = loaded?.key === key ? loaded : null;
  const Comp = current?.comp ?? null;
  const loadError = current?.error ?? null;
  const missing = planned || (current != null && !current.comp && !current.error);

  useEffect(() => {
    let alive = true;
    if (planned) return;
    categoryLoaders[tool.category]()
      .then((m) => {
        if (alive) setLoaded({ key, comp: m.default[tool.processor] ?? null, error: null });
      })
      .catch((e) => alive && setLoaded({ key, comp: null, error: String(e?.message ?? e) }));
    return () => {
      alive = false;
    };
  }, [tool.category, tool.processor, planned, key]);

  if (loadError)
    return (
      <Alert tone="danger" title="This tool failed to load">
        {loadError}. Check your connection and reload the page.
      </Alert>
    );
  if (missing)
    return (
      <Alert tone="warning" title="Not available yet">
        {tool.name} is listed in the catalogue but has not been implemented. Nothing will be processed on this page.
      </Alert>
    );
  if (!Comp)
    return (
      <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-fg-subtle" aria-live="polite">
        <Spinner /> Loading tool…
      </div>
    );
  return (
    <ToolErrorBoundary>
      <div data-testid="tool-ui" data-processor={tool.processor}>
        <Comp tool={tool} />
      </div>
    </ToolErrorBoundary>
  );
}

class ToolErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <Alert tone="danger" title="The tool crashed">
          {this.state.error.message}
          <button className="ml-2 underline" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </Alert>
      );
    return this.props.children;
  }
}
