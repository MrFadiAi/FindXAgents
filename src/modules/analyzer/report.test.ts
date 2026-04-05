import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AnalysisResult } from "./types.js";

// This will hold the latest mockDoc so tests can access it
let mockDocInstance: any;

vi.mock("pdfkit", () => {
  // Each call to PDFDocument() creates a fresh mock with its own listeners
  const MockPDFDocument = vi.fn(() => {
    const listeners: Record<string, Function[]> = {};

    const doc = {
      on: vi.fn((event: string, handler: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      }),
      emit: vi.fn((event: string, ...args: any[]) => {
        (listeners[event] || []).forEach((fn) => fn(...args));
      }),
      fontSize: vi.fn(function (this: any) {
        return this;
      }),
      fillColor: vi.fn(function (this: any) {
        return this;
      }),
      text: vi.fn(function (this: any) {
        return this;
      }),
      moveDown: vi.fn(function (this: any) {
        return this;
      }),
      moveTo: vi.fn(function (this: any) {
        return this;
      }),
      lineTo: vi.fn(function (this: any) {
        return this;
      }),
      strokeColor: vi.fn(function (this: any) {
        return this;
      }),
      lineWidth: vi.fn(function (this: any) {
        return this;
      }),
      stroke: vi.fn(function (this: any) {
        return this;
      }),
      end: vi.fn(() => {
        doc.emit("end");
      }),
      y: 100,
    };

    // Store reference so tests can access it
    mockDocInstance = doc;
    return doc;
  });

  return { default: MockPDFDocument };
});

vi.mock("./audits/scoring.js", () => ({
  scoreLabel: vi.fn((score: number) => {
    if (score >= 90) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 50) return "Average";
    if (score >= 30) return "Poor";
    return "Critical";
  }),
}));

import { generatePdfReport } from "./report.js";
import PDFDocument from "pdfkit";
import { scoreLabel } from "./audits/scoring.js";

function createMockResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    url: "https://example.com",
    analyzedAt: "2024-06-15T12:00:00Z",
    overallScore: 75,
    categories: [
      { name: "performance", score: 80 },
      { name: "accessibility", score: 65 },
    ],
    findings: [
      { severity: "critical", title: "Missing meta description", value: null },
      { severity: "warning", title: "Large image detected", value: "2.4MB" },
      { severity: "info", title: "HTTPS enabled", value: null },
    ],
    opportunities: [
      {
        title: "Compress images",
        description: "Use WebP format for smaller file sizes",
        impact: "high",
        effort: "low",
      },
      {
        title: "Add alt text",
        description: "Add alt attributes to all images",
        impact: "medium",
        effort: "low",
      },
    ],
    ...overrides,
  };
}

