// DNS MX record checker — verifies a domain can receive email.
// Uses Node.js built-in dns.promises module. No external API needed.

import { resolveMx, resolve4 } from "node:dns/promises";
import type { Tool } from "../core/types.js";

export const checkMxTool: Tool = {
  name: "check_mx",
  description:
    "Check if a domain has valid MX (mail exchange) records, meaning it can receive email. Returns MX hosts, priorities, and a validation status. Use this to verify business email domains before outreach.",
  input_schema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        description: "The domain to check MX records for (e.g. 'example.com')",
      },
    },
    required: ["domain"],
  },
  async execute(input: Record<string, unknown>) {
    const domain = (input.domain as string).replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();

    try {
      // Check MX records
      let mxRecords: Array<{ exchange: string; priority: number }>;
      try {
        const records = await resolveMx(domain);
        mxRecords = records
          .map((r) => ({ exchange: r.exchange.toLowerCase(), priority: r.priority }))
          .sort((a, b) => a.priority - b.priority);
      } catch {
        mxRecords = [];
      }

      // If no MX records, check if domain resolves (fallback A record for mail)
      let hasARecord = false;
      if (mxRecords.length === 0) {
        try {
          const aRecords = await resolve4(domain);
          hasARecord = aRecords.length > 0;
        } catch {
          hasARecord = false;
        }
      }

      const canReceiveEmail = mxRecords.length > 0 || hasARecord;
      const status = mxRecords.length > 0 ? "valid" : hasARecord ? "fallback" : "invalid";

      return JSON.stringify({
        domain,
        status,
        canReceiveEmail,
        mxRecords,
        note: mxRecords.length === 0 && hasARecord
          ? "No MX records found but domain has A record. Some mailers use A record as fallback."
          : mxRecords.length === 0
            ? "No MX or A records found. This domain cannot receive email."
            : undefined,
      });
    } catch (err) {
      return JSON.stringify({
        domain,
        status: "error",
        canReceiveEmail: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
