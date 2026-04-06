# SMTP Email Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add generic SMTP email provider alongside Gmail and Resend, with a global provider selector in Settings.

**Architecture:** Strategy pattern extension. Two new Prisma models (SmtpConfig, EmailSetting), one new provider file (smtp.ts), updated client.ts selection logic, new API routes, updated Settings UI.

**Tech Stack:** TypeScript, Prisma, nodemailer, Fastify, Next.js, React

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `prisma/schema.prisma` | Add SmtpConfig + EmailSetting models |
| Modify | `src/lib/email/providers/types.ts` | Expand provider name union to include "smtp" |
| Create | `src/lib/email/providers/smtp.ts` | nodemailer-based SMTP provider |
| Modify | `src/lib/email/client.ts` | DB-backed provider selection logic |
| Modify | `src/routes/index.ts` | SMTP config CRUD + provider selection routes |
| Modify | `web/lib/types.ts` | EmailSettings + SmtpConfig frontend types |
| Modify | `web/lib/api.ts` | Frontend API wrappers for new endpoints |
| Modify | `web/app/settings/page.tsx` | Provider selector, SMTP form, status cards |

---

### Task 1: Database Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add SmtpConfig and EmailSetting models to schema.prisma**

Append after the `EmailProviderToken` model (after line 232):

```prisma
model SmtpConfig {
  id        String  @id @default("default")
  host      String
  port      Int     @default(465)
  secure    Boolean @default(true)
  user      String
  password  String
  fromEmail String
  fromName  String  @default("FindX")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model EmailSetting {
  id              String   @id @default("default")
  defaultProvider String?
  updatedAt       DateTime @updatedAt
}
```

- [ ] **Step 2: Run migration**

Run: `cd D:/Ai/FindXAgents && npx prisma migrate dev --name add_smtp_config_email_setting`
Expected: Migration created and applied successfully

- [ ] **Step 3: Generate Prisma client**

Run: `cd D:/Ai/FindXAgents && npx prisma generate`
Expected: Prisma client generated

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add SmtpConfig and EmailSetting models for multi-provider email"
```

---

### Task 2: SMTP Provider

**Files:**
- Modify: `src/lib/email/providers/types.ts`
- Create: `src/lib/email/providers/smtp.ts`

- [ ] **Step 1: Update EmailProvider name union in types.ts**

In `src/lib/email/providers/types.ts`, change the name type from `"resend" | "gmail"` to `"resend" | "gmail" | "smtp"`:

```typescript
export interface EmailProvider {
  name: "resend" | "gmail" | "smtp";
  isConfigured(): boolean;
  send(params: SendParams): Promise<SendResult>;
}
```

- [ ] **Step 2: Install nodemailer**

Run: `cd D:/Ai/FindXAgents && npm install nodemailer && npm install -D @types/nodemailer`

- [ ] **Step 3: Create SMTP provider**

Create `src/lib/email/providers/smtp.ts`:

```typescript
import nodemailer from "nodemailer";
import type { EmailProvider, SendParams, SendResult } from "./types.js";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

export function createSmtpProvider(config: SmtpConfig): EmailProvider {
  return {
    name: "smtp",

    isConfigured(): boolean {
      return !!(config.host && config.user && config.password && config.fromEmail);
    },

    async send({ to, subject, html }: SendParams): Promise<SendResult> {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.password,
        },
      });

      const result = await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to,
        subject,
        html,
      });

      return {
        id: result.messageId ?? `smtp_${Date.now()}`,
        from: config.fromEmail,
        to,
      };
    },
  };
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd D:/Ai/FindXAgents && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/providers/types.ts src/lib/email/providers/smtp.ts package.json package-lock.json
git commit -m "feat: add SMTP email provider with nodemailer"
```

---

### Task 3: Provider Selection Logic

**Files:**
- Modify: `src/lib/email/client.ts`

- [ ] **Step 1: Rewrite client.ts with DB-backed provider selection**

Replace the entire content of `src/lib/email/client.ts`:

```typescript
import { prisma } from "../db/client.js";
import { createResendProvider } from "./providers/resend.js";
import { createGmailProvider } from "./providers/gmail.js";
import { createSmtpProvider } from "./providers/smtp.js";
import type { SmtpConfig } from "./providers/smtp.js";
import { getStoredTokens } from "./gmail-oauth.js";
import type { EmailProvider, SendResult } from "./providers/types.js";

let _cachedProvider: EmailProvider | null = null;

