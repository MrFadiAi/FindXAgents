import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../lib/db/client.js', () => ({
  prisma: {
    outreach: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    lead: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    analysis: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../lib/email/client.js", () => ({
  sendEmail: vi.fn(),
  isEmailConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("./generator.js", () => ({
  generatePersonalizedEmail: vi.fn(),
  generateToneVariants: vi.fn(),
}));

import { prisma } from "../../lib/db/client.js";
import { sendEmail } from "../../lib/email/client.js";
import {
  generatePersonalizedEmail,
  generateToneVariants,
} from "./generator.js";
import {
  checkRateLimit,
  generateOutreachEmail,
  approveOutreach,
  sendOutreach,
  trackOutreachEvent,
  getLeadOutreachHistory,
  getOutreach,
  listOutreaches,
  updateOutreachDraft,
  processGenerateJob,
  processSendJob,
  processTrackJob,
} from "./outreach.service.js";

const mockPrismaLead = prisma.lead as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockPrismaOutreach = prisma.outreach as unknown as {
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockPrismaAnalysis = prisma.analysis as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};
const mockSendEmail = sendEmail as ReturnType<typeof vi.fn>;
const mockGeneratePersonalizedEmail = generatePersonalizedEmail as ReturnType<typeof vi.fn>;
const mockGenerateToneVariants = generateToneVariants as ReturnType<typeof vi.fn>;

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return allowed=true and correct remaining count when below limit", async () => {
    mockPrismaOutreach.count.mockResolvedValue(42);
    const result = await checkRateLimit();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(158);
  });

  it("should return allowed=false and remaining=0 when limit is reached", async () => {
    mockPrismaOutreach.count.mockResolvedValue(200);
    const result = await checkRateLimit();
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should return allowed=false and remaining=0 when limit is exceeded", async () => {
    mockPrismaOutreach.count.mockResolvedValue(250);
    const result = await checkRateLimit();
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should return allowed=true and max remaining when count is 0", async () => {
    mockPrismaOutreach.count.mockResolvedValue(0);
    const result = await checkRateLimit();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(200);
  });
});

