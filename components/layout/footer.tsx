import Link from "next/link";
import { categories } from "@/lib/tools/categories";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-bg-subtle">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_2fr]">
        <div className="space-y-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-fg">
            <Logo /> UtilityHub
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-fg-muted">
            304 free online tools. Files are processed in your browser whenever possible and are never stored on our servers.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div>
            <h2 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Categories</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {categories.slice(0, 7).map((c) => (
                <li key={c.slug}>
                  <Link href={`/category/${c.slug}`} className="text-fg-muted hover:text-fg">
                    {c.shortName} tools
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">More</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {categories.slice(7).map((c) => (
                <li key={c.slug}>
                  <Link href={`/category/${c.slug}`} className="text-fg-muted hover:text-fg">
                    {c.shortName} tools
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Company</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/tools" className="text-fg-muted hover:text-fg">All tools</Link></li>
              <li><Link href="/about" className="text-fg-muted hover:text-fg">About</Link></li>
              <li><Link href="/contact" className="text-fg-muted hover:text-fg">Contact</Link></li>
              <li><Link href="/privacy" className="text-fg-muted hover:text-fg">Privacy</Link></li>
              <li><Link href="/terms" className="text-fg-muted hover:text-fg">Terms</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-fg-subtle sm:px-6">
          © {new Date().getFullYear()} UtilityHub. Built with Next.js and hosted on Cloudflare.
        </p>
      </div>
    </footer>
  );
}
