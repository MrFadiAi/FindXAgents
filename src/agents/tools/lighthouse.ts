import type { Tool } from "../core/types.js";

export const runLighthouseTool: Tool = {
  name: "run_lighthouse",
  description:
    "Run a Lighthouse audit on a website URL. Returns performance, accessibility, SEO, and best practices scores with detailed findings. Takes 10-30 seconds.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The website URL to audit",
      },
    },
    required: ["url"],
  },
  async execute(input: Record<string, unknown>) {
    const url = input.url as string;

    // Lighthouse's internal performance.measure() can throw from timers on
    // Node.js 22+.  Suppress these uncaught exceptions during the audit.
    const suppressed: Error[] = [];
    let fatalError: Error | null = null;
    const handler = (err: Error) => {
      if (err.message?.includes("performance mark has not been set")) {
        suppressed.push(err);
      } else {
        fatalError = err;
      }
    };
    process.on("uncaughtException", handler);

    try {
      // Dynamic import to avoid ESM import.meta.url issues at module load
      const { runLighthouseAudit } = await import(
        "../../modules/analyzer/audits/lighthouse.js"
      );
      const result = await runLighthouseAudit(url);

      if (fatalError) {
        return JSON.stringify({
          error: fatalError.message,
        });
      }

      return JSON.stringify({
        categories: result.categories,
        findings: result.findings.slice(0, 20),
      });
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      process.off("uncaughtException", handler);
    }
  },
};
