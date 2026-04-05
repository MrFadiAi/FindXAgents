import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../lib/db/client.js";

vi.mock("../../lib/db/client.js", () => ({
  prisma: {
    emailProviderToken: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("googleapis", () => {
  const on = vi.fn();
  const setCredentials = vi.fn();
  const generateAuthUrl = vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/auth?mocked=true");
  const getToken = vi.fn();

  const mockOAuth2Instance = {
    generateAuthUrl,
    getToken,
    setCredentials,
    on,
  };

  return {
    google: {
      auth: {
        OAuth2: vi.fn().mockReturnValue(mockOAuth2Instance),
      },
      gmail: vi.fn().mockReturnValue({
        users: {
          getProfile: vi.fn(),
        },
      }),
      _mockOAuth2Instance: mockOAuth2Instance,
      _on: on,
    },
  };
});

import {
  getOAuthClient,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getStoredTokens,
  saveTokens,
  deleteTokens,
  getAuthenticatedClient,
  getGmailProfile,
} from "./gmail-oauth.js";

import { google } from "googleapis";

describe("getRedirectUri", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  });

  it("uses API_BASE_URL when set", () => {
    vi.stubEnv("API_BASE_URL", "https://api.example.com");
    getOAuthClient();
    const OAuth2 = google.auth.OAuth2 as ReturnType<typeof vi.fn>;
    expect(OAuth2).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "https://api.example.com/api/email/gmail/callback"
    );
  });

  it("falls back to localhost with PORT when API_BASE_URL is not set", () => {
    vi.stubEnv("PORT", "4000");
    delete process.env.API_BASE_URL;
    getOAuthClient();
    const OAuth2 = google.auth.OAuth2 as ReturnType<typeof vi.fn>;
    expect(OAuth2).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "http://127.0.0.1:4000/api/email/gmail/callback"
    );
  });

  it("defaults to port 3001 when neither API_BASE_URL nor PORT is set", () => {
    delete process.env.API_BASE_URL;
    delete process.env.PORT;
    getOAuthClient();
    const OAuth2 = google.auth.OAuth2 as ReturnType<typeof vi.fn>;
    expect(OAuth2).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "http://127.0.0.1:3001/api/email/gmail/callback"
    );
  });
});

describe("getOAuthClient", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("API_BASE_URL", "https://api.test.com");
  });

  it("creates an OAuth2 client with the correct credentials and redirect URI", () => {
    const client = getOAuthClient();
    expect(google.auth.OAuth2).toHaveBeenCalledWith(
      "test-client-id",
      "test-client-secret",
      "https://api.test.com/api/email/gmail/callback"
    );
    expect(client).toBeDefined();
  });

  it("throws an error when GOOGLE_CLIENT_ID is missing", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect(() => getOAuthClient()).toThrow(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set"
    );
  });

  it("throws an error when GOOGLE_CLIENT_SECRET is missing", () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(() => getOAuthClient()).toThrow(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set"
    );
  });

  it("throws an error when both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(() => getOAuthClient()).toThrow(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set"
    );
  });
});

describe("getAuthorizationUrl", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("API_BASE_URL", "https://api.test.com");
  });

  it("generates an authorization URL with the correct parameters", () => {
    const state = "random-state-123";
    const url = getAuthorizationUrl(state);

    const mockInstance = (google as any)._mockOAuth2Instance;
    expect(mockInstance.generateAuthUrl).toHaveBeenCalledWith({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/gmail.send"],
      state,
    });
    expect(url).toBe("https://accounts.google.com/o/oauth2/auth?mocked=true");
  });

  it("passes different state values correctly", () => {
    const state = "another-state-456";
    getAuthorizationUrl(state);
    const mockInstance = (google as any)._mockOAuth2Instance;
    expect(mockInstance.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ state: "another-state-456" })
    );
  });

  it("passes empty state if provided", () => {
    getAuthorizationUrl("");
    const mockInstance = (google as any)._mockOAuth2Instance;
    expect(mockInstance.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ state: "" })
    );
  });
});

