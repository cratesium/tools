import { getSearchIndex } from "@/lib/tools/registry";

export const dynamic = "force-static";

/** Static, cacheable search index used by the client-side search. */
export function GET() {
  return Response.json(getSearchIndex());
}