type ProviderName = "resend" | "gmail" | "smtp";

async function tryCreateProvider(name: ProviderName): Promise<EmailProvider | null> {
  switch (name) {
    case "gmail": {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;
      const tokens = await getStoredTokens();
      if (!tokens) return null;
      return createGmailProvider();
    }
    case "smtp": {
      const config = await prisma.smtpConfig.findUnique({ where: { id: "default" } });
      if (!config) return null;
      return createSmtpProvider({
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user,
        password: config.password,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
      });
    }
    case "resend": {
      if (!process.env.RESEND_API_KEY) return null;
      return createResendProvider();
    }
  }
}

async function getActiveProvider(): Promise<EmailProvider> {
  if (_cachedProvider) return _cachedProvider;

  // 1. Check user's preferred provider from DB
  const setting = await prisma.emailSetting.findUnique({ where: { id: "default" } });
  if (setting?.defaultProvider) {
    const provider = await tryCreateProvider(setting.defaultProvider as ProviderName);
    if (provider) {
      _cachedProvider = provider;
      return _cachedProvider;
    }
  }

  // 2. Auto-detect: Gmail if OAuth tokens exist, then Resend
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const tokens = await getStoredTokens();
    if (tokens) {
      _cachedProvider = createGmailProvider();
      return _cachedProvider;
    }
  }

  if (process.env.EMAIL_PROVIDER === "gmail") {
    _cachedProvider = createGmailProvider();
    return _cachedProvider;
  }

  _cachedProvider = createResendProvider();
  return _cachedProvider;
}

/** Clear the cached provider (call after config changes) */
export function resetProviderCache(): void {
  _cachedProvider = null;
}

export async function isEmailConfigured(): Promise<boolean> {
  const provider = await getActiveProvider();
  return provider.isConfigured();
}