describe("generateOutreachEmail", () => {
  const mockLead = {
    id: "lead-1",
    businessName: "Test Corp",
    industry: "Tech",
    city: "Amsterdam",
    hasWebsite: true,
    website: "https://test.com",
    analyses: [
      {
        id: "analysis-1",
        findings: [
          { category: "seo", title: "Missing Meta", description: "No meta tags", severity: "critical" },
        ],
        opportunities: [
          { title: "Add Meta Tags", description: "Improve SEO", impact: "High" },
        ],
        score: 45,
      },
    ],
  };

  const mockEmail = {
    subject: "Improve your website",
    body: "We can help!",
    personalizedDetails: { greeting: "Dear Test Corp" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate and persist an outreach email for a lead", async () => {
    mockPrismaLead.findUnique.mockResolvedValue(mockLead);
    mockGeneratePersonalizedEmail.mockResolvedValue(mockEmail);
    mockPrismaOutreach.create.mockResolvedValue({ id: "outreach-1" });
    mockPrismaLead.update.mockResolvedValue({ ...mockLead, status: "contacting" });

    const result = await generateOutreachEmail("lead-1");

    expect(result.outreach).toEqual(mockEmail);
    expect(mockPrismaOutreach.create).toHaveBeenCalledWith({
      data: {
        leadId: "lead-1",
        status: "draft",
        subject: mockEmail.subject,
        body: mockEmail.body,
        personalizedDetails: mockEmail.personalizedDetails,
      },
    });
    expect(mockPrismaLead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { status: "contacting" },
    });
  });

  it("should throw an error if lead is not found", async () => {
    mockPrismaLead.findUnique.mockResolvedValue(null);
    await expect(generateOutreachEmail("bad-id")).rejects.toThrow("Lead bad-id not found");
  });

  it("should use the specified analysisId if provided", async () => {
    const specificAnalysis = {
      id: "analysis-specific",
      findings: [],
      opportunities: [],
      score: 60,
    };
    mockPrismaLead.findUnique.mockResolvedValue({ ...mockLead, analyses: [] });
    mockPrismaAnalysis.findUnique.mockResolvedValue(specificAnalysis);
    mockGeneratePersonalizedEmail.mockResolvedValue(mockEmail);
    mockPrismaOutreach.create.mockResolvedValue({ id: "outreach-1" });
    mockPrismaLead.update.mockResolvedValue({});

    await generateOutreachEmail("lead-1", { analysisId: "analysis-specific" });

    expect(mockPrismaAnalysis.findUnique).toHaveBeenCalledWith({ where: { id: "analysis-specific" } });
  });

  it("should generate variants if generateVariants is true", async () => {
    const mockVariants = {
      professional: mockEmail,
      casual: { ...mockEmail, subject: "Hey there!" },
      friendly: { ...mockEmail, subject: "Hi friend!" },
    };
    mockPrismaLead.findUnique.mockResolvedValue(mockLead);
    mockGeneratePersonalizedEmail.mockResolvedValue(mockEmail);
    mockGenerateToneVariants.mockResolvedValue(mockVariants);
    mockPrismaOutreach.create.mockResolvedValue({ id: "outreach-1" });
    mockPrismaLead.update.mockResolvedValue({});

    const result = await generateOutreachEmail("lead-1", { generateVariants: true });

    expect(result.variants).toEqual(mockVariants);
    expect(mockGenerateToneVariants).toHaveBeenCalled();
  });

  it("should handle analysis with non-array findings gracefully", async () => {
    const badAnalysisLead = {
      ...mockLead,
      analyses: [{ id: "a1", findings: "not-an-array", opportunities: "not-an-array", score: 10 }],
    };
    mockPrismaLead.findUnique.mockResolvedValue(badAnalysisLead);
    mockGeneratePersonalizedEmail.mockResolvedValue(mockEmail);
    mockPrismaOutreach.create.mockResolvedValue({ id: "outreach-1" });
    mockPrismaLead.update.mockResolvedValue({});

    await generateOutreachEmail("lead-1");

    const contextArg = mockGeneratePersonalizedEmail.mock.calls[0][0];
    expect(contextArg.findings).toEqual([]);
    expect(contextArg.opportunities).toEqual([]);
  });

  it("should handle lead with no analyses gracefully", async () => {
    const noAnalysisLead = { ...mockLead, analyses: [] };
    mockPrismaLead.findUnique.mockResolvedValue(noAnalysisLead);
    mockGeneratePersonalizedEmail.mockResolvedValue(mockEmail);
    mockPrismaOutreach.create.mockResolvedValue({ id: "outreach-1" });
    mockPrismaLead.update.mockResolvedValue({});

    await generateOutreachEmail("lead-1");

    const contextArg = mockGeneratePersonalizedEmail.mock.calls[0][0];
    expect(contextArg.findings).toEqual([]);
    expect(contextArg.opportunities).toEqual([]);
    expect(contextArg.overallScore).toBeUndefined();
  });

  it("should pass the specified tone and language to the generator", async () => {
    mockPrismaLead.findUnique.mockResolvedValue(mockLead);
    mockGeneratePersonalizedEmail.mockResolvedValue(mockEmail);
    mockPrismaOutreach.create.mockResolvedValue({ id: "outreach-1" });
    mockPrismaLead.update.mockResolvedValue({});

    await generateOutreachEmail("lead-1", { tone: "casual", language: "en" });

    expect(mockGeneratePersonalizedEmail).toHaveBeenCalledWith(
      expect.anything(),
      "casual",
      "en"
    );
  });

  it("should default to professional tone and nl language", async () => {
    mockPrismaLead.findUnique.mockResolvedValue(mockLead);
    mockGeneratePersonalizedEmail.mockResolvedValue(mockEmail);
    mockPrismaOutreach.create.mockResolvedValue({ id: "outreach-1" });
    mockPrismaLead.update.mockResolvedValue({});

    await generateOutreachEmail("lead-1");

    expect(mockGeneratePersonalizedEmail).toHaveBeenCalledWith(
      expect.anything(),
      "professional",
      "nl"
    );
  });
});