describe("exchangeCodeForTokens", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("API_BASE_URL", "https://api.test.com");
  });

  it("exchanges an authorization code for tokens", async () => {
    const mockTokens = {
      access_token: "ya29.access",
      refresh_token: "1//refresh",
      scope: "https://www.googleapis.com/auth/gmail.send",
      token_type: "Bearer",
      expiry_date: 1700000000000,
    };
    const mockInstance = (google as any)._mockOAuth2Instance;
    mockInstance.getToken.mockResolvedValueOnce({ tokens: mockTokens });

    const result = await exchangeCodeForTokens("4/0AX4XfWh...");

    expect(mockInstance.getToken).toHaveBeenCalledWith("4/0AX4XfWh...");
    expect(result).toEqual(mockTokens);
  });

  it("propagates errors from the OAuth client", async () => {
    const mockInstance = (google as any)._mockOAuth2Instance;
    mockInstance.getToken.mockRejectedValueOnce(new Error("Invalid code"));

    await expect(exchangeCodeForTokens("bad-code")).rejects.toThrow("Invalid code");
  });

  it("handles network errors during token exchange", async () => {
    const mockInstance = (google as any)._mockOAuth2Instance;
    mockInstance.getToken.mockRejectedValueOnce(new Error("Network error"));

    await expect(exchangeCodeForTokens("some-code")).rejects.toThrow("Network error");
  });

  it("returns partial tokens if Google returns incomplete data", async () => {
    const mockInstance = (google as any)._mockOAuth2Instance;
    mockInstance.getToken.mockResolvedValueOnce({
      tokens: { access_token: "partial" },
    });

    const result = await exchangeCodeForTokens("code");
    expect(result).toEqual({ access_token: "partial" });
  });
});

describe("getStoredTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stored Gmail tokens from the database", async () => {
    const mockRecord = {
      id: 1,
      provider: "gmail",
      accessToken: "ya29.access",
      refreshToken: "1//refresh",
      scope: "https://www.googleapis.com/auth/gmail.send",
      tokenType: "Bearer",
      expiryDate: new Date("2024-01-01"),
      email: "user@example.com",
    };
    vi.mocked(prisma.emailProviderToken.findUnique).mockResolvedValueOnce(mockRecord);

    const result = await getStoredTokens();
    expect(prisma.emailProviderToken.findUnique).toHaveBeenCalledWith({
      where: { provider: "gmail" },
    });
    expect(result).toEqual(mockRecord);
  });

  it("returns null when no tokens are stored", async () => {
    vi.mocked(prisma.emailProviderToken.findUnique).mockResolvedValueOnce(null);

    const result = await getStoredTokens();
    expect(result).toBeNull();
  });

  it("propagates database errors", async () => {
    vi.mocked(prisma.emailProviderToken.findUnique).mockRejectedValueOnce(
      new Error("DB connection failed")
    );

    await expect(getStoredTokens()).rejects.toThrow("DB connection failed");
  });
});