describe("generatePdfReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a PDFDocument with A4 size and correct margins", async () => {
    const result = createMockResult();
    const promise = generatePdfReport(result);

    expect(PDFDocument).toHaveBeenCalledWith({
      size: "A4",
      margins: { top: 60, bottom: 60, left: 50, right: 50 },
    });

    mockDocInstance.end();
    await promise;
  });

  it("should resolve with a Buffer containing concatenated chunks", async () => {
    // The source calls doc.end() synchronously inside generatePdfReport,
    // which triggers emit("end") and resolves the promise immediately.
    // We use mockImplementationOnce to create a doc whose end() is a no-op,
    // so we can emit data chunks before triggering the "end" event ourselves.
    (PDFDocument as any).mockImplementationOnce(() => {
      const listeners: Record<string, Function[]> = {};
      const doc = {
        on: vi.fn((event: string, handler: Function) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(handler);
        }),
        emit: vi.fn((event: string, ...args: any[]) => {
          (listeners[event] || []).forEach((fn) => fn(...args));
        }),
        fontSize: vi.fn(function (this: any) { return this; }),
        fillColor: vi.fn(function (this: any) { return this; }),
        text: vi.fn(function (this: any) { return this; }),
        moveDown: vi.fn(function (this: any) { return this; }),
        moveTo: vi.fn(function (this: any) { return this; }),
        lineTo: vi.fn(function (this: any) { return this; }),
        strokeColor: vi.fn(function (this: any) { return this; }),
        lineWidth: vi.fn(function (this: any) { return this; }),
        stroke: vi.fn(function (this: any) { return this; }),
        end: vi.fn(() => {
          // no-op: don't emit "end" yet
        }),
        y: 100,
      };
      mockDocInstance = doc;
      return doc;
    });

    const result = createMockResult();
    const promise = generatePdfReport(result);

    const chunk1 = Buffer.from("chunk1");
    const chunk2 = Buffer.from("chunk2");
    mockDocInstance.emit("data", chunk1);
    mockDocInstance.emit("data", chunk2);
    // Now manually emit "end" to resolve the promise
    mockDocInstance.emit("end");

    const output = await promise;
    expect(output).toBeInstanceOf(Buffer);
    expect(output.toString()).toBe("chunk1chunk2");
  });

  it("should reject when the document emits an error", async () => {
    const result = createMockResult();
    // The source calls doc.end() synchronously inside generatePdfReport.
    // We must override end BEFORE generatePdfReport runs. Since the mock
    // factory sets mockDocInstance when PDFDocument is called, we can
    // override end via the factory's mockImplementation for this test.
    const OrigFactory = PDFDocument as any;
    OrigFactory.mockImplementationOnce(() => {
      const listeners: Record<string, Function[]> = {};
      const doc = {
        on: vi.fn((event: string, handler: Function) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(handler);
        }),
        emit: vi.fn((event: string, ...args: any[]) => {
          (listeners[event] || []).forEach((fn) => fn(...args));
        }),
        fontSize: vi.fn(function (this: any) { return this; }),
        fillColor: vi.fn(function (this: any) { return this; }),
        text: vi.fn(function (this: any) { return this; }),
        moveDown: vi.fn(function (this: any) { return this; }),
        moveTo: vi.fn(function (this: any) { return this; }),
        lineTo: vi.fn(function (this: any) { return this; }),
        strokeColor: vi.fn(function (this: any) { return this; }),
        lineWidth: vi.fn(function (this: any) { return this; }),
        stroke: vi.fn(function (this: any) { return this; }),
        end: vi.fn(() => {
          doc.emit("error", new Error("PDF generation failed"));
        }),
        y: 100,
      };
      mockDocInstance = doc;
      return doc;
    });

    const promise = generatePdfReport(result);

    await expect(promise).rejects.toThrow("PDF generation failed");
  });

  it("should write the FindX header and subtitle", async () => {
    const result = createMockResult();
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("FindX");
    expect(textCalls).toContain("Website Analysis Report");
  });

  it("should write business name when provided", async () => {
    const result = createMockResult();
    const promise = generatePdfReport(result, "Acme Corp");
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("Acme Corp");
  });

  it("should not write business name when not provided", async () => {
    const result = createMockResult();
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).not.toContain("undefined");
  });

  it("should write the analyzed URL and formatted date", async () => {
    const result = createMockResult({ analyzedAt: "2024-06-15T12:00:00Z" });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain(`URL: ${result.url}`);

    const expectedDate = new Date("2024-06-15T12:00:00Z").toLocaleDateString("nl-NL");
    expect(textCalls).toContain(`Date: ${expectedDate}`);
  });

  it("should call scoreLabel with the overall score", async () => {
    const result = createMockResult({ overallScore: 85 });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    expect(scoreLabel).toHaveBeenCalledWith(85);
  });

  it("should display the overall score and label in the document", async () => {
    const result = createMockResult({ overallScore: 72 });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("72/100");
    expect(textCalls).toContain("Good");
  });

  it("should display the 'Overall Score' section header", async () => {
    const result = createMockResult();
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("Overall Score");
  });

  it("should display 'Category Breakdown' header and all categories", async () => {
    const result = createMockResult({
      categories: [
        { name: "performance", score: 80 },
        { name: "accessibility", score: 65 },
      ],
    });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("Category Breakdown");
    expect(textCalls).toContain("Performance: ");
    expect(textCalls).toContain("80/100");
    expect(textCalls).toContain("Accessibility: ");
    expect(textCalls).toContain("65/100");
  });

  it("should capitalize category names", async () => {
    const result = createMockResult({
      categories: [{ name: "seo", score: 90 }],
    });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("Seo: ");
  });

  it("should display findings with severity bullets and titles", async () => {
    const result = createMockResult({
      findings: [
        { severity: "critical", title: "Critical issue", value: null },
        { severity: "warning", title: "Warning issue", value: null },
        { severity: "info", title: "Info issue", value: null },
      ],
    });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("\u25CF ");
    expect(textCalls).toContain("Critical issue");
    expect(textCalls).toContain("\u25D0 ");
    expect(textCalls).toContain("Warning issue");
    expect(textCalls).toContain("\u25CB ");
    expect(textCalls).toContain("Info issue");
  });

  it("should display finding value in parentheses when present", async () => {
    const result = createMockResult({
      findings: [
        { severity: "warning", title: "Large image", value: "2.4MB" },
      ],
    });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("Large image (2.4MB)");
  });

  it("should not display value in parentheses when value is null", async () => {
    const result = createMockResult({
      findings: [
        { severity: "info", title: "HTTPS enabled", value: null },
      ],
    });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("HTTPS enabled");
    expect(textCalls).not.toContain("HTTPS enabled (null)");
  });

  it("should limit findings to 15 items", async () => {
    const findings = Array.from({ length: 20 }, (_, i) => ({
      severity: "info" as const,
      title: `Finding ${i + 1}`,
      value: null,
    }));
    const result = createMockResult({ findings });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const findingCalls = mockDocInstance.text.mock.calls.filter(
      (call: any[]) => typeof call[0] === "string" && call[0].startsWith("Finding ")
    );
    expect(findingCalls.length).toBe(15);
  });

  it("should not render findings section when findings array is empty", async () => {
    const result = createMockResult({ findings: [] });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).not.toContain("Key Findings");
  });

  it("should display opportunities with title, description, impact and effort", async () => {
    const result = createMockResult({
      opportunities: [
        {
          title: "Compress images",
          description: "Use WebP format",
          impact: "high",
          effort: "low",
        },
      ],
    });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("Recommended Improvements");
    expect(textCalls).toContain("\u25B8 Compress images");
    expect(textCalls).toContain("  Use WebP format");
    expect(textCalls).toContain("  Impact: high | Effort: low");
  });

  it("should limit opportunities to 8 items", async () => {
    const opportunities = Array.from({ length: 12 }, (_, i) => ({
      title: `Opportunity ${i + 1}`,
      description: `Description ${i + 1}`,
      impact: "medium" as const,
      effort: "medium" as const,
    }));
    const result = createMockResult({ opportunities });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const oppCalls = mockDocInstance.text.mock.calls.filter(
      (call: any[]) => typeof call[0] === "string" && call[0].startsWith("\u25B8 Opportunity ")
    );
    expect(oppCalls.length).toBe(8);
  });

  it("should not render opportunities section when opportunities array is empty", async () => {
    const result = createMockResult({ opportunities: [] });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).not.toContain("Recommended Improvements");
  });

  it("should write the footer text", async () => {
    const result = createMockResult();
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("Generated by FindX \u2014 findx.nl");
  });

  it("should call doc.end() to finalize the PDF", async () => {
    const result = createMockResult();
    const promise = generatePdfReport(result);

    // generatePdfReport calls doc.end() internally, which resolves the promise
    await promise;

    expect(mockDocInstance.end).toHaveBeenCalledTimes(1);
  });

  it("should use correct colors for score ranges", async () => {
    const testCases = [
      { score: 95, expectedColor: "#16A34A" },
      { score: 75, expectedColor: "#2563EB" },
      { score: 55, expectedColor: "#F59E0B" },
      { score: 35, expectedColor: "#EA580C" },
      { score: 15, expectedColor: "#DC2626" },
    ];

    for (const { score, expectedColor } of testCases) {
      vi.clearAllMocks();

      const result = createMockResult({ overallScore: score });
      const promise = generatePdfReport(result);
      mockDocInstance.end();
      await promise;

      const colorCalls = mockDocInstance.fillColor.mock.calls;
      const hasExpectedColor = colorCalls.some(
        (call: any[]) => call[0] === expectedColor
      );
      expect(hasExpectedColor).toBe(true);
    }
  });

  it("should use correct colors for severity levels", async () => {
    const result = createMockResult({
      findings: [
        { severity: "critical", title: "Critical finding", value: null },
        { severity: "warning", title: "Warning finding", value: null },
        { severity: "info", title: "Info finding", value: null },
      ],
    });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const colorCalls = mockDocInstance.fillColor.mock.calls.flat();
    expect(colorCalls).toContain("#DC2626");
    expect(colorCalls).toContain("#F59E0B");
    expect(colorCalls).toContain("#3B82F6");
  });

  it("should use brand color for opportunity titles", async () => {
    const result = createMockResult({
      opportunities: [
        {
          title: "Test opportunity",
          description: "Test description",
          impact: "high",
          effort: "low",
        },
      ],
    });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const fillCalls = mockDocInstance.fillColor.mock.calls;
    const brandCallIndex = fillCalls.findIndex(
      (call: any[]) => call[0] === "#2563EB"
    );
    expect(brandCallIndex).toBeGreaterThanOrEqual(0);
  });

  it("should draw divider lines using moveTo/lineTo/stroke", async () => {
    const result = createMockResult();
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    expect(mockDocInstance.moveTo).toHaveBeenCalled();
    expect(mockDocInstance.lineTo).toHaveBeenCalled();
    expect(mockDocInstance.stroke).toHaveBeenCalled();
  });

  it("should handle score of exactly 90 (boundary)", async () => {
    const result = createMockResult({ overallScore: 90 });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const colorCalls = mockDocInstance.fillColor.mock.calls.flat();
    expect(colorCalls).toContain("#16A34A");
  });

  it("should handle score of exactly 70 (boundary)", async () => {
    const result = createMockResult({ overallScore: 70 });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const colorCalls = mockDocInstance.fillColor.mock.calls.flat();
    expect(colorCalls).toContain("#2563EB");
  });

  it("should handle score of exactly 50 (boundary)", async () => {
    const result = createMockResult({ overallScore: 50 });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const colorCalls = mockDocInstance.fillColor.mock.calls.flat();
    expect(colorCalls).toContain("#F59E0B");
  });

  it("should handle score of exactly 30 (boundary)", async () => {
    const result = createMockResult({ overallScore: 30 });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const colorCalls = mockDocInstance.fillColor.mock.calls.flat();
    expect(colorCalls).toContain("#EA580C");
  });

  it("should handle score of 0 (minimum)", async () => {
    const result = createMockResult({ overallScore: 0 });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("0/100");

    const colorCalls = mockDocInstance.fillColor.mock.calls.flat();
    expect(colorCalls).toContain("#DC2626");
  });

  it("should handle score of 100 (maximum)", async () => {
    const result = createMockResult({ overallScore: 100 });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("100/100");

    const colorCalls = mockDocInstance.fillColor.mock.calls.flat();
    expect(colorCalls).toContain("#16A34A");
  });

  it("should handle empty categories array", async () => {
    const result = createMockResult({ categories: [] });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("Category Breakdown");
  });

  it("should handle findings and opportunities both empty", async () => {
    const result = createMockResult({ findings: [], opportunities: [] });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).not.toContain("Key Findings");
    expect(textCalls).not.toContain("Recommended Improvements");
    expect(textCalls).toContain("Generated by FindX \u2014 findx.nl");
  });

  it("should register data, end, and error event listeners", async () => {
    const result = createMockResult();
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    expect(mockDocInstance.on).toHaveBeenCalledWith("data", expect.any(Function));
    expect(mockDocInstance.on).toHaveBeenCalledWith("end", expect.any(Function));
    expect(mockDocInstance.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("should use continued: true for category score entries", async () => {
    const result = createMockResult({
      categories: [{ name: "performance", score: 80 }],
    });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const continuedCalls = mockDocInstance.text.mock.calls.filter(
      (call: any[]) => call[1] && call[1].continued === true
    );
    expect(continuedCalls.length).toBeGreaterThan(0);
  });

  it("should use continued: true for finding bullet and title", async () => {
    const result = createMockResult({
      findings: [{ severity: "critical", title: "Test finding", value: null }],
    });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const continuedCalls = mockDocInstance.text.mock.calls.filter(
      (call: any[]) => call[1] && call[1].continued === true
    );
    expect(continuedCalls.length).toBeGreaterThan(0);
  });

  it("should handle unknown severity as info level", async () => {
    const result = createMockResult({
      findings: [
        { severity: "unknown", title: "Unknown severity", value: null },
      ],
    });
    const promise = generatePdfReport(result);
    mockDocInstance.end();
    await promise;

    const textCalls = mockDocInstance.text.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(textCalls).toContain("\u25CB ");
    expect(textCalls).toContain("Unknown severity");

    const colorCalls = mockDocInstance.fillColor.mock.calls.flat();
    expect(colorCalls).toContain("#3B82F6");
  });
});
