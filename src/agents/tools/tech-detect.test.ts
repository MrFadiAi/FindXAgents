import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock("../../modules/analyzer/audits/tech-detect.js", () => ({
  detectTechnologies: vi.fn(),
}));

import { detectTechnologies } from "../../modules/analyzer/audits/tech-detect.js";
import { detectTechTool } from "../tools/tech-detect.js";

const mockedDetectTechnologies = vi.mocked(detectTechnologies);

describe("detectTechTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("metadata and structure", () => {
    it("should have the correct tool name", () => {
      expect(detectTechTool.name).toBe("detect_tech");
    });

    it("should have a description", () => {
      expect(detectTechTool.description).toBeTruthy();
      expect(typeof detectTechTool.description).toBe("string");
    });

    it("should define input_schema as an object type", () => {
      expect(detectTechTool.input_schema.type).toBe("object");
    });

    it("should require 'url' in input_schema", () => {
      expect(detectTechTool.input_schema.required).toContain("url");
    });

    it("should define 'url' as a string property", () => {
      expect(detectTechTool.input_schema.properties.url.type).toBe("string");
    });

    it("should define 'renderJs' as a boolean property", () => {
      expect(detectTechTool.input_schema.properties.renderJs.type).toBe("boolean");
    });

    it("should have an execute function", () => {
      expect(typeof detectTechTool.execute).toBe("function");
    });
  });

  describe("execute", () => {
    it("should call detectTechnologies with the provided url and default renderJs", async () => {
      const mockTechnologies = [
        { name: "WordPress", categories: ["CMS"] },
        { name: "MySQL", categories: ["Databases"] },
      ];
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: mockTechnologies });

      const result = await detectTechTool.execute({ url: "https://example.com" });

      expect(mockedDetectTechnologies).toHaveBeenCalledWith("https://example.com", { renderJs: undefined });
      expect(result).toBe(JSON.stringify(mockTechnologies));
    });

    it("should call detectTechnologies with renderJs=true when provided", async () => {
      const mockTechnologies = [
        { name: "Next.js", categories: ["JavaScript Frameworks"] },
        { name: "Vercel", categories: ["Hosting"] },
      ];
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: mockTechnologies });

      const result = await detectTechTool.execute({ url: "https://nextjs.org", renderJs: true });

      expect(mockedDetectTechnologies).toHaveBeenCalledWith("https://nextjs.org", { renderJs: true });
      expect(result).toBe(JSON.stringify(mockTechnologies));
    });

    it("should call detectTechnologies with renderJs=false when explicitly set to false", async () => {
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: [] });

      await detectTechTool.execute({ url: "https://example.com", renderJs: false });

      expect(mockedDetectTechnologies).toHaveBeenCalledWith("https://example.com", { renderJs: false });
    });

    it("should return an empty array stringified when no technologies are detected", async () => {
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: [] });

      const result = await detectTechTool.execute({ url: "https://unknown-tech-site.com" });

      expect(result).toBe("[]");
    });

    it("should return a complex technologies array as JSON string", async () => {
      const mockTechnologies = [
        {
          name: "React",
          categories: ["JavaScript Frameworks"],
          confidence: 100,
          version: "18.2.0",
          icon: "React.svg",
          website: "https://reactjs.org",
        },
        {
          name: "Google Analytics",
          categories: ["Analytics"],
          confidence: 95,
        },
      ];
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: mockTechnologies });

      const result = await detectTechTool.execute({ url: "https://react-site.com", renderJs: true });
      const parsed = JSON.parse(result);

      expect(parsed).toEqual(mockTechnologies);
    });

    it("should handle extra properties in input without failing", async () => {
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: [{ name: "Nginx" }] });

      const result = await detectTechTool.execute({
        url: "https://example.com",
        renderJs: false,
        extraKey: "ignored",
        anotherKey: 123,
      });

      expect(mockedDetectTechnologies).toHaveBeenCalledWith("https://example.com", { renderJs: false });
      expect(result).toBe(JSON.stringify([{ name: "Nginx" }]));
    });

    it("should pass url as string even if renderJs is missing", async () => {
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: [] });

      await detectTechTool.execute({ url: "https://no-renderjs.com" });

      expect(mockedDetectTechnologies).toHaveBeenCalledWith("https://no-renderjs.com", { renderJs: undefined });
    });

    it("should handle a URL with path, query params, and fragment", async () => {
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: [{ name: "Cloudflare" }] });

      const complexUrl = "https://example.com/path/to/page?query=value#section";
      const result = await detectTechTool.execute({ url: complexUrl });

      expect(mockedDetectTechnologies).toHaveBeenCalledWith(complexUrl, { renderJs: undefined });
      expect(result).toBe(JSON.stringify([{ name: "Cloudflare" }]));
    });
  });

  describe("execute - error handling", () => {
    it("should return JSON with error message when detectTechnologies throws an Error", async () => {
      const errorMsg = "Network request failed: ECONNREFUSED";
      mockedDetectTechnologies.mockRejectedValueOnce(new Error(errorMsg));

      const result = await detectTechTool.execute({ url: "https://down-site.com" });
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({ error: errorMsg });
    });

    it("should return JSON with stringified error when a non-Error is thrown", async () => {
      mockedDetectTechnologies.mockRejectedValueOnce("timeout of 30000ms exceeded");

      const result = await detectTechTool.execute({ url: "https://slow-site.com" });
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({ error: "timeout of 30000ms exceeded" });
    });

    it("should return JSON with stringified error when a number is thrown", async () => {
      mockedDetectTechnologies.mockRejectedValueOnce(500);

      const result = await detectTechTool.execute({ url: "https://error-code-site.com" });
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({ error: "500" });
    });

    it("should return JSON with stringified error when null is thrown", async () => {
      mockedDetectTechnologies.mockRejectedValueOnce(null);

      const result = await detectTechTool.execute({ url: "https://null-throw.com" });
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({ error: "null" });
    });

    it("should return JSON with stringified error when undefined is thrown", async () => {
      mockedDetectTechnologies.mockRejectedValueOnce(undefined);

      const result = await detectTechTool.execute({ url: "https://undefined-throw.com" });
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({ error: "undefined" });
    });

    it("should return JSON with stringified error when an object is thrown", async () => {
      mockedDetectTechnologies.mockRejectedValueOnce({ code: "ENOTFOUND", syscall: "getaddrinfo" });

      const result = await detectTechTool.execute({ url: "https://nonexistent-domain.com" });
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({ error: "[object Object]" });
    });

    it("should always return a valid JSON string even on error", async () => {
      mockedDetectTechnologies.mockRejectedValueOnce(new Error("invalid JSON 'test'"));

      const result = await detectTechTool.execute({ url: "https://broken.com" });

      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe("execute - boundary and edge cases", () => {
    it("should handle an empty URL string", async () => {
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: [] });

      await detectTechTool.execute({ url: "" });

      expect(mockedDetectTechnologies).toHaveBeenCalledWith("", { renderJs: undefined });
    });

    it("should handle a very long URL", async () => {
      const longUrl = "https://example.com/" + "a".repeat(2000);
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: [] });

      await detectTechTool.execute({ url: longUrl });

      expect(mockedDetectTechnologies).toHaveBeenCalledWith(longUrl, { renderJs: undefined });
    });

    it("should handle url with special characters", async () => {
      const specialUrl = "https://example.com/path?q=hello%20world&lang=café";
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: [{ name: "Apache" }] });

      const result = await detectTechTool.execute({ url: specialUrl });

      expect(mockedDetectTechnologies).toHaveBeenCalledWith(specialUrl, { renderJs: undefined });
      expect(JSON.parse(result)).toEqual([{ name: "Apache" }]);
    });

    it("should handle a large technologies array", async () => {
      const manyTechnologies = Array.from({ length: 100 }, (_, i) => ({
        name: `Tech_${i}`,
        categories: [`Category_${i % 5}`],
      }));
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: manyTechnologies });

      const result = await detectTechTool.execute({ url: "https://tech-heavy-site.com", renderJs: true });
      const parsed = JSON.parse(result);

      expect(parsed).toHaveLength(100);
      expect(parsed[0].name).toBe("Tech_0");
      expect(parsed[99].name).toBe("Tech_99");
    });

    it("should handle technologies with null or nested properties", async () => {
      const techWithNulls = [
        { name: "SomeTech", version: null, confidence: undefined },
      ];
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: techWithNulls });

      const result = await detectTechTool.execute({ url: "https://null-tech.com" });
      const parsed = JSON.parse(result);

      expect(parsed).toEqual([{ name: "SomeTech", version: null }]);
    });

    it("should handle input where url is not a string (unsafe cast)", async () => {
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: [] });

      await detectTechTool.execute({ url: 12345 });

      expect(mockedDetectTechnologies).toHaveBeenCalledWith(12345, { renderJs: undefined });
    });

    it("should handle input where renderJs is a truthy non-boolean value", async () => {
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: [] });

      await detectTechTool.execute({ url: "https://example.com", renderJs: "yes" });

      expect(mockedDetectTechnologies).toHaveBeenCalledWith("https://example.com", { renderJs: "yes" });
    });

    it("should handle input where renderJs is 0 (falsy number)", async () => {
      mockedDetectTechnologies.mockResolvedValueOnce({ technologies: [] });

      await detectTechTool.execute({ url: "https://example.com", renderJs: 0 });

      expect(mockedDetectTechnologies).toHaveBeenCalledWith("https://example.com", { renderJs: 0 });
    });
  });
});