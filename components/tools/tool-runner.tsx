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
  const [Comp, setComp] = useState<ComponentType<ToolComponentProps> | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (tool.status === "planned" || tool.processor === "planned") {
      setMissing(true);
      return;
    }
    categoryLoaders[tool.category]()
      .then((m) => {
        if (!alive) return;
        const c = m.default[tool.processor];
        if (c) setComp(() => c);
        else setMissing(true);
      })
      .catch((e) => alive && setLoadError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, [tool.category, tool.processor, tool.status]);

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