describe("saveTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new record when no gmail tokens exist", async () => {
    const mockCreated = {
      id: 1,
      provider: "gmail",
      accessToken: "ya29.access",
      refreshToken: "1//refresh",
      scope: "https://www.googleapis.com/auth/gmail.send",
      tokenType: "Bearer",
      expiryDate: new Date(1700000000000),
      email: "user@example.com",
    };
    vi.mocked(prisma.emailProviderToken.upsert).mockResolvedValueOnce(mockCreated);

    const result = await saveTokens({
      access_token: "ya29.access",
      refresh_token: "1//refresh",
      scope: "https://www.googleapis.com/auth/gmail.send",
      token_type: "Bearer",
      expiry_date: 1700000000000,
      email: "user@example.com",
    });

    expect(prisma.emailProviderToken.upsert).toHaveBeenCalledWith({
      where: { provider: "gmail" },
      update: {
        accessToken: "ya29.access",
        refreshToken: "1//refresh",
        scope: "https://www.googleapis.com/auth/gmail.send",
        tokenType: "Bearer",
        expiryDate: new Date(1700000000000),
        email: "user@example.com",
      },
      create: {
        provider: "gmail",
        accessToken: "ya29.access",
        refreshToken: "1//refresh",
        scope: "https://www.googleapis.com/auth/gmail.send",
        tokenType: "Bearer",
        expiryDate: new Date(1700000000000),
        email: "user@example.com",
      },
    });
    expect(result).toEqual(mockCreated);
  });

  it("updates an existing record with new tokens", async () => {
    const mockUpdated = {
      id: 1,
      provider: "gmail",
      accessToken: "ya29.new-access",
      refreshToken: "1//new-refresh",
      scope: "https://www.googleapis.com/auth/gmail.send",
      tokenType: "Bearer",
      expiryDate: new Date(1700000000000),
      email: "user@example.com",
    };
    vi.mocked(prisma.emailProviderToken.upsert).mockResolvedValueOnce(mockUpdated);

    await saveTokens({
      access_token: "ya29.new-access",
      refresh_token: "1//new-refresh",
      scope: "https://www.googleapis.com/auth/gmail.send",
      token_type: "Bearer",
      expiry_date: 1700000000000,
      email: "user@example.com",
    });

    const call = vi.mocked(prisma.emailProviderToken.upsert).mock.calls[0][0];
    expect(call.update.accessToken).toBe("ya29.new-access");
    expect(call.update.refreshToken).toBe("1//new-refresh");
    expect(call.where).toEqual({ provider: "gmail" });
  });

  it("defaults missing token fields to empty strings", async () => {
    await saveTokens({});

    const call = vi.mocked(prisma.emailProviderToken.upsert).mock.calls[0][0];
    expect(call.update.accessToken).toBe("");
    expect(call.update.refreshToken).toBe("");
    expect(call.update.scope).toBe("");
    expect(call.update.tokenType).toBe("Bearer");
    expect(call.update.expiryDate).toBeNull();
    expect(call.create.accessToken).toBe("");
    expect(call.create.refreshToken).toBe("");
    expect(call.create.scope).toBe("");
    expect(call.create.tokenType).toBe("Bearer");
    expect(call.create.email).toBeUndefined();
  });

  it("handles null token fields by defaulting to empty strings", async () => {
    await saveTokens({
      access_token: null,
      refresh_token: null,
      scope: null,
      token_type: null,
      expiry_date: null,
    });

    const call = vi.mocked(prisma.emailProviderToken.upsert).mock.calls[0][0];
    expect(call.update.accessToken).toBe("");
    expect(call.update.refreshToken).toBe("");
    expect(call.update.scope).toBe("");
    expect(call.update.tokenType).toBe("Bearer");
    expect(call.update.expiryDate).toBeNull();
  });

  it("does not include email in update when email is not provided", async () => {
    await saveTokens({
      access_token: "token",
      refresh_token: "refresh",
    });

    const call = vi.mocked(prisma.emailProviderToken.upsert).mock.calls[0][0];
    expect(call.update).not.toHaveProperty("email");
    expect(call.create.email).toBeUndefined();
  });

  it("includes email in update only when email is provided", async () => {
    await saveTokens({
      access_token: "token",
      email: "test@example.com",
    });

    const call = vi.mocked(prisma.emailProviderToken.upsert).mock.calls[0][0];
    expect(call.update.email).toBe("test@example.com");
    expect(call.create.email).toBe("test@example.com");
  });

  it("converts expiry_date to a Date object", async () => {
    await saveTokens({ expiry_date: 1700000000000 });

    const call = vi.mocked(prisma.emailProviderToken.upsert).mock.calls[0][0];
    expect(call.update.expiryDate).toEqual(new Date(1700000000000));
    expect(call.create.expiryDate).toEqual(new Date(1700000000000));
  });

  it("sets expiryDate to null when expiry_date is null", async () => {
    await saveTokens({ expiry_date: null });

    const call = vi.mocked(prisma.emailProviderToken.upsert).mock.calls[0][0];
    expect(call.update.expiryDate).toBeNull();
    expect(call.create.expiryDate).toBeNull();
  });

  it("propagates database errors", async () => {
    vi.mocked(prisma.emailProviderToken.upsert).mockRejectedValueOnce(
      new Error("Unique constraint violation")
    );

    await expect(saveTokens({ access_token: "dup" })).rejects.toThrow(
      "Unique constraint violation"
    );
  });
});

describe("deleteTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes all Gmail token records from the database", async () => {
    vi.mocked(prisma.emailProviderToken.deleteMany).mockResolvedValueOnce({ count: 1 });

    const result = await deleteTokens();
    expect(prisma.emailProviderToken.deleteMany).toHaveBeenCalledWith({
      where: { provider: "gmail" },
    });
    expect(result).toEqual({ count: 1 });
  });

  it("returns count 0 when no records exist to delete", async () => {
    vi.mocked(prisma.emailProviderToken.deleteMany).mockResolvedValueOnce({ count: 0 });

    const result = await deleteTokens();
    expect(result).toEqual({ count: 0 });
  });

  it("propagates database errors during deletion", async () => {
    vi.mocked(prisma.emailProviderToken.deleteMany).mockRejectedValueOnce(
      new Error("DB timeout")
    );

    await expect(deleteTokens()).rejects.toThrow("DB timeout");
  });
});

