import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function Breadcrumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[13px] text-fg-subtle">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight className="h-3.5 w-3.5" aria-hidden /> : null}
            {it.href ? (
              <Link href={it.href} className="hover:text-fg">
                {it.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-fg-muted">
                {it.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
