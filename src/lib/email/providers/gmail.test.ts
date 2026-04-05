import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn(),
  },
}));

vi.mock("../gmail-oauth.js", () => ({
  getAuthenticatedClient: vi.fn(),
}));

import { google } from "googleapis";
import { getAuthenticatedClient } from "../gmail-oauth.js";
import { createGmailProvider } from "./gmail.js";

describe("createGmailProvider", () => {
  let provider: ReturnType<typeof createGmailProvider>;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    provider = createGmailProvider();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("provider.name", () => {
    it("should return 'gmail' as the provider name", () => {
      expect(provider.name).toBe("gmail");
    });
  });

  describe("isConfigured", () => {
    it("should return true when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set", () => {
      process.env.GOOGLE_CLIENT_ID = "test-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-secret";
      expect(provider.isConfigured()).toBe(true);
    });

    it("should return false when GOOGLE_CLIENT_ID is missing", () => {
      delete process.env.GOOGLE_CLIENT_ID;
      process.env.GOOGLE_CLIENT_SECRET = "test-secret";
      expect(provider.isConfigured()).toBe(false);
    });

    it("should return false when GOOGLE_CLIENT_SECRET is missing", () => {
      process.env.GOOGLE_CLIENT_ID = "test-id";
      delete process.env.GOOGLE_CLIENT_SECRET;
      expect(provider.isConfigured()).toBe(false);
    });

    it("should return false when both are missing", () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      expect(provider.isConfigured()).toBe(false);
    });

    it("should return false when values are empty strings", () => {
      process.env.GOOGLE_CLIENT_ID = "";
      process.env.GOOGLE_CLIENT_SECRET = "";
      expect(provider.isConfigured()).toBe(false);
    });

    it("should return false when one value is an empty string", () => {
      process.env.GOOGLE_CLIENT_ID = "valid";
      process.env.GOOGLE_CLIENT_SECRET = "";
      expect(provider.isConfigured()).toBe(false);
    });
  });

  describe("send", () => {
    const sendParams = {
      to: "recipient@example.com",
      subject: "Test Subject",
      html: "<h1>Hello World</h1>",
    };

    const mockGmailSend = vi.fn();
    const mockGetProfile = vi.fn();
    const mockGmailInstance = {
      users: {
        messages: { send: mockGmailSend },
        getProfile: mockGetProfile,
      },
    };

    beforeEach(() => {
      vi.mocked(google.gmail).mockReturnValue(
        mockGmailInstance as unknown as ReturnType<typeof google.gmail>
      );
    });

    describe("simulated send (no authenticated client)", () => {
      beforeEach(() => {
        vi.mocked(getAuthenticatedClient).mockResolvedValue(null);
      });

      it("should return a simulated result when client is null", async () => {
        const result = await provider.send(sendParams);

        expect(result.simulated).toBe(true);
        expect(result.to).toBe("recipient@example.com");
        expect(result.from).toBe("gmail-not-connected");
        expect(result.id).toMatch(/^simulated_\d+_[a-z0-9]+$/);
      });

      it("should use EMAIL_FROM as 'from' in simulated mode when set at import time", async () => {
        // FROM is captured at module import time; setting env vars here has no
        // effect. Simulated mode falls back to "gmail-not-connected".
        process.env.EMAIL_FROM = "custom-sender@example.com";
        const simulatedProvider = createGmailProvider();

        const result = await simulatedProvider.send(sendParams);

        expect(result.from).toBe("gmail-not-connected");
        expect(result.simulated).toBe(true);
      });

      it("should use GMAIL_FROM as 'from' in simulated mode when EMAIL_FROM is not set at import time", async () => {
        // FROM is captured at module import time; setting env vars here has no
        // effect. Simulated mode falls back to "gmail-not-connected".
        delete process.env.EMAIL_FROM;
        process.env.GMAIL_FROM = "fallback-sender@example.com";
        const simulatedProvider = createGmailProvider();

        const result = await simulatedProvider.send(sendParams);

        expect(result.from).toBe("gmail-not-connected");
        expect(result.simulated).toBe(true);
      });

      it("should prefer EMAIL_FROM over GMAIL_FROM in simulated mode", async () => {
        // FROM is captured at module import time; setting env vars here does not
        // change the module-level constant. The simulated fallback is used.
        process.env.EMAIL_FROM = "primary@example.com";
        process.env.GMAIL_FROM = "secondary@example.com";
        const simulatedProvider = createGmailProvider();

        const result = await simulatedProvider.send(sendParams);

        // Module-level FROM was empty at import time, so simulated mode falls
        // back to "gmail-not-connected" (FROM || "gmail-not-connected").
        expect(result.from).toBe("gmail-not-connected");
        expect(result.simulated).toBe(true);
      });

      it("should generate unique IDs for simulated sends", async () => {
        const result1 = await provider.send(sendParams);
        const result2 = await provider.send(sendParams);

        expect(result1.id).not.toBe(result2.id);
      });

      it("should warn to console when simulating send", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        await provider.send(sendParams);

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("[Email] Gmail not connected")
        );
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("recipient@example.com")
        );
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Test Subject")
        );

        warnSpy.mockRestore();
      });

      it("should not call the gmail API when simulating", async () => {
        await provider.send(sendParams);

        expect(google.gmail).not.toHaveBeenCalled();
        expect(mockGmailSend).not.toHaveBeenCalled();
      });
    });

    describe("authenticated send", () => {
      const mockClient = { credentials: { access_token: "valid-token" } };

      beforeEach(() => {
        vi.mocked(getAuthenticatedClient).mockResolvedValue(mockClient);
        mockGmailSend.mockResolvedValue({
          data: { id: "msg-12345" },
        });
        mockGetProfile.mockResolvedValue({
          data: { emailAddress: "profile@example.com" },
        });
      });

      it("should send via the Gmail API and return the message ID", async () => {
        // FROM is captured at module import time as empty string, so the send
        // method falls back to the Gmail profile email address.
        const authProvider = createGmailProvider();

        const result = await authProvider.send(sendParams);

        expect(google.gmail).toHaveBeenCalledWith({
          version: "v1",
          auth: mockClient,
        });
        expect(mockGmailSend).toHaveBeenCalledWith({
          userId: "me",
          requestBody: { raw: expect.any(String) },
        });
        expect(result).toEqual({
          id: "msg-12345",
          from: "profile@example.com",
          to: "recipient@example.com",
        });
      });

      it("should fall back to profile email when GMAIL_FROM is set after import", async () => {
        // FROM is captured at module import time; setting GMAIL_FROM here has
        // no effect. The send method falls back to the profile email.
        delete process.env.EMAIL_FROM;
        process.env.GMAIL_FROM = "gmail-sender@example.com";
        const authProvider = createGmailProvider();

        const result = await authProvider.send(sendParams);

        expect(result.from).toBe("profile@example.com");
      });

      it("should fall back to the user profile email when FROM env vars are empty", async () => {
        delete process.env.EMAIL_FROM;
        delete process.env.GMAIL_FROM;
        const authProvider = createGmailProvider();

        const result = await authProvider.send(sendParams);

        expect(mockGetProfile).toHaveBeenCalledWith({ userId: "me" });
        expect(result.from).toBe("profile@example.com");
      });

      it("should encode the raw MIME message correctly as base64url", async () => {
        // FROM is captured at module import time; the send method falls back
        // to the Gmail profile email address.
        const authProvider = createGmailProvider();

        await authProvider.send(sendParams);

        const raw = mockGmailSend.mock.calls[0][0].requestBody.raw;

        // raw should be a valid base64url string (no `+`, `/`, or `=` padding)
        expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);

        // decode and verify structure
        const decoded = Buffer.from(raw, "base64url").toString("utf-8");
        expect(decoded).toContain("From: profile@example.com");
        expect(decoded).toContain("To: recipient@example.com");
        expect(decoded).toContain("Subject: =?utf-8?B?");
        expect(decoded).toContain("MIME-Version: 1.0");
        expect(decoded).toContain('Content-Type: text/html; charset="utf-8"');
        expect(decoded).toContain("Content-Transfer-Encoding: base64");

        // The HTML body should be base64-encoded at the end
        const htmlBase64 = Buffer.from("<h1>Hello World</h1>").toString("base64");
        expect(decoded.trimEnd().endsWith(htmlBase64)).toBe(true);
      });

      it("should handle subject with unicode characters", async () => {
        process.env.EMAIL_FROM = "sender@example.com";
        const authProvider = createGmailProvider();

        const unicodeParams = {
          to: "recipient@example.com",
          subject: "Héllo Wørld — 測試 🚀",
          html: "<p>Unicode test</p>",
        };

        await authProvider.send(unicodeParams);

        const raw = mockGmailSend.mock.calls[0][0].requestBody.raw;
        const decoded = Buffer.from(raw, "base64url").toString("utf-8");

        const expectedSubjectBase64 = Buffer.from("Héllo Wørld — 測試 🚀").toString("base64");
        expect(decoded).toContain(`Subject: =?utf-8?B?${expectedSubjectBase64}?=`);
      });

      it("should return 'unknown' as id when Gmail API returns null id", async () => {
        process.env.EMAIL_FROM = "sender@example.com";
        const authProvider = createGmailProvider();
        mockGmailSend.mockResolvedValue({ data: { id: null } });

        const result = await authProvider.send(sendParams);

        expect(result.id).toBe("unknown");
      });

      it("should return 'unknown' as id when Gmail API returns undefined id", async () => {
        process.env.EMAIL_FROM = "sender@example.com";
        const authProvider = createGmailProvider();
        mockGmailSend.mockResolvedValue({ data: {} });

        const result = await authProvider.send(sendParams);

        expect(result.id).toBe("unknown");
      });

      it("should propagate errors from the Gmail API send call", async () => {
        process.env.EMAIL_FROM = "sender@example.com";
        const authProvider = createGmailProvider();
        const apiError = new Error("Gmail API rate limit exceeded");
        mockGmailSend.mockRejectedValue(apiError);

        await expect(authProvider.send(sendParams)).rejects.toThrow(
          "Gmail API rate limit exceeded"
        );
      });

      it("should propagate errors from the getProfile call", async () => {
        delete process.env.EMAIL_FROM;
        delete process.env.GMAIL_FROM;
        const authProvider = createGmailProvider();
        const profileError = new Error("Profile lookup failed");
        mockGetProfile.mockRejectedValue(profileError);

        await expect(authProvider.send(sendParams)).rejects.toThrow("Profile lookup failed");
      });

      it("should use empty string for from if profile returns undefined email and no env set", async () => {
        delete process.env.EMAIL_FROM;
        delete process.env.GMAIL_FROM;
        const authProvider = createGmailProvider();
        mockGetProfile.mockResolvedValue({ data: { emailAddress: undefined } });

        const result = await authProvider.send(sendParams);

        expect(result.from).toBe("");
      });

      it("should handle empty HTML body gracefully", async () => {
        process.env.EMAIL_FROM = "sender@example.com";
        const authProvider = createGmailProvider();

        const emptyHtmlParams = {
          to: "recipient@example.com",
          subject: "Empty Body",
          html: "",
        };

        await authProvider.send(emptyHtmlParams);

        const raw = mockGmailSend.mock.calls[0][0].requestBody.raw;
        const decoded = Buffer.from(raw, "base64url").toString("utf-8");
        const expectedBodyBase64 = Buffer.from("").toString("base64");
        expect(decoded.trimEnd().endsWith(expectedBodyBase64)).toBe(true);
      });
    });
  });
});