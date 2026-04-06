// Detect third-party integrations — payment, booking, analytics, CRM, marketing
import * as cheerio from "cheerio";
import type { Tool } from "../core/types.js";

interface Integration {
  category: string;
  name: string;
  detected: boolean;
  evidence: string;
}

export const detectIntegrationsTool: Tool = {
  name: "detect_integrations",
  description:
    "Detect third-party integrations on a webpage: payment providers, booking systems, analytics, CRM, marketing tools, live chat, CDN, and CMS. Returns integration landscape and gaps.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The webpage URL to detect integrations on" },
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
      const scripts = $("script[src]").map((_, el) => $(el).attr("src") || "").get();
      const allScriptSrc = scripts.join(" ");
      const inlineScripts = $("script:not([src])").map((_, el) => $(el).html() || "").get().join(" ");
      const fullHtml = html;
      const allScriptContent = allScriptSrc + " " + inlineScripts;

      const integrations: Integration[] = [];

      // Payment providers
      const paymentPatterns: Array<{ name: string; pattern: RegExp }> = [
        { name: "Stripe", pattern: /stripe\.com|js\.stripe\.com|Stripe\(/i },
        { name: "PayPal", pattern: /paypal\.com|paypalobjects\.com|paypal\.js/i },
        { name: "Mollie", pattern: /mollie\.com|mollie\.js/i },
        { name: "Adyen", pattern: /adyen\.com|checkoutshopper-live/i },
        { name: "Square", pattern: /squarecdn\.com|squareup\.com/i },
        { name: "iDEAL", pattern: /ideal|ideal-betaling|ideal\.js/i },
        { name: "Klarna", pattern: /klarna\.com|klarnacdn\.net/i },
        { name: "Buckaroo", pattern: /buckaroo\.nl|buckaroo\-payment/i },
      ];
      for (const p of paymentPatterns) {
        const found = p.pattern.test(fullHtml);
        integrations.push({ category: "payment", name: p.name, detected: found, evidence: found ? "detected in page source" : "" });
      }

      // Booking / scheduling
      const bookingPatterns: Array<{ name: string; pattern: RegExp }> = [
        { name: "Calendly", pattern: /calendly\.com|calendly-widget/i },
        { name: "Acuity Scheduling", pattern: /acuityscheduling\.com/i },
        { name: "Bookings/Caldera", pattern: /caldera\.app|bookings\.microsoft/i },
        { name: "Resdiary", pattern: /resdiary\.com/i },
        { name: "Tablein", pattern: /tablein\.com/i },
        { name: "Planway", pattern: /planway\.com/i },
        { name: "Vev", pattern: /vev\.design/i },
        { name: "Squired", pattern: /squired\.app/i },
      ];
      for (const p of bookingPatterns) {
        const found = p.pattern.test(fullHtml);
        integrations.push({ category: "booking", name: p.name, detected: found, evidence: found ? "detected in page source" : "" });
      }

      // Analytics & tracking
      const analyticsPatterns: Array<{ name: string; pattern: RegExp }> = [
        { name: "Google Analytics", pattern: /google-analytics\.com|gtag\(|googletagmanager\.com/i },
        { name: "Google Tag Manager", pattern: /googletagmanager\.com\/gtm/i },
        { name: "Facebook Pixel", pattern: /connect\.facebook\.net.*fbevents/i },
        { name: "Hotjar", pattern: /static\.hotjar\.com/i },
        { name: "Clarity", pattern: /clarity\.ms/i },
        { name: "Matomo", pattern: /matomo\.php|piwik\.js|matomo\.js/i },
        { name: "Plausible", pattern: /plausible\.io/i },
        { name: "Fathom", pattern: /cdn\.usefathom\.com/i },
      ];
      for (const p of analyticsPatterns) {
        const found = p.pattern.test(fullHtml);
        integrations.push({ category: "analytics", name: p.name, detected: found, evidence: found ? "detected in page source" : "" });
      }

      // Live chat
      const chatPatterns: Array<{ name: string; pattern: RegExp }> = [
        { name: "Intercom", pattern: /intercom\.io|intercomcdn\.com/i },
        { name: "Zendesk Chat", pattern: /zendesk|zopim\.com/i },
        { name: "Tawk.to", pattern: /tawk\.to|tawkto/i },
        { name: "Crisp", pattern: /crisp\.chat|go.crisp\.im/i },
        { name: "WhatsApp Chat", pattern: /wa\.me|whatsapp\.com\/widget|whatsapp-button/i },
        { name: "LiveChat", pattern: /livechatinc\.com|livechat\.com/i },
        { name: "Tidio", pattern: /tidiochat\.com|tidio\.co/i },
        { name: "Userlike", pattern: /userlike\.com/i },
      ];
      for (const p of chatPatterns) {
        const found = p.pattern.test(fullHtml);
        integrations.push({ category: "chat", name: p.name, detected: found, evidence: found ? "detected in page source" : "" });
      }

      // CMS detection
      const cmsPatterns: Array<{ name: string; pattern: RegExp }> = [
        { name: "WordPress", pattern: /wp-content|wp-includes|wordpress/i },
        { name: "Shopify", pattern: /shopify\.com|cdn\.shopify|myshopify/i },
        { name: "Wix", pattern: /wix\.com|wixpress|wix-code/i },
        { name: "Squarespace", pattern: /squarespace\.com|static1\.squarespace/i },
        { name: "Joomla", pattern: /\/components\/|joomla|<meta name="generator" content="Joomla/i },
        { name: "Drupal", pattern: /drupal|sites\/default\/files/i },
        { name: "Webflow", pattern: /webflow\.com|webflow\.css/i },
        { name: "Next.js", pattern: /_next\/static|__NEXT_DATA__/i },
        { name: "Craft CMS", pattern: /craft\.cms|craftcms/i },
        { name: "Ghost", pattern: /ghost\.org|ghost-\//i },
      ];
      for (const p of cmsPatterns) {
        const found = p.pattern.test(fullHtml);
        integrations.push({ category: "cms", name: p.name, detected: found, evidence: found ? "detected in page source" : "" });
      }

      // CDN
      const cdnPatterns: Array<{ name: string; pattern: RegExp }> = [
        { name: "Cloudflare", pattern: /cdn\.cloudflare|cloudflare.*beacon/i },
        { name: "Fastly", pattern: /fastly\.net|fastly-insights/i },
        { name: "AWS CloudFront", pattern: /cloudfront\.net/i },
        { name: "jsDelivr", pattern: /cdn\.jsdelivr\.net/i },
        { name: "unpkg", pattern: /unpkg\.com/i },
      ];
      for (const p of cdnPatterns) {
        const found = p.pattern.test(fullHtml);
        integrations.push({ category: "cdn", name: p.name, detected: found, evidence: found ? "detected in page source" : "" });
      }

      const detected = integrations.filter((i) => i.detected);
      const byCategory = (cat: string) => detected.filter((i) => i.category === cat).map((i) => i.name);

      return JSON.stringify({
        url,
        totalDetected: detected.length,
        categories: {
          payment: byCategory("payment"),
          booking: byCategory("booking"),
          analytics: byCategory("analytics"),
          chat: byCategory("chat"),
          cms: byCategory("cms"),
          cdn: byCategory("cdn"),
        },
        allDetected: detected.map((i) => ({ category: i.category, name: i.name })),
        gaps: {
          noPayment: byCategory("payment").length === 0,
          noBooking: byCategory("booking").length === 0,
          noAnalytics: byCategory("analytics").length === 0,
          noChat: byCategory("chat").length === 0,
        },
        recommendation:
          byCategory("analytics").length === 0
            ? "No analytics detected — add Google Analytics or similar"
            : byCategory("chat").length === 0 && byCategory("booking").length === 0
              ? "Consider adding live chat and/or online booking"
              : byCategory("payment").length === 0
                ? "No payment integration detected — relevant for e-commerce"
                : "Good integration landscape",
      });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  },
};