describe("approveOutreach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update outreach status to approved if it is a draft", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue({ id: "o1", status: "draft" });
    mockPrismaOutreach.update.mockResolvedValue({ id: "o1", status: "approved" });

    await approveOutreach("o1");

    expect(mockPrismaOutreach.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "approved" },
    });
  });

  it("should update outreach status to approved if it is pending_approval", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue({ id: "o1", status: "pending_approval" });
    mockPrismaOutreach.update.mockResolvedValue({ id: "o1", status: "approved" });

    await approveOutreach("o1");

    expect(mockPrismaOutreach.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "approved" },
    });
  });

  it("should throw an error if outreach is not found", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(null);
    await expect(approveOutreach("o1")).rejects.toThrow("Outreach o1 not found");
  });

  it("should throw an error if outreach is in an invalid status (e.g., sent)", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue({ id: "o1", status: "sent" });
    await expect(approveOutreach("o1")).rejects.toThrow("Cannot approve outreach in status sent");
  });
});

describe("sendOutreach", () => {
  const mockOutreach = (status: string, email?: string | null) => ({
    id: "o1",
    status,
    subject: "Test Subject",
    body: "Hello **World**\nThis is a [link](https://test.com).",
    lead: { id: "lead-1", email },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rate limit allows sending
    mockPrismaOutreach.count.mockResolvedValue(0);
  });

  it("should send an approved email successfully and update status to sent", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(mockOutreach("approved", "test@test.com"));
    mockSendEmail.mockResolvedValue({ simulated: false, data: { id: "resend-id" } });
    mockPrismaOutreach.update.mockResolvedValue({ id: "o1", status: "sent" });

    const result = await sendOutreach("o1");

    expect(result.sent).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledWith("test@test.com", "Test Subject", expect.any(String));
    
    // Check HTML conversion
    const htmlBody = mockSendEmail.mock.calls[0][2];
    expect(htmlBody).toContain("<strong>World</strong>");
    expect(htmlBody).toContain('<a href="https://test.com">link</a>');
    expect(htmlBody).toContain("<br>\n");

    expect(mockPrismaOutreach.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "sent", sentAt: expect.any(Date) },
    });
  });

  it("should save as 'saved' and return false if email provider is simulated", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(mockOutreach("approved", "test@test.com"));
    mockSendEmail.mockResolvedValue({ simulated: true });

    const result = await sendOutreach("o1");

    expect(result.sent).toBe(false);
    expect(result.reason).toContain("RESEND_API_KEY missing");
    expect(mockPrismaOutreach.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "saved", sentAt: expect.any(Date) },
    });
  });

  it("should fail if lead has no email address", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(mockOutreach("approved", null));
    mockPrismaOutreach.update.mockResolvedValue({ id: "o1", status: "failed" });

    const result = await sendOutreach("o1");

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("Lead has no email address");
    expect(mockPrismaOutreach.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "failed" },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("should reject sending if status is not approved or pending_approval", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(mockOutreach("draft", "test@test.com"));
    await expect(sendOutreach("o1")).rejects.toThrow("Cannot send outreach in status draft");
  });

  it("should reject sending if daily rate limit is reached", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(mockOutreach("approved", "test@test.com"));
    mockPrismaOutreach.count.mockResolvedValue(200); // Limit reached

    const result = await sendOutreach("o1");

    expect(result.sent).toBe(false);
    expect(result.reason).toContain("Daily send limit reached (200)");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("should catch email sending errors and mark as failed", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(mockOutreach("approved", "test@test.com"));
    mockSendEmail.mockRejectedValue(new Error("SMTP Down"));
    mockPrismaOutreach.update.mockResolvedValue({ id: "o1", status: "failed" });

    const result = await sendOutreach("o1");

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("SMTP Down");
    expect(mockPrismaOutreach.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "failed" },
    });
  });

  it("should handle non-Error objects in catch block", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(mockOutreach("approved", "test@test.com"));
    mockSendEmail.mockRejectedValue("String error");
    mockPrismaOutreach.update.mockResolvedValue({ id: "o1", status: "failed" });

    const result = await sendOutreach("o1");

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("Unknown error");
  });

  it("should throw if outreach is not found", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(null);
    await expect(sendOutreach("o1")).rejects.toThrow("Outreach o1 not found");
  });

  it("should escape HTML entities in body", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue({
      ...mockOutreach("approved", "test@test.com"),
      body: "<script>alert('xss')</script>&test"
    });
    mockSendEmail.mockResolvedValue({ simulated: false, data: {} });
    mockPrismaOutreach.update.mockResolvedValue({});

    await sendOutreach("o1");
    const htmlBody = mockSendEmail.mock.calls[0][2];
    expect(htmlBody).toContain("&lt;script&gt;");
    expect(htmlBody).toContain("&amp;test");
  });
});

