"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

export function MobileNav({ categories }: { categories: { slug: string; name: string }[] }) {
  const pathname = usePathname();
  // Remember which path the menu was opened on; navigating elsewhere closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (f: (o: boolean) => boolean) => setOpenOn(f(open) ? pathname : null);
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-bg-muted hover:text-fg"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>
      {open ? (
        <nav aria-label="Mobile" className="absolute inset-x-0 top-14 border-b border-border bg-bg px-4 pb-6 pt-2 shadow-pop">
          <Link href="/tools" className="block rounded-md px-2 py-2.5 text-sm font-medium text-fg">
            All tools
          </Link>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {categories.map((c) => (
              <Link key={c.slug} href={`/category/${c.slug}`} className="rounded-md px-2 py-2 text-sm text-fg-muted hover:bg-bg-muted hover:text-fg">
                {c.name}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
