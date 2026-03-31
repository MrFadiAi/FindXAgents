// Domain age checker — uses DNS lookup and RDAP to determine domain registration age
// Uses Node.js built-in dns module and free RDAP API. No API key needed.

import * as dns from "node:dns/promises";
import type { Tool } from "../core/types.js";

export const domainAgeCheckTool: Tool = {
  name: "domain_age_check",
  description:
    "Check how old a domain is by looking up its registration date via RDAP and verifying DNS records. Returns the domain's age in years, registration date, registrar, and status. Use this to assess domain credibility and business longevity.",
  input_schema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        description: "The domain to check (e.g. 'example.com')",
      },
    },
    required: ["domain"],
  },
  async execute(input) {
    const domain = (input.domain as string).replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

    let exists = false;
    let registrationDate: string | undefined;
    let ageInYears: number | undefined;
    let registrar: string | undefined;
    let status: string | undefined;

    // Step 1: DNS check
    try {
      await dns.resolveNs(domain);
      exists = true;
    } catch {
      // Try SOA as fallback
      try {
        await dns.resolveSoa(domain);
        exists = true;
      } catch {
        exists = false;
      }
    }

    // Step 2: RDAP lookup for registration data
    try {
      const rdapResponse = await fetch(`https://rdap.org/domain/${domain}`, {
        headers: { Accept: "application/rdap+json" },
        signal: AbortSignal.timeout(10000),
      });

      if (rdapResponse.ok) {
        const data = (await rdapResponse.json()) as {
          events?: Array<{ eventAction: string; eventDate: string }>;
          entities?: Array<{
            roles?: string[];
            vcardArray?: unknown[];
          }>;
          status?: string[];
        };

        // Find registration event
        const registrationEvent = data.events?.find(
          (e) => e.eventAction === "registration"
        );
        if (registrationEvent) {
          registrationDate = registrationEvent.eventDate;
          const regDate = new Date(registrationDate);
          const now = new Date();
          ageInYears = Math.round(
            (now.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25) * 10
          ) / 10;
        }

        // Extract registrar name
        const registrarEntity = data.entities?.find(
          (e) => e.roles?.includes("registrar")
        );
        if (registrarEntity?.vcardArray && Array.isArray(registrarEntity.vcardArray[1])) {
          const fnEntry = (registrarEntity.vcardArray[1] as unknown[]).find(
            (item) => Array.isArray(item) && item[0] === "fn"
          );
          if (Array.isArray(fnEntry) && fnEntry.length >= 4) {
            registrar = fnEntry[3] as string;
          }
        }

        status = data.status?.join(", ");
      }
    } catch {
      // RDAP lookup failed — return partial results
    }

    return JSON.stringify({
      domain,
      exists,
      registrationDate: registrationDate ?? null,
      ageInYears: ageInYears ?? null,
      registrar: registrar ?? null,
      status: status ?? null,
    });
  },
};
