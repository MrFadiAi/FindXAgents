// Analyze forms and CTAs — maps contact friction, conversion paths, and user journey
import * as cheerio from "cheerio";
import type { Tool } from "../core/types.js";

interface FormAnalysis {
  selector: string;
  action: string;
  method: string;
  fieldCount: number;
  fields: string[];
  hasNameField: boolean;
  hasEmailField: boolean;
  hasPhoneField: boolean;
  hasMessageField: boolean;
  hasSubmitButton: boolean;
  frictionScore: number; // 1=low, 5=high
}

interface CtaAnalysis {
  text: string;
  type: string;
  location: string;
  isPrimary: boolean;
  url: string;
}

export const analyzeFormsCtaTool: Tool = {
  name: "analyze_forms_cta",
  description:
    "Analyze all forms and call-to-action buttons on a webpage. Detects form fields, friction points, CTA placement, and conversion path quality. Returns friction scores and CTA effectiveness assessment.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The webpage URL to analyze forms and CTAs on" },
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

      // Analyze forms
      const forms: FormAnalysis[] = [];
      $("form").each((i, el) => {
        const fields: string[] = [];
        let hasName = false;
        let hasEmail = false;
        let hasPhone = false;
        let hasMessage = false;

        $(el).find("input, textarea, select").each((_, field) => {
          const type = $(field).attr("type") || $(field).prop("tagName")?.toLowerCase() || "text";
          const name = $(field).attr("name") || $(field).attr("id") || type;
          fields.push(name);

          if (/name|naam|voornaam|achternaam/i.test(name)) hasName = true;
          if (/email|e-mail|mail/i.test(name)) hasEmail = true;
          if (/phone|tel|telefoon|mobiel/i.test(name)) hasPhone = true;
          if (/message|bericht|comment|body|question/i.test(name)) hasMessage = true;
        });

        const hasSubmit = $(el).find('button[type="submit"], input[type="submit"]').length > 0;

        // Friction score: more fields = higher friction
        let frictionScore = 1;
        if (fields.length >= 8) frictionScore = 5;
        else if (fields.length >= 5) frictionScore = 4;
        else if (fields.length >= 4) frictionScore = 3;
        else if (fields.length >= 3) frictionScore = 2;

        forms.push({
          selector: `form:eq(${i})`,
          action: $(el).attr("action") || "",
          method: ($(el).attr("method") || "GET").toUpperCase(),
          fieldCount: fields.length,
          fields: fields.slice(0, 15),
          hasNameField: hasName,
          hasEmailField: hasEmail,
          hasPhoneField: hasPhone,
          hasMessageField: hasMessage,
          hasSubmitButton: hasSubmit,
          frictionScore,
        });
      });

      // Analyze CTAs
      const ctas: CtaAnalysis[] = [];
      const ctaPatterns = /contact|book|order|buy|subscribe|sign.up|register|get.started|request|quote|offer|appointment|haal.started|offerte|afspraak|bestel/i;

      $("a, button").each((_, el) => {
        const text = $(el).text().trim();
        const href = $(el).attr("href") || "";
        if (!text || text.length > 50) return;

        const isCta = ctaPatterns.test(text);
        if (!isCta && !/^\+?\d[\s-]?\d/.test(text) && text.length < 15) {
          // Likely a phone number CTA
          if (href.startsWith("tel:")) {
            ctas.push({ text, type: "phone", location: "link", isPrimary: false, url: href });
          }
          return;
        }
        if (!isCta) return;

        const isPrimary =
          $(el).filter('button, a[class*="btn"], a[class*="button"], a[class*="cta"]').length > 0 ||
          /btn|button|cta|primary|action/i.test($(el).attr("class") || "");

        // Check if above the fold (rough heuristic: first 2000px)
        ctas.push({
          text: text.slice(0, 50),
          type: isPrimary ? "primary" : "secondary",
          location: href || "button",
          isPrimary,
          url: href,
        });
      });

      // Phone number visibility
      const phoneLinks = $('a[href^="tel:"]');
      const visiblePhones = phoneLinks.map((_, el) => $(el).text().trim()).get();

      // Summary assessment
      const hasForm = forms.length > 0;
      const lowestFriction = forms.length > 0 ? Math.min(...forms.map((f) => f.frictionScore)) : 0;
      const hasPrimaryCta = ctas.some((c) => c.isPrimary);
      const phoneVisible = visiblePhones.length > 0;

      return JSON.stringify({
        url,
        forms: {
          total: forms.length,
          analysis: forms,
          lowestFrictionScore: lowestFriction || 0,
          hasContactForm: forms.some((f) => f.hasEmailField || f.hasMessageField),
        },
        ctas: {
          total: ctas.length,
          primaryCtas: ctas.filter((c) => c.isPrimary),
          secondaryCtas: ctas.filter((c) => !c.isPrimary),
        },
        phoneVisible,
        phoneNumbers: visiblePhones.slice(0, 5),
        assessment: {
          hasContactForm,
          hasPrimaryCta,
          phoneVisible,
          conversionFriction: !hasForm && !hasPrimaryCta ? "high" : lowestFriction >= 4 ? "high" : lowestFriction >= 3 ? "medium" : "low",
          recommendation: !hasForm && !hasPrimaryCta
            ? "No visible conversion path — add a contact form or CTA"
            : lowestFriction >= 4
              ? "Form has too many fields — reduce to 3-4 for better conversion"
              : !hasPrimaryCta
                ? "Add a prominent primary CTA button"
                : "Good conversion setup",
        },
      });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
};