describe("trackOutreachEvent", () => {
  const mockOutreachRecord = (openedAt?: Date | null) => ({
    id: "o1",
    leadId: "lead-1",
    openedAt: openedAt || null,
    lead: { id: "lead-1" },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update status to opened and set openedAt on first open event", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(mockOutreachRecord(null));
    mockPrismaOutreach.update.mockResolvedValue({});

    await trackOutreachEvent("o1", "open", "2023-01-01T10:00:00Z");

    expect(mockPrismaOutreach.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "opened", openedAt: new Date("2023-01-01T10:00:00Z") },
    });
  });

  it("should keep the original openedAt time on subsequent open events", async () => {
    const firstOpenTime = new Date("2023-01-01T10:00:00Z");
    mockPrismaOutreach.findUnique.mockResolvedValue(mockOutreachRecord(firstOpenTime));
    mockPrismaOutreach.update.mockResolvedValue({});

    await trackOutreachEvent("o1", "open", "2023-01-02T10:00:00Z");

    expect(mockPrismaOutreach.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "opened", openedAt: firstOpenTime },
    });
  });

  it("should update status to replied and lead status to responded", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(mockOutreachRecord());
    mockPrismaOutreach.update.mockResolvedValue({});
    mockPrismaLead.update.mockResolvedValue({});

    await trackOutreachEvent("o1", "reply");

    expect(mockPrismaOutreach.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "replied", repliedAt: expect.any(Date) },
    });
    expect(mockPrismaLead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { status: "responded" },
    });
  });

  it("should update status to bounced but not change lead status", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(mockOutreachRecord());
    mockPrismaOutreach.update.mockResolvedValue({});

    await trackOutreachEvent("o1", "bounce");

    expect(mockPrismaOutreach.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "bounced" },
    });
    expect(mockPrismaLead.update).not.toHaveBeenCalled();
  });

  it("should gracefully skip if outreach is not found", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(null);
    
    // Should not throw
    await trackOutreachEvent("unknown-id", "open");
    
    expect(mockPrismaOutreach.update).not.toHaveBeenCalled();
  });

  it("should use current date if timestamp is not provided", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(mockOutreachRecord(null));
    mockPrismaOutreach.update.mockResolvedValue({});

    await trackOutreachEvent("o1", "open");

    const updateCall = mockPrismaOutreach.update.mock.calls[0][0];
    const openedAt = updateCall.data.openedAt as Date;
    // Check it's roughly now (within last second)
    expect(openedAt.getTime()).toBeCloseTo(Date.now(), -3);
  });
});

