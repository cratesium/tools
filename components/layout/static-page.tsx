import type { ReactNode } from "react";
import { Container } from "./container";
import { Breadcrumbs } from "./breadcrumbs";

export function StaticPage({ title, children, updated }: { title: string; children: ReactNode; updated?: string }) {
  return (
    <Container className="py-8">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: title }]} />
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h1>
      {updated ? <p className="mt-2 text-sm text-fg-subtle">Last updated {updated}</p> : null}
      <div className="prose-uh mt-6 max-w-3xl">{children}</div>
    </Container>
  );
}
