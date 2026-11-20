import Link from "next/link";
import { CommandSearch } from "@/components/search/command-search";
import { ThemeToggle } from "./theme-toggle";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { categories } from "@/lib/tools/categories";

export function Header() {
  const cats = categories.map((c) => ({ slug: c.slug, name: c.shortName }));
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded focus:bg-card focus:px-3 focus:py-1.5 focus:text-sm">
        Skip to content
      </a>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-fg" aria-label="UtilityHub home">
          <Logo />
          <span>UtilityHub</span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 text-sm md:flex">
          <Link href="/tools" className="rounded-md px-2.5 py-1.5 text-fg-muted hover:text-fg">
            All tools
          </Link>
          <Link href="/category/pdf" className="rounded-md px-2.5 py-1.5 text-fg-muted hover:text-fg">
            PDF
          </Link>
          <Link href="/category/image" className="rounded-md px-2.5 py-1.5 text-fg-muted hover:text-fg">
            Image
          </Link>
          <Link href="/category/developer" className="rounded-md px-2.5 py-1.5 text-fg-muted hover:text-fg">
            Developer
          </Link>
          <Link href="/#categories" className="rounded-md px-2.5 py-1.5 text-fg-muted hover:text-fg">
            Categories
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <CommandSearch />
          <ThemeToggle />
          <MobileNav categories={cats} />
        </div>
      </div>
    </header>
  );
}
