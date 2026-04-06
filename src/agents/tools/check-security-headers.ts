// Security header auditor — CSP, HSTS, X-Frame-Options, permissions policy, etc.
import type { Tool } from "../core/types.js";

interface SecurityHeader {
  header: string;
  present: boolean;
  value: string;
  status: "good" | "warning" | "missing";
  description: string;
}

export const checkSecurityHeadersTool: Tool = {
  name: "check_security_headers",
  description:
    "Audit HTTP security headers of a webpage. Checks Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and more. Returns security score.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The webpage URL to audit security headers" },
    },
    required: ["url"],
  },
  async execute(input: Record<string, unknown>) {
    const url = input.url as string;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });
      if (!response.ok) {
        return JSON.stringify({ error: `Failed to fetch: ${response.status}` });
      }

      const headers: SecurityHeader[] = [];

      // Content-Security-Policy
      const csp = response.headers.get("content-security-policy") || "";
      headers.push({
        header: "Content-Security-Policy",
        present: !!csp,
        value: csp.slice(0, 200),
        status: csp ? "good" : "missing",
        description: csp ? "CSP header present" : "No CSP — vulnerable to XSS attacks",
      });

      // Strict-Transport-Security (HSTS)
      const hsts = response.headers.get("strict-transport-security") || "";
      headers.push({
        header: "Strict-Transport-Security",
        present: !!hsts,
        value: hsts,
        status: hsts ? "good" : "warning",
        description: hsts ? "HSTS enabled" : "No HSTS — consider adding for HTTPS enforcement",
      });

      // X-Frame-Options
      const xfo = response.headers.get("x-frame-options") || "";
      headers.push({
        header: "X-Frame-Options",
        present: !!xfo,
        value: xfo,
        status: xfo ? "good" : "warning",
        description: xfo ? "Clickjacking protection enabled" : "No X-Frame-Options — vulnerable to clickjacking",
      });

      // X-Content-Type-Options
      const xcto = response.headers.get("x-content-type-options") || "";
      headers.push({
        header: "X-Content-Type-Options",
        present: !!xcto,
        value: xcto,
        status: xcto === "nosniff" ? "good" : "missing",
        description: xcto === "nosniff" ? "MIME-type sniffing prevented" : "No nosniff — browser may MIME-sniff responses",
      });

      // Referrer-Policy
      const rp = response.headers.get("referrer-policy") || "";
      headers.push({
        header: "Referrer-Policy",
        present: !!rp,
        value: rp,
        status: rp ? "good" : "warning",
        description: rp ? `Referrer policy: ${rp}` : "No Referrer-Policy — may leak referrer data",
      });

      // Permissions-Policy
      const pp = response.headers.get("permissions-policy") || "";
      headers.push({
        header: "Permissions-Policy",
        present: !!pp,
        value: pp.slice(0, 200),
        status: pp ? "good" : "warning",
        description: pp ? "Feature permissions restricted" : "No Permissions-Policy — browser features unrestricted",
      });

      // X-XSS-Protection (deprecated but still worth checking)
      const xxss = response.headers.get("x-xss-protection") || "";
      headers.push({
        header: "X-XSS-Protection",
        present: !!xxss,
        value: xxss,
        status: xxss ? "info" : "info",
        description: xxss ? "XSS filter header present (deprecated, use CSP instead)" : "Not set (deprecated header, CSP preferred)",
      });

      // Server header (info leakage)
      const server = response.headers.get("server") || "";
      headers.push({
        header: "Server",
        present: !!server,
        value: server,
        status: server ? "warning" : "good",
        description: server ? `Server info exposed: ${server}` : "Server header hidden — good",
      });

      // X-Powered-By (info leakage)
      const xpb = response.headers.get("x-powered-by") || "";
      headers.push({
        header: "X-Powered-By",
        present: !!xpb,
        value: xpb,
        status: xpb ? "warning" : "good",
        description: xpb ? `Technology exposed: ${xpb}` : "X-Powered-By hidden — good",
      });

      // Calculate score
      const good = headers.filter((h) => h.status === "good").length;
      const missing = headers.filter((h) => h.status === "missing").length;
      const warnings = headers.filter((h) => h.status === "warning").length;
      const securityScore = Math.max(0, Math.min(100, (good / headers.length) * 100));

      return JSON.stringify({
        url,
        securityScore: Math.round(securityScore),
        https: url.startsWith("https://"),
        headers,
        summary: { good, missing, warnings, total: headers.length },
        criticalMissing: headers.filter((h) => h.status === "missing").map((h) => h.header),
        recommendation:
          missing >= 3
            ? `${missing} critical security headers missing — prioritize CSP, HSTS, X-Frame-Options`
            : warnings >= 3
              ? `${warnings} security headers recommended — add for better protection`
              : "Security headers look adequate",
      });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
};
