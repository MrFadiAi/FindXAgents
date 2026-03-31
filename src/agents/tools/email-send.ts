import { sendEmail } from "../../lib/email/client.js";
import type { Tool } from "../core/types.js";

export const sendEmailTool: Tool = {
  name: "send_email",
  description:
    "Send an email to a recipient. Only use when the user has explicitly approved sending.",
  input_schema: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: "Recipient email address",
      },
      subject: {
        type: "string",
        description: "Email subject line",
      },
      html: {
        type: "string",
        description: "HTML body of the email",
      },
    },
    required: ["to", "subject", "html"],
  },
  async execute(input: Record<string, unknown>) {
    try {
      const result = await sendEmail(
        input.to as string,
        input.subject as string,
        input.html as string,
      );
      return JSON.stringify({ success: true, result: String(result) });
    } catch (err) {
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
