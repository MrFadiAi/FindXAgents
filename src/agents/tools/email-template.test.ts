import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Tool } from "../core/types.js";

// Mock the templates module
vi.mock("../../modules/outreach/templates.js", () => ({
  pickColdTemplate: vi.fn(),
  renderTemplate: vi.fn(),
}));

import {
  pickColdTemplate,
  renderTemplate,
} from "../../modules/outreach/templates.js";
import { renderTemplateTool } from "./email-template.js";

describe("renderTemplateTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have the correct tool name", () => {
    expect(renderTemplateTool.name).toBe("render_template");
  });

  it("should have a non-empty description", () => {
    expect(renderTemplateTool.description).toBeTruthy();
    expect(typeof renderTemplateTool.description).toBe("string");
  });

  it("should define input_schema as an object with required fields", () => {
    const schema = renderTemplateTool.input_schema as any;
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual([
      "has_website",
      "company_name",
      "contact_name",
      "city",
    ]);
  });

  it("should define has_website as boolean in input_schema", () => {
    const schema = renderTemplateTool.input_schema as any;
    expect(schema.properties.has_website.type).toBe("boolean");
  });

  it("should define language with enum values en, nl, ar", () => {
    const schema = renderTemplateTool.input_schema as any;
    expect(schema.properties.language.enum).toEqual(["en", "nl", "ar"]);
  });

  describe("execute", () => {
    const mockTemplate = { subject: "Hello {{contactName}}", body: "Body" };
    const mockRendered = {
      subject: "Hello John",
      body: "Welcome to FindX, John!",
    };

    beforeEach(() => {
      vi.mocked(pickColdTemplate).mockReturnValue(mockTemplate);
      vi.mocked(renderTemplate).mockReturnValue(mockRendered);
    });

    it("should call pickColdTemplate with has_website=true and language='en' by default", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "John",
        city: "Amsterdam",
      });

      expect(pickColdTemplate).toHaveBeenCalledWith(true, "en");
    });

    it("should call pickColdTemplate with has_website=false when provided", async () => {
      await renderTemplateTool.execute({
        has_website: false,
        company_name: "TestCo",
        contact_name: "Jane",
        city: "Rotterdam",
      });

      expect(pickColdTemplate).toHaveBeenCalledWith(false, "en");
    });

    it("should use the provided language when specified", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        language: "nl",
        company_name: "TestCo",
        contact_name: "Jan",
        city: "Utrecht",
      });

      expect(pickColdTemplate).toHaveBeenCalledWith(true, "nl");
    });

    it("should use language 'ar' when specified", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        language: "ar",
        company_name: "TestCo",
        contact_name: "Ahmed",
        city: "Den Haag",
      });

      expect(pickColdTemplate).toHaveBeenCalledWith(true, "ar");
    });

    it("should default language to 'en' when not provided", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "John",
        city: "Amsterdam",
      });

      expect(pickColdTemplate).toHaveBeenCalledWith(true, "en");
    });

    it("should default language to 'en' when language is undefined", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        language: undefined,
        company_name: "TestCo",
        contact_name: "John",
        city: "Amsterdam",
      });

      expect(pickColdTemplate).toHaveBeenCalledWith(true, "en");
    });

    it("should pass correct TemplateVariables to renderTemplate", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        language: "en",
        company_name: "Acme Corp",
        contact_name: "Alice",
        industry: "Tech",
        city: "Amsterdam",
        specific_insight: "Great growth potential",
        improvement_area: "SEO optimization",
        estimated_impact: "30% more traffic",
      });

      expect(renderTemplate).toHaveBeenCalledWith(mockTemplate, {
        companyName: "Acme Corp",
        contactName: "Alice",
        industry: "Tech",
        city: "Amsterdam",
        specificInsight: "Great growth potential",
        improvementArea: "SEO optimization",
        estimatedImpact: "30% more traffic",
        senderName: "FindX",
        meetingLink: "https://findx.nl/plan-gesprek",
      });
    });

    it("should default industry to 'lokale markt' when not provided", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "Bob",
        city: "Eindhoven",
      });

      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      expect(vars.industry).toBe("lokale markt");
    });

    it("should default industry to 'lokale markt' when industry is undefined", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "Bob",
        city: "Eindhoven",
        industry: undefined,
      });

      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      expect(vars.industry).toBe("lokale markt");
    });

    it("should default specificInsight to empty string when not provided", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "Bob",
        city: "Eindhoven",
      });

      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      expect(vars.specificInsight).toBe("");
    });

    it("should default improvementArea to empty string when not provided", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "Bob",
        city: "Eindhoven",
      });

      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      expect(vars.improvementArea).toBe("");
    });

    it("should default estimatedImpact to empty string when not provided", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "Bob",
        city: "Eindhoven",
      });

      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      expect(vars.estimatedImpact).toBe("");
    });

    it("should always set senderName to 'FindX'", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "Bob",
        city: "Eindhoven",
      });

      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      expect(vars.senderName).toBe("FindX");
    });

    it("should always set meetingLink to the FindX scheduling URL", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "Bob",
        city: "Eindhoven",
      });

      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      expect(vars.meetingLink).toBe("https://findx.nl/plan-gesprek");
    });

    it("should return JSON stringified result from renderTemplate", async () => {
      const result = await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "John",
        city: "Amsterdam",
      });

      expect(result).toBe(JSON.stringify(mockRendered));
    });

    it("should return valid JSON that can be parsed back", async () => {
      const result = await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "John",
        city: "Amsterdam",
      });

      const parsed = JSON.parse(result as string);
      expect(parsed).toEqual(mockRendered);
    });

    it("should handle renderTemplate returning complex objects", async () => {
      const complexResult = {
        subject: "Hello John from TestCo",
        body: "Long email body with multiple paragraphs...\n\nBest regards,\nFindX",
      };
      vi.mocked(renderTemplate).mockReturnValue(complexResult);

      const result = await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "John",
        city: "Amsterdam",
      });

      expect(JSON.parse(result as string)).toEqual(complexResult);
    });

    it("should handle empty string for optional fields", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "John",
        city: "Amsterdam",
        industry: "",
        specific_insight: "",
        improvement_area: "",
        estimated_impact: "",
      });

      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      // Empty string for industry is preserved via ?? (nullish coalescing)
      expect(vars.industry).toBe("");
      expect(vars.specificInsight).toBe("");
      expect(vars.improvementArea).toBe("");
      expect(vars.estimatedImpact).toBe("");
    });

    it("should handle special characters in company_name", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "O'Brien & Partners <LLC>",
        contact_name: "John",
        city: "Amsterdam",
      });

      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      expect(vars.companyName).toBe("O'Brien & Partners <LLC>");
    });

    it("should handle special characters in contact_name", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "José María Ñoño",
        city: "Amsterdam",
      });

      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      expect(vars.contactName).toBe("José María Ñoño");
    });

    it("should handle unicode characters in city", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "John",
        city: "'s-Hertogenbosch",
      });

      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      expect(vars.city).toBe("'s-Hertogenbosch");
    });

    it("should handle very long string values", async () => {
      const longString = "a".repeat(10000);
      await renderTemplateTool.execute({
        has_website: true,
        company_name: longString,
        contact_name: longString,
        city: longString,
        specific_insight: longString,
        improvement_area: longString,
        estimated_impact: longString,
      });

      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      expect(vars.companyName).toBe(longString);
      expect(vars.contactName).toBe(longString);
      expect(vars.city).toBe(longString);
      expect(vars.specificInsight).toBe(longString);
    });

    it("should propagate errors from pickColdTemplate", async () => {
      vi.mocked(pickColdTemplate).mockImplementation(() => {
        throw new Error("Template not found");
      });

      await expect(
        renderTemplateTool.execute({
          has_website: true,
          company_name: "TestCo",
          contact_name: "John",
          city: "Amsterdam",
        })
      ).rejects.toThrow("Template not found");
    });

    it("should propagate errors from renderTemplate", async () => {
      vi.mocked(renderTemplate).mockImplementation(() => {
        throw new Error("Rendering failed");
      });

      await expect(
        renderTemplateTool.execute({
          has_website: true,
          company_name: "TestCo",
          contact_name: "John",
          city: "Amsterdam",
        })
      ).rejects.toThrow("Rendering failed");
    });

    it("should handle has_website=false with Dutch language", async () => {
      await renderTemplateTool.execute({
        has_website: false,
        language: "nl",
        company_name: "Bakkerij de Vries",
        contact_name: "Pieter",
        city: "Haarlem",
      });

      expect(pickColdTemplate).toHaveBeenCalledWith(false, "nl");
      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      expect(vars.companyName).toBe("Bakkerij de Vries");
      expect(vars.contactName).toBe("Pieter");
      expect(vars.city).toBe("Haarlem");
    });

    it("should pass the template returned by pickColdTemplate to renderTemplate", async () => {
      const customTemplate = {
        subject: "Custom {{subject}}",
        body: "Custom {{body}}",
      };
      vi.mocked(pickColdTemplate).mockReturnValue(customTemplate);

      await renderTemplateTool.execute({
        has_website: true,
        company_name: "TestCo",
        contact_name: "John",
        city: "Amsterdam",
      });

      expect(renderTemplate).toHaveBeenCalledWith(
        customTemplate,
        expect.anything()
      );
    });

    it("should handle numeric-like strings in fields", async () => {
      await renderTemplateTool.execute({
        has_website: true,
        company_name: "123",
        contact_name: "456",
        city: "789",
        industry: "42",
      });

      const vars = vi.mocked(renderTemplate).mock.calls[0][1];
      expect(vars.companyName).toBe("123");
      expect(vars.contactName).toBe("456");
      expect(vars.city).toBe("789");
      expect(vars.industry).toBe("42");
    });
  });
});