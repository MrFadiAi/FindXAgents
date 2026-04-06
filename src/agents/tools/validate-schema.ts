// Schema.org / structured data validator — validates JSON-LD, checks required fields
import * as cheerio from "cheerio";
import type { Tool } from "../core/types.js";

interface SchemaValidation {
  type: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  completeness: number; // 0-100
}

const REQUIRED_FIELDS: Record<string, string[]> = {
  LocalBusiness: ["name", "address"],
  Restaurant: ["name", "address", "servesCuisine"],
  Product: ["name", "offers"],
  Article: ["headline", "author", "datePublished"],
  FAQPage: ["mainEntity"],
  BreadcrumbList: ["itemListElement"],
  Organization: ["name", "url"],
  Person: ["name"],
  Event: ["name", "startDate", "location"],
  Service: ["name", "provider"],
  HowTo: ["name", "step"],
  VideoObject: ["name", "description", "thumbnailUrl"],
};

const RECOMMENDED_FIELDS: Record<string, string[]> = {
  LocalBusiness: ["telephone", "url", "image", "openingHours", "priceRange", "geo"],
  Restaurant: ["telephone", "url", "image", "menu", "acceptsReservations", "priceRange"],
  Product: ["description", "image", "brand", "aggregateRating", "review"],
  Article: ["image", "publisher", "description", "mainEntityOfPage"],
  Organization: ["logo", "contactPoint", "sameAs", "address"],
  Service: ["description", "areaServed", "url"],
};

export const validateSchemaTool: Tool = {
  name: "validate_schema",
  description:
    "Validate Schema.org structured data on a webpage. Checks JSON-LD blocks for required fields, type correctness, and completeness. Returns validation results per schema type.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The webpage URL to validate structured data" },
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
      const html = await response.text();
      const $ = cheerio.load(html);

      const validations: SchemaValidation[] = [];
      const allSchemas: Record<string, unknown>[] = [];

      // Parse JSON-LD blocks
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const raw = $(el).html();
          if (!raw) return;
          const data = JSON.parse(raw);
          if (data["@graph"] && Array.isArray(data["@graph"])) {
            allSchemas.push(...data["@graph"]);
          } else {
            allSchemas.push(data);
          }
        } catch {
          validations.push({
            type: "invalid-json",
            valid: false,
            errors: ["Failed to parse JSON-LD block"],
            warnings: [],
            completeness: 0,
          });
        }
      });

      // Validate each schema
      for (const schema of allSchemas) {
        const type = (schema["@type"] as string) || "unknown";
        const types = Array.isArray(type) ? type : [type];

        for (const t of types) {
          const errors: string[] = [];
          const warnings: string[] = [];

          const required = REQUIRED_FIELDS[t] || [];
          const recommended = RECOMMENDED_FIELDS[t] || [];

          // Check required fields
          for (const field of required) {
            if (!schema[field]) {
              errors.push(`Missing required field: ${field}`);
            }
          }

          // Check recommended fields
          for (const field of recommended) {
            if (!schema[field]) {
              warnings.push(`Missing recommended field: ${field}`);
            }
          }

          // Check for @context
          if (!schema["@context"]) {
            warnings.push("Missing @context (should be https://schema.org)");
          } else if (!(schema["@context"] as string).includes("schema.org")) {
            warnings.push(`Unexpected @context: ${schema["@context"]}`);
          }

          // Check address structure for local business types
          if (t === "LocalBusiness" || t === "Restaurant") {
            const addr = schema.address as Record<string, string> | undefined;
            if (addr && typeof addr === "object") {
              if (!addr.streetAddress) warnings.push("Address missing streetAddress");
              if (!addr.addressLocality) warnings.push("Address missing addressLocality");
              if (!addr.postalCode) warnings.push("Address missing postalCode");
            } else if (schema.address && typeof schema.address === "string") {
              // String address is OK
            }
          }

          // Check offers for Product
          if (t === "Product" && schema.offers) {
            const offers = schema.offers as Record<string, unknown>;
            if (!offers.price && !offers.lowPrice) {
              errors.push("Product offers missing price");
            }
            if (!offers.priceCurrency) {
              warnings.push("Product offers missing priceCurrency");
            }
          }

          // Calculate completeness
          const totalFields = required.length + recommended.length;
          const presentFields = required.filter((f) => !!schema[f]).length + recommended.filter((f) => !!schema[f]).length;
          const completeness = totalFields > 0 ? Math.round((presentFields / totalFields) * 100) : 100;

          validations.push({
            type: t,
            valid: errors.length === 0,
            errors,
            warnings,
            completeness,
          });
        }
      }

      const validCount = validations.filter((v) => v.valid).length;
      const totalCount = validations.length;
      const avgCompleteness = totalCount > 0
        ? Math.round(validations.reduce((sum, v) => sum + v.completeness, 0) / totalCount)
        : 0;

      return JSON.stringify({
        url,
        totalSchemas: totalCount,
        validSchemas: validCount,
        averageCompleteness: avgCompleteness,
        hasLocalBusiness: validations.some((v) => v.type === "LocalBusiness" || v.type === "Restaurant"),
        validations,
        recommendation:
          totalCount === 0
            ? "No structured data found — add JSON-LD for better SEO"
            : validCount < totalCount
              ? `${totalCount - validCount} schema(s) have validation errors — fix for rich results`
              : avgCompleteness < 70
                ? "Schemas are valid but incomplete — add recommended fields"
                : "Structured data looks good",
      });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
};