describe("getLeadOutreachHistory", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should fetch outreaches for a given lead ordered by creation date descending", async () => {
    const mockHistory = [{ id: "o1" }, { id: "o2" }];
    mockPrismaOutreach.findMany.mockResolvedValue(mockHistory);

    const result = await getLeadOutreachHistory("lead-1");

    expect(result).toEqual(mockHistory);
    expect(mockPrismaOutreach.findMany).toHaveBeenCalledWith({
      where: { leadId: "lead-1" },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("getOutreach", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should fetch a single outreach with its associated lead", async () => {
    const mockData = { id: "o1", lead: { id: "lead-1" } };
    mockPrismaOutreach.findUnique.mockResolvedValue(mockData);

    const result = await getOutreach("o1");

    expect(result).toEqual(mockData);
    expect(mockPrismaOutreach.findUnique).toHaveBeenCalledWith({
      where: { id: "o1" },
      include: { lead: true },
    });
  });
});

describe("listOutreaches", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should return paginated results with default values", async () => {
    mockPrismaOutreach.findMany.mockResolvedValue([]);
    mockPrismaOutreach.count.mockResolvedValue(0);

    const result = await listOutreaches();

    expect(result).toEqual({ outreaches: [], total: 0, page: 1, pageSize: 25 });
    expect(mockPrismaOutreach.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 25 })
    );
  });

  it("should apply filters and calculate correct pagination", async () => {
    mockPrismaOutreach.findMany.mockResolvedValue([{ id: "o1" }]);
    mockPrismaOutreach.count.mockResolvedValue(30);

    const result = await listOutreaches({ status: "sent", leadId: "l1", page: 2, pageSize: 10 });

    expect(result.total).toBe(30);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    
    const expectedWhere = { status: "sent", leadId: "l1" };
    expect(mockPrismaOutreach.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere, skip: 10, take: 10 })
    );
    expect(mockPrismaOutreach.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it("should include selected lead fields in the query", async () => {
    mockPrismaOutreach.findMany.mockResolvedValue([]);
    mockPrismaOutreach.count.mockResolvedValue(0);

    await listOutreaches();

    expect(mockPrismaOutreach.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { lead: { select: { businessName: true, city: true, email: true } } },
      })
    );
  });
});

describe("updateOutreachDraft", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should update the draft successfully", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue({ id: "o1", status: "draft" });
    mockPrismaOutreach.update.mockResolvedValue({ id: "o1", subject: "New" });

    const result = await updateOutreachDraft("o1", { subject: "New" });

    expect(result.subject).toBe("New");
    expect(mockPrismaOutreach.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { subject: "New" },
    });
  });

  it("should allow editing pending_approval status", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue({ id: "o1", status: "pending_approval" });
    mockPrismaOutreach.update.mockResolvedValue({ id: "o1" });

    await updateOutreachDraft("o1", { body: "Updated body" });
    expect(mockPrismaOutreach.update).toHaveBeenCalled();
  });

  it("should throw if outreach not found", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue(null);
    await expect(updateOutreachDraft("o1", {})).rejects.toThrow("Outreach o1 not found");
  });

  it("should throw if outreach status is not editable (e.g., sent)", async () => {
    mockPrismaOutreach.findUnique.mockResolvedValue({ id: "o1", status: "sent" });
    await expect(updateOutreachDraft("o1", { subject: "Nope" })).rejects.toThrow(
      "Cannot edit outreach in status sent"
    );
  });
});

