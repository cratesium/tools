import Link from "next/link";
import { Container } from "@/components/layout/container";
import { InlineSearch } from "@/components/search/command-search";

export default function NotFound() {
  return (
    <Container className="flex flex-col items-center py-24 text-center">
      <p className="font-mono text-sm text-fg-subtle">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">Page not found</h1>
      <p className="mt-3 text-fg-muted">The page you are looking for does not exist. Try searching for a tool instead.</p>
      <div className="mt-8 w-full max-w-md">
        <InlineSearch />
      </div>
      <Link href="/" className="mt-6 text-sm text-fg-muted underline underline-offset-4 hover:text-fg">
        Back to home
      </Link>
    </Container>
  );
}
