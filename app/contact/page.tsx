import type { Metadata } from "next";
import { StaticPage } from "@/components/layout/static-page";
import { absoluteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Report a bug, request a tool or ask a question about UtilityHub.",
  alternates: { canonical: absoluteUrl("/contact") },
};

export default function Contact() {
  return (
    <StaticPage title="Contact">
      <p>We read every message. The fastest way to reach the team is through the project&apos;s GitHub repository:</p>
      <ul>
        <li>
          <strong>Bug reports and tool requests:</strong>{" "}
          <a href="https://github.com/cratesium/tools/issues" rel="noopener noreferrer">open an issue on GitHub</a>. Please include the tool name, your browser
          and, if possible, a sample file that reproduces the problem (never share confidential files).
        </li>
        <li>
          <strong>Security issues:</strong> please report privately via GitHub&apos;s security advisory feature on the repository rather than a public issue.
        </li>
      </ul>
      <p>
        UtilityHub does not offer account-based support, because there are no accounts. We never ask for your files by email.
      </p>
    </StaticPage>
  );
}
