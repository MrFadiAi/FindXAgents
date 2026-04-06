# SMTP Email Provider Design

**Date**: 2026-04-06
**Status**: Approved

## Goal

Add a generic SMTP email provider so users can send outreach emails from any SMTP server (e.g. Namecheap PrivateEmail at `hello@fluxnetwork.nl`) alongside the existing Gmail and Resend providers. Users choose the active provider as a global default in Settings.

## Approach

Minimal extension of the existing provider strategy pattern. Two new Prisma models, one new provider file, updated selection logic in `client.ts`, new API routes, and an updated Settings UI.

---

## 1. Database Changes

### `SmtpConfig` model

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
```

### `EmailSetting` model

```prisma
model EmailSetting {
  id              String  @id @default("default")
  defaultProvider String? // "resend" | "gmail" | "smtp"
  updatedAt       DateTime @updatedAt
}
```

Single-row models (`id` always `"default"`). No migration needed for existing `EmailProviderToken` model.

---

## 2. SMTP Provider Implementation

### New file: `src/lib/email/providers/smtp.ts`

Uses `nodemailer` for SMTP transport.

```typescript
interface SmtpConfig {
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
    async send(params: SendParams): Promise<SendResult> {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.password },
      });
      const result = await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      return { success: true, messageId: result.messageId };
    },
  };
}
```

### Updated `src/lib/email/providers/types.ts`

Name union expanded from `"resend" | "gmail"` to `"resend" | "gmail" | "smtp"`.

---

## 3. Provider Selection Logic

`getActiveProvider()` in `src/lib/email/client.ts` modified to:

1. Check `EmailSetting` table for user's chosen default provider
2. Validate the chosen provider is configured (tokens exist for Gmail, row exists for SMTP, env var for Resend)
3. Fall back to current auto-detection if no preference or chosen provider unconfigured

New helper `tryCreateProvider(name)` validates config before returning a provider instance.

`resetProviderCache()` called whenever the default provider changes or SMTP config is updated.

---

## 4. API Routes

New routes in `src/routes/index.ts`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/email/smtp/config` | Return SMTP config (password masked) |
| PUT | `/api/email/smtp/config` | Upsert SMTP config |
| DELETE | `/api/email/smtp/config` | Remove SMTP config |
| POST | `/api/email/smtp/test` | Send test email, return success/error |
| GET | `/api/email/settings` | Return default provider + all providers' configured status |
| PUT | `/api/email/settings` | Set default provider, clear provider cache |

Existing Gmail and Resend routes unchanged.

---

## 5. Settings UI

Updates to `web/app/settings/page.tsx`:

- **Provider selector dropdown** — three options (Gmail, SMTP, Resend), each showing configured/not-configured badge. Only configured providers selectable.
- **SMTP configuration form** — host (default `mail.privateemail.com`), port (default `465`), secure toggle, username, password (masked), from email, from name, "Test Connection" button.
- **Provider status cards** — Gmail shows connected email + disconnect, SMTP shows configured email + edit/remove, Resend shows env-based status (read-only).
- **Layout** — selector at top, active provider card expanded, others collapsed. SMTP form appears in-place when editing.