describe("processGenerateJob", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should call generateOutreachEmail and return the newly created outreach ID", async () => {
    // We mock the underlying functions via the service logic
    mockPrismaLead.findUnique.mockResolvedValue({
      id: "lead-1", businessName: "Test", city: "City", hasWebsite: false, analyses: [],
    });
    mockGeneratePersonalizedEmail.mockResolvedValue({
      subject: "Test", body: "Test", personalizedDetails: {},
    });
    mockPrismaOutreach.create.mockResolvedValue({ id: "outreach-new" });
    mockPrismaLead.update.mockResolvedValue({});
    
    // Mock the lookup inside processGenerateJob
    mockPrismaOutreach.findFirst.mockResolvedValue({ id: "outreach-new" });

    const result = await processGenerateJob({ leadId: "lead-1", tone: "professional" });

    expect(result.outreachId).toBe("outreach-new");
    expect(mockPrismaOutreach.findFirst).toHaveBeenCalledWith({
      where: { leadId: "lead-1" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("should return 'unknown' if findFirst returns null", async () => {
    mockPrismaLead.findUnique.mockResolvedValue({
      id: "lead-1", businessName: "Test", city: "City", hasWebsite: false, analyses: [],
    });
    mockGeneratePersonalizedEmail.mockResolvedValue({
      subject: "Test", body: "Test", personalizedDetails: {},
    });
    mockPrismaOutreach.create.mockResolvedValue({ id: "outreach-new" });
    mockPrismaLead.update.mockResolvedValue({});
    mockPrismaOutreach.findFirst.mockResolvedValue(null);

    const result = await processGenerateJob({ leadId: "lead-1" });
    expect(result.outreachId).toBe("unknown");
  });
});

describe("processSendJob", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should auto-approve draft and then send successfully", async () => {
    const mockOutreachData = {
      id: "o1",
      status: "draft",
      subject: "Test",
      body: "Test",
      leadId: "l1",
      lead: { id: "l1", email: "test@test.com" },
    };

    // For processSendJob check, approveOutreach check, and sendOutreach check
    mockPrismaOutreach.findUnique
      .mockResolvedValueOnce(mockOutreachData) // check in processSendJob (status=draft)
      .mockResolvedValueOnce(mockOutreachData) // check in approveOutreach (status=draft)
      .mockResolvedValueOnce({ ...mockOutreachData, status: "approved" }); // check in sendOutreach (status=approved, with lead)
    
    // For approve update
    mockPrismaOutreach.update.mockResolvedValue({ id: "o1", status: "approved" });
    
    // Mock rate limit
    mockPrismaOutreach.count.mockResolvedValue(0);
    
    // Mock send
    mockSendEmail.mockResolvedValue({ simulated: false, data: {} });

    const result = await processSendJob({ outreachId: "o1" });

    expect(result.sent).toBe(true);
    // First update is approval, second is sending
    expect(mockPrismaOutreach.update).toHaveBeenCalledTimes(2);
  });

  it("should just send if already approved", async () => {
    const mockOutreachData = {
      id: "o1",
      status: "approved",
      subject: "Test",
      body: "Test",
      leadId: "l1",
      lead: { id: "l1", email: "test@test.com" },
    };

    // Check in processSendJob
    mockPrismaOutreach.findUnique
      .mockResolvedValueOnce(mockOutreachData) // check in processSendJob
      .mockResolvedValueOnce(mockOutreachData); // check in sendOutreach
    
    // Update only happens in sendOutreach
    mockPrismaOutreach.update.mockResolvedValue({ id: "o1", status: "sent" });
    
    // Mock rate limit
    mockPrismaOutreach.count.mockResolvedValue(0);
    
    // Mock send
    mockSendEmail.mockResolvedValue({ simulated: false, data: {} });

    const result = await processSendJob({ outreachId: "o1" });

    expect(result.sent).toBe(true);
    // Only update is from sendOutreach
    expect(mockPrismaOutreach.update).toHaveBeenCalledTimes(1);
  });
});

describe("processTrackJob", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should delegate to trackOutreachEvent with the correct data", async () => {
    const mockOutreachData = { id: "o1", leadId: "l1", openedAt: null, lead: { id: "l1" } };
    mockPrismaOutreach.findUnique.mockResolvedValue(mockOutreachData);
    mockPrismaOutreach.update.mockResolvedValue({});

    await processTrackJob({ outreachId: "o1", event: "open", timestamp: "2023-01-01T00:00:00Z" });

    expect(mockPrismaOutreach.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "opened", openedAt: new Date("2023-01-01T00:00:00Z") },
    });
  });
});