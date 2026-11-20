import type { Metadata } from "next";
import { StaticPage } from "@/components/layout/static-page";
import { absoluteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms that apply when you use UtilityHub's free online tools.",
  alternates: { canonical: absoluteUrl("/terms") },
};

export default function Terms() {
  return (
    <StaticPage title="Terms of Use" updated="21 November 2026">
      <p>By using UtilityHub you agree to these terms. If you do not agree, please do not use the site.</p>
      <h2>Use of the tools</h2>
      <p>
        UtilityHub tools are provided free of charge, &ldquo;as is&rdquo;, without warranty of any kind. You are responsible for the files and data you
        process and for having the right to process them. Keep a copy of important originals – conversions can lose information, and some tools are
        documented as having limitations.
      </p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use the server-backed web tools to scan, overload or attack systems you do not own or have permission to test.</li>
        <li>Do not use the URL shortener to distribute malware, phishing or illegal content. Such links may be removed without notice.</li>
        <li>Do not attempt to circumvent rate limits or abuse protections.</li>
      </ul>
      <h2>Calculations</h2>
      <p>
        Calculators such as income tax, GST, EMI and BMI provide estimates for general information only and are not financial, tax or medical advice.
      </p>
      <h2>Liability</h2>
      <p>
        To the maximum extent permitted by law, UtilityHub and its contributors are not liable for any loss or damage arising from use of the site.
      </p>
      <h2>Changes</h2>
      <p>We may update these terms. Continued use after changes means you accept the revised terms.</p>
    </StaticPage>
  );
}