export interface SendEmailResult {
  id: string;
  from: string;
  to: string;
  simulated?: boolean;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<SendEmailResult> {
  const provider = await getActiveProvider();
  const result: SendResult = await provider.send({ to, subject, html });
  return result;
}
```

- [ ] **Step 2: Verify prisma client import path is correct**

Run: `cd D:/Ai/FindXAgents && head -5 src/lib/db/client.ts`
Expected: See how prisma is exported (should be `export const prisma = ...`)

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd D:/Ai/FindXAgents && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/client.ts
git commit -m "feat: add DB-backed email provider selection with SMTP support"
```

---

### Task 4: API Routes

**Files:**
- Modify: `src/routes/index.ts`

- [ ] **Step 1: Add imports for SMTP provider and resetProviderCache**

At the top of `src/routes/index.ts`, add to the existing email imports:

```typescript
import { resetProviderCache } from "../lib/email/client.js";
```

Note: Check if `resetProviderCache` is already imported. If not, add it.

- [ ] **Step 2: Add SMTP config CRUD routes**

Insert before the AI Provider Settings section (before line 1493 `// ============================================================`). These routes go after the existing Gmail disconnect route:

```typescript
  // ─── SMTP Config ──────────────────────────────────────────────────

  // GET /api/email/smtp/config
  app.get("/api/email/smtp/config", async (_req, reply) => {
    const config = await prisma.smtpConfig.findUnique({ where: { id: "default" } });
    if (!config) {
      return reply.send({ configured: false });
    }
    return reply.send({
      configured: true,
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
    });
  });

  // PUT /api/email/smtp/config
  app.put("/api/email/smtp/config", async (req, reply) => {
    const schema = z.object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535).default(465),
      secure: z.boolean().default(true),
      user: z.string().min(1),
      password: z.string().min(1),
      fromEmail: z.string().email(),
      fromName: z.string().min(1).default("FindX"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const config = await prisma.smtpConfig.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
    });

    resetProviderCache();

    return reply.send({
      configured: true,
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
    });
  });

  // DELETE /api/email/smtp/config
  app.delete("/api/email/smtp/config", async (_req, reply) => {
    await prisma.smtpConfig.deleteMany({ where: { id: "default" } });
    resetProviderCache();
    return reply.send({ deleted: true });
  });

  // POST /api/email/smtp/test
  app.post("/api/email/smtp/test", async (req, reply) => {
    const config = await prisma.smtpConfig.findUnique({ where: { id: "default" } });
    if (!config) {
      return reply.status(400).send({ error: "SMTP not configured" });
    }

    try {
      const { createSmtpProvider } = await import("../lib/email/providers/smtp.js");
      const provider = createSmtpProvider({
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user,
        password: config.password,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
      });

      const result = await provider.send({
        to: config.fromEmail,
        subject: "FindX SMTP Test",
        html: "<p>This is a test email from FindX. If you received this, SMTP is configured correctly.</p>",
      });

      return reply.send({ success: true, messageId: result.id });
    } catch (err) {
      return reply.send({
        success: false,
        error: err instanceof Error ? err.message : "Test failed",
      });
    }
  });

  // ─── Email Settings (default provider) ─────────────────────────────

  // GET /api/email/settings
  app.get("/api/email/settings", async (_req, reply) => {
    const setting = await prisma.emailSetting.findUnique({ where: { id: "default" } });

    const hasGmailCredentials = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const gmailTokens = await getStoredTokens();
    const smtpConfig = await prisma.smtpConfig.findUnique({ where: { id: "default" } });
    const hasResendKey = !!process.env.RESEND_API_KEY;

    return reply.send({
      defaultProvider: setting?.defaultProvider ?? null,
      providers: {
        gmail: {
          configured: hasGmailCredentials,
          connected: !!gmailTokens,
          email: gmailTokens?.email ?? null,
        },
        smtp: {
          configured: !!smtpConfig,
          email: smtpConfig?.fromEmail ?? null,
        },
        resend: {
          configured: hasResendKey,
          email: process.env.EMAIL_FROM ?? null,
        },
      },
    });
  });

  // PUT /api/email/settings
  app.put("/api/email/settings", async (req, reply) => {
    const schema = z.object({
      defaultProvider: z.enum(["resend", "gmail", "smtp"]),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid provider. Must be resend, gmail, or smtp." });
    }

    await prisma.emailSetting.upsert({
      where: { id: "default" },
      update: { defaultProvider: parsed.data.defaultProvider },
      create: { id: "default", defaultProvider: parsed.data.defaultProvider },
    });

    resetProviderCache();

    return reply.send({ defaultProvider: parsed.data.defaultProvider });
  });
```

- [ ] **Step 3: Update the existing GET /api/email/provider/status route**

Replace the existing status route (lines 1393-1424) to also check SMTP:

```typescript
  // GET /api/email/provider/status
  app.get("/api/email/provider/status", async (_req, reply) => {
    const hasGmailCredentials = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const hasResendKey = !!process.env.RESEND_API_KEY;
    const storedTokens = await getStoredTokens();
    const smtpConfig = await prisma.smtpConfig.findUnique({ where: { id: "default" } });
    const setting = await prisma.emailSetting.findUnique({ where: { id: "default" } });

    let provider: string;
    let configured: boolean;
    let connected = false;
    let email: string | null = null;

    // Check user preference first
    if (setting?.defaultProvider) {
      provider = setting.defaultProvider;
      if (provider === "smtp" && smtpConfig) {
        configured = true;
        connected = true;
        email = smtpConfig.fromEmail;
      } else if (provider === "gmail" && hasGmailCredentials && storedTokens) {
        configured = true;
        connected = true;
        email = storedTokens.email;
      } else if (provider === "resend" && hasResendKey) {
        configured = true;
        connected = true;
        email = process.env.EMAIL_FROM || null;
      } else {
        // Fallback: preference set but provider not configured
        provider = "none";
        configured = false;
        connected = false;
      }
    } else if (hasGmailCredentials && storedTokens) {
      provider = "gmail";
      configured = true;
      connected = true;
      email = storedTokens.email;
    } else if (hasGmailCredentials && !storedTokens) {
      provider = "gmail";
      configured = true;
      connected = false;
    } else if (hasResendKey) {
      provider = "resend";
      configured = true;
      connected = true;
      email = process.env.EMAIL_FROM || null;
    } else {
      provider = "none";
      configured = false;
      connected = false;
    }

    return reply.send({ provider, configured, connected, email });
  });
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd D:/Ai/FindXAgents && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/routes/index.ts
git commit -m "feat: add SMTP config CRUD and email provider selection API routes"
```

---

### Task 5: Frontend Types and API Client

**Files:**
- Modify: `web/lib/types.ts`
- Modify: `web/lib/api.ts`

- [ ] **Step 1: Add EmailSettingsResponse and SmtpConfigResponse types to types.ts**

Add after the existing `EmailProviderStatus` interface (after line 235):

```typescript
export interface EmailSettingsResponse {
  defaultProvider: string | null;
  providers: {
    gmail: { configured: boolean; connected: boolean; email: string | null };
    smtp: { configured: boolean; email: string | null };
    resend: { configured: boolean; email: string | null };
  };
}

export interface SmtpConfigResponse {
  configured: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  fromEmail?: string;
  fromName?: string;
}
```

- [ ] **Step 2: Add API wrapper functions to api.ts**

Add the import for the new types at the top of `web/lib/api.ts`:

```typescript
import type {
  // ... existing imports ...
  EmailSettingsResponse,
  SmtpConfigResponse,
} from "./types";
```

Add after the existing email provider section (after `disconnectGmail`):

```typescript
// --- Email Settings ---

export function getEmailSettings(): Promise<EmailSettingsResponse> {
  return fetchApi("/email/settings");
}

export function setEmailSettings(defaultProvider: "resend" | "gmail" | "smtp"): Promise<{ defaultProvider: string }> {
  return fetchApi("/email/settings", {
    method: "PUT",
    body: JSON.stringify({ defaultProvider }),
  });
}

export function getSmtpConfig(): Promise<SmtpConfigResponse> {
  return fetchApi("/email/smtp/config");
}

export function saveSmtpConfig(data: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
}): Promise<SmtpConfigResponse> {
  return fetchApi("/email/smtp/config", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteSmtpConfig(): Promise<{ deleted: boolean }> {
  return fetchApi("/email/smtp/config", { method: "DELETE" });
}

export function testSmtpConfig(): Promise<{ success: boolean; error?: string; messageId?: string }> {
  return fetchApi("/email/smtp/test", { method: "POST" });
}
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd D:/Ai/FindXAgents/web && npx next build 2>&1 | tail -20`
Expected: Build succeeds (or only pre-existing warnings)

- [ ] **Step 4: Commit**

```bash
git add web/lib/types.ts web/lib/api.ts
git commit -m "feat: add frontend types and API client for SMTP email provider"
```

---

### Task 6: Settings UI

**Files:**
- Modify: `web/app/settings/page.tsx`

- [ ] **Step 1: Add new imports and state**

Add to the imports at the top of the file:

```typescript
import {
  // ... existing imports ...
  getEmailSettings,
  setEmailSettings,
  getSmtpConfig,
  saveSmtpConfig,
  deleteSmtpConfig,
  testSmtpConfig,
} from "../../lib/api";
import type {
  // ... existing imports ...
  EmailSettingsResponse,
  SmtpConfigResponse,
} from "../../lib/types";
```

Add new state variables after the existing email provider state (after line 87):

```typescript
  // Email settings state
  const [emailSettings, setEmailSettings] = useState<EmailSettingsResponse | null>(null);
  const [showSmtpForm, setShowSmtpForm] = useState(false);
  const [smtpForm, setSmtpForm] = useState({
    host: "mail.privateemail.com",
    port: 465,
    secure: true,
    user: "",
    password: "",
    fromEmail: "",
    fromName: "FindX",
  });
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; error?: string } | null>(null);
```

- [ ] **Step 2: Add loadEmailSettings callback**

Add after the existing `loadProviderStatus` callback (after line 108):

```typescript
  const loadEmailSettings = useCallback(async () => {
    try {
      const settings = await getEmailSettings();
      setEmailSettings(settings);
    } catch {
      // Settings endpoint might not be available yet
    }
  }, []);
```

- [ ] **Step 3: Update useEffect to also load email settings**

Change the useEffect (line 124-127) to also call `loadEmailSettings`:

```typescript
  useEffect(() => {
    loadProviderStatus();
    loadAiProviders();
    loadEmailSettings();
  }, [loadProviderStatus, loadAiProviders, loadEmailSettings]);
```

- [ ] **Step 4: Add SMTP form and provider selector handlers**

Add after the existing `handleDisconnectGmail` function (after line 177):

```typescript
  async function handleLoadSmtpConfig() {
    try {
      const config = await getSmtpConfig();
      if (config.configured) {
        setSmtpForm({
          host: config.host ?? "mail.privateemail.com",
          port: config.port ?? 465,
          secure: config.secure ?? true,
          user: config.user ?? "",
          password: "",
          fromEmail: config.fromEmail ?? "",
          fromName: config.fromName ?? "FindX",
        });
      }
    } catch {
      // ignore
    }
  }

  async function handleSaveSmtp() {
    setSmtpSaving(true);
    setProviderError(null);
    try {
      await saveSmtpConfig(smtpForm);
      setShowSmtpForm(false);
      await Promise.all([loadEmailSettings(), loadProviderStatus()]);
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : "Failed to save SMTP config");
    } finally {
      setSmtpSaving(false);
    }
  }

  async function handleTestSmtp() {
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const result = await testSmtpConfig();
      setSmtpTestResult(result);
    } catch (err) {
      setSmtpTestResult({ success: false, error: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setSmtpTesting(false);
    }
  }

  async function handleDeleteSmtp() {
    if (!confirm("Remove SMTP configuration?")) return;
    try {
      await deleteSmtpConfig();
      await Promise.all([loadEmailSettings(), loadProviderStatus()]);
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : "Failed to delete SMTP config");
    }
  }

  async function handleSetDefaultProvider(provider: "resend" | "gmail" | "smtp") {
    try {
      await setEmailSettings(provider);
      await Promise.all([loadEmailSettings(), loadProviderStatus()]);
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : "Failed to set provider");
    }
  }
```

- [ ] **Step 5: Replace the Email Provider section JSX**

Replace the entire `{/* Email Provider */}` section (lines 584-710) with:

```tsx
      {/* Email Provider */}
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-200">Email Provider</h3>
        </div>

        {emailSettings ? (
          <div className="space-y-3">
            {/* Provider Selector */}
            <div className="p-3 bg-slate-800 rounded-lg space-y-3">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Default Provider</p>
              <div className="flex gap-2">
                {(["gmail", "smtp", "resend"] as const).map((p) => {
                  const info = emailSettings.providers[p as keyof typeof emailSettings.providers];
                  const isActive = emailSettings.defaultProvider === p;
                  const label = p === "smtp" ? "SMTP" : p === "gmail" ? "Gmail" : "Resend";
                  return (
                    <button
                      key={p}
                      onClick={() => info.configured && handleSetDefaultProvider(p)}
                      disabled={!info.configured}
                      className={`flex-1 p-2.5 rounded-lg border text-sm transition-colors ${
                        isActive
                          ? "bg-blue-900/30 border-blue-700/50 text-blue-200"
                          : info.configured
                            ? "bg-slate-800/50 border-slate-700/50 text-slate-300 hover:border-slate-600"
                            : "bg-slate-800/30 border-slate-800/50 text-slate-600 cursor-not-allowed"
                      }`}
                    >
                      <span className="font-medium">{label}</span>
                      {!info.configured && (
                        <span className="block text-xs text-slate-600 mt-0.5">Not configured</span>
                      )}
                      {info.configured && info.email && (
                        <span className="block text-xs text-slate-500 mt-0.5 truncate">{info.email}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Gmail Card */}
            <div className="p-3 bg-slate-800/50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Gmail</p>
                {emailSettings.providers.gmail.connected && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-emerald-900/40 text-emerald-400 rounded-full">
                    Connected
                  </span>
                )}
              </div>
              {emailSettings.providers.gmail.configured ? (
                emailSettings.providers.gmail.connected ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm text-slate-300">
                        Connected as <span className="text-slate-100">{emailSettings.providers.gmail.email}</span>
                      </span>
                    </div>
                    <button
                      onClick={handleDisconnectGmail}
                      disabled={disconnecting}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 border border-red-800/50 rounded-lg hover:bg-red-900/30 disabled:opacity-50 transition-colors"
                    >
                      {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleConnectGmail}
                    disabled={connecting}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    {connecting ? "Connecting..." : "Connect Gmail"}
                  </button>
                )
              ) : (
                <p className="text-xs text-slate-500">
                  Set <code className="text-slate-600">GOOGLE_CLIENT_ID</code> and{" "}
                  <code className="text-slate-600">GOOGLE_CLIENT_SECRET</code> env vars to enable.
                </p>
              )}
            </div>

            {/* SMTP Card */}
            <div className="p-3 bg-slate-800/50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">SMTP</p>
                {emailSettings.providers.smtp.configured && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-emerald-900/40 text-emerald-400 rounded-full">
                    Configured
                  </span>
                )}
              </div>
              {emailSettings.providers.smtp.configured && !showSmtpForm ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-slate-300">
                      <span className="text-slate-100">{emailSettings.providers.smtp.email}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => { setShowSmtpForm(true); handleLoadSmtpConfig(); }}
                      className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors"
                      title="Edit SMTP config"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleDeleteSmtp}
                      className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                      title="Remove SMTP config"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : !showSmtpForm ? (
                <button
                  onClick={() => setShowSmtpForm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Configure SMTP
                </button>
              ) : null}

              {/* SMTP Form */}
              {showSmtpForm && (
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-300">SMTP Configuration</p>
                    <button onClick={() => setShowSmtpForm(false)} className="text-slate-400 hover:text-slate-200">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Host</label>
                      <input
                        type="text"
                        value={smtpForm.host}
                        onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                        placeholder="mail.privateemail.com"
                        className="w-full px-3 py-2 border border-slate-700 rounded-lg text-sm bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Port</label>
                      <input
                        type="number"
                        value={smtpForm.port}
                        onChange={(e) => setSmtpForm({ ...smtpForm, port: parseInt(e.target.value) || 465 })}
                        className="w-full px-3 py-2 border border-slate-700 rounded-lg text-sm bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Username (email)</label>
                    <input
                      type="text"
                      value={smtpForm.user}
                      onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value, fromEmail: e.target.value })}
                      placeholder="hello@fluxnetwork.nl"
                      className="w-full px-3 py-2 border border-slate-700 rounded-lg text-sm bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Password</label>
                    <input
                      type="password"
                      value={smtpForm.password}
                      onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
                      placeholder="Email password"
                      className="w-full px-3 py-2 border border-slate-700 rounded-lg text-sm bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">From Email</label>
                      <input
                        type="email"
                        value={smtpForm.fromEmail}
                        onChange={(e) => setSmtpForm({ ...smtpForm, fromEmail: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-700 rounded-lg text-sm bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">From Name</label>
                      <input
                        type="text"
                        value={smtpForm.fromName}
                        onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-700 rounded-lg text-sm bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={smtpForm.secure}
                        onChange={(e) => setSmtpForm({ ...smtpForm, secure: e.target.checked })}
                        className="rounded border-slate-600 bg-slate-800"
                      />
                      <span className="text-xs text-slate-400">Use SSL/TLS (port 465)</span>
                    </label>
                  </div>

                  {smtpTestResult && (
                    <p className={`text-xs flex items-center gap-1.5 ${smtpTestResult.success ? "text-emerald-400" : "text-red-400"}`}>
                      {smtpTestResult.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      {smtpTestResult.success ? "Test email sent successfully!" : `Test failed: ${smtpTestResult.error}`}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveSmtp}
                      disabled={smtpSaving || !smtpForm.host || !smtpForm.user || !smtpForm.password}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {smtpSaving ? "Saving..." : "Save Configuration"}
                    </button>
                    <button
                      onClick={handleTestSmtp}
                      disabled={smtpTesting}
                      className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-600 disabled:opacity-50 transition-colors"
                    >
                      {smtpTesting ? "Sending..." : "Test Connection"}
                    </button>
                    <button
                      onClick={() => setShowSmtpForm(false)}
                      className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Resend Card */}
            <div className="p-3 bg-slate-800/50 rounded-lg space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Resend</p>
                {emailSettings.providers.resend.configured && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-emerald-900/40 text-emerald-400 rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {emailSettings.providers.resend.configured ? (
                  <>Configured with <span className="text-slate-300">{emailSettings.providers.resend.email || "default address"}</span>. Set via <code className="text-slate-600">RESEND_API_KEY</code> env var.</>
                ) : (
                  <>Set <code className="text-slate-600">RESEND_API_KEY</code> env var to enable.</>
                )}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Loading email provider status...</p>
        )}

        {providerError && (
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {providerError}
          </p>
        )}
      </div>
```

- [ ] **Step 6: Verify frontend builds**

Run: `cd D:/Ai/FindXAgents/web && npx next build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add web/app/settings/page.tsx
git commit -m "feat: add provider selector, SMTP config form, and multi-provider status cards to Settings UI"
```

---

### Task 7: Integration Verification

- [ ] **Step 1: Run TypeScript check on backend**

Run: `cd D:/Ai/FindXAgents && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run existing tests**

Run: `cd D:/Ai/FindXAgents && npm test 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 3: Run frontend build**

Run: `cd D:/Ai/FindXAgents/web && npx next build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Manual smoke test**

1. Start dev servers: `npm run dev` and `npm run dev:web`
2. Navigate to Settings page
3. Verify all three provider cards display
4. Click "Configure SMTP", fill in Namecheap details
5. Click "Test Connection" — verify test email arrives
6. Select SMTP as default provider
7. Trigger an outreach send — verify it uses SMTP
