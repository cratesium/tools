/// <reference lib="webworker" />
/**
 * Runs user regular expressions off the main thread. If a pattern backtracks
 * catastrophically, the page terminates this worker after a timeout instead of freezing.
 */
import { runRegex, type RegexWorkerRequest, type RegexWorkerResponse } from "@/lib/processors/developer/regex";

self.onmessage = (e: MessageEvent<RegexWorkerRequest>) => {
  const { id, pattern, flags, text, replacement } = e.data;
  const response: RegexWorkerResponse = { id, result: runRegex(pattern, flags, text, replacement) };
  (self as unknown as Worker).postMessage(response);
};

export {};
