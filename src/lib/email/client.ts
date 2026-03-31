import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM || "findx@example.com";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

/**
 * Check whether email sending is configured (RESEND_API_KEY is set).
 */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export interface SendEmailResult {
  id: string;
  from: string;
  to: string;
  /** True when Resend was not configured and the email was simulated */
  simulated?: boolean;
}

/**
 * Send an email via Resend.
 *
 * If RESEND_API_KEY is not configured the call is **not** an error — instead
 * the function logs a warning and returns a mock success response so callers
 * can continue their workflow (e.g. saving the outreach as "saved" rather than
 * failing outright).
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<SendEmailResult> {
  const client = getResend();

  if (!client) {
    console.warn(
      "[Email] RESEND_API_KEY not configured — email sending is disabled. " +
      `Simulated send to=${to} subject="${subject}"`,
    );
    return {
      id: `simulated_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from: FROM,
      to,
      simulated: true,
    };
  }

  const result = await client.emails.send({
    from: FROM,
    to,
    subject,
    html,
  });

  return {
    id: result.data?.id ?? "unknown",
    from: FROM,
    to,
  };
}