describe("getAuthenticatedClient", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("API_BASE_URL", "https://api.test.com");
  });

  it("returns null when no tokens are stored", async () => {
    vi.mocked(prisma.emailProviderToken.findUnique).mockResolvedValueOnce(null);

    const result = await getAuthenticatedClient();
    expect(result).toBeNull();
  });

  it("returns an OAuth2 client with stored credentials", async () => {
    const expiryDate = new Date("2024-06-01");
    vi.mocked(prisma.emailProviderToken.findUnique).mockResolvedValueOnce({
      id: 1,
      provider: "gmail",
      accessToken: "ya29.access",
      refreshToken: "1//refresh",
      scope: "https://www.googleapis.com/auth/gmail.send",
      tokenType: "Bearer",
      expiryDate,
      email: "user@example.com",
    });

    const client = await getAuthenticatedClient();

    expect(client).toBeDefined();
    const mockInstance = (google as any)._mockOAuth2Instance;
    expect(mockInstance.setCredentials).toHaveBeenCalledWith({
      access_token: "ya29.access",
      refresh_token: "1//refresh",
      scope: "https://www.googleapis.com/auth/gmail.send",
      token_type: "Bearer",
      expiry_date: expiryDate.getTime(),
    });
  });

  it("registers a token refresh listener that saves new tokens", async () => {
    const expiryDate = new Date("2024-06-01");
    vi.mocked(prisma.emailProviderToken.findUnique).mockResolvedValueOnce({
      id: 1,
      provider: "gmail",
      accessToken: "ya29.access",
      refreshToken: "1//refresh",
      scope: "https://www.googleapis.com/auth/gmail.send",
      tokenType: "Bearer",
      expiryDate,
      email: "user@example.com",
    });
    vi.mocked(prisma.emailProviderToken.upsert).mockResolvedValueOnce({} as any);

    await getAuthenticatedClient();

    const mockInstance = (google as any)._mockOAuth2Instance;
    expect(mockInstance.on).toHaveBeenCalledWith("tokens", expect.any(Function));

    const tokensHandler = mockInstance.on.mock.calls[0][1];
    await tokensHandler({
      access_token: "ya29.refreshed",
      refresh_token: undefined,
      scope: "https://www.googleapis.com/auth/gmail.send",
      token_type: "Bearer",
      expiry_date: 1700000000000,
    });

    expect(prisma.emailProviderToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ accessToken: "ya29.refreshed" }),
      })
    );
  });

  it("handles null expiryDate in stored tokens", async () => {
    vi.mocked(prisma.emailProviderToken.findUnique).mockResolvedValueOnce({
      id: 1,
      provider: "gmail",
      accessToken: "ya29.access",
      refreshToken: "1//refresh",
      scope: "https://www.googleapis.com/auth/gmail.send",
      tokenType: "Bearer",
      expiryDate: null,
      email: "user@example.com",
    });

    const client = await getAuthenticatedClient();
    const mockInstance = (google as any)._mockOAuth2Instance;
    expect(mockInstance.setCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ expiry_date: undefined })
    );
    expect(client).toBeDefined();
  });

  it("propagates errors from getStoredTokens", async () => {
    vi.mocked(prisma.emailProviderToken.findUnique).mockRejectedValueOnce(
      new Error("DB error")
    );

    await expect(getAuthenticatedClient()).rejects.toThrow("DB error");
  });
});

describe("getGmailProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the email address from the Gmail profile", async () => {
    const mockGmail = (google as any).gmail();
    mockGmail.users.getProfile.mockResolvedValueOnce({
      data: { emailAddress: "user@gmail.com" },
    });

    const mockClient = {} as any;
    const result = await getGmailProfile(mockClient);

    expect(google.gmail).toHaveBeenCalledWith({ version: "v1", auth: mockClient });
    expect(mockGmail.users.getProfile).toHaveBeenCalledWith({ userId: "me" });
    expect(result).toBe("user@gmail.com");
  });

  it('returns "unknown" when emailAddress is null', async () => {
    const mockGmail = (google as any).gmail();
    mockGmail.users.getProfile.mockResolvedValueOnce({
      data: { emailAddress: null },
    });

    const result = await getGmailProfile({} as any);
    expect(result).toBe("unknown");
  });

  it('returns "unknown" when emailAddress is undefined', async () => {
    const mockGmail = (google as any).gmail();
    mockGmail.users.getProfile.mockResolvedValueOnce({
      data: {},
    });

    const result = await getGmailProfile({} as any);
    expect(result).toBe("unknown");
  });

  it("propagates errors from the Gmail API", async () => {
    const mockGmail = (google as any).gmail();
    mockGmail.users.getProfile.mockRejectedValueOnce(
      new Error("Invalid credentials")
    );

    await expect(getGmailProfile({} as any)).rejects.toThrow("Invalid credentials");
  });

  it("propagates rate limit errors from the Gmail API", async () => {
    const mockGmail = (google as any).gmail();
    mockGmail.users.getProfile.mockRejectedValueOnce(
      new Error("Rate limit exceeded")
    );

    await expect(getGmailProfile({} as any)).rejects.toThrow("Rate limit exceeded");
  });
});