/**
 * Email Scheduler Worker
 * Checks for scheduled emails and sends them at the right time
 */

import { createWorker } from "../lib/queue/index.js";
import { QUEUE_NAMES } from "./queues.js";
import { sendTelegramNotification, getDefaultTelegramConfig } from "../lib/notifications/telegram.js";
import { sendEmail } from "../lib/email/client.js";
import { prisma } from "../lib/db/client.js";

export interface SchedulerJobData {
  checkScheduledEmails: boolean;
}

export async function startSchedulerWorker() {
  const schedulerWorker = createWorker<SchedulerJobData>(
    QUEUE_NAMES.EMAIL_SCHEDULER,
    async (job) => {
      console.log(`[Scheduler] Checking for scheduled emails...`);

      const now = new Date();

      // Find all scheduled emails that should be sent now
      const scheduledEmails = await prisma.outreach.findMany({
        where: {
          scheduledAt: {
            lte: now,
          },
          sentAt: null,
          status: "scheduled",
        },
        include: {
          lead: true,
        },
      });

      console.log(`[Scheduler] Found ${scheduledEmails.length} emails to send`);

      let succeeded = 0;
      let failed = 0;

      for (const email of scheduledEmails) {
        try {
          if (!email.lead.email) {
            console.warn(`[Scheduler] Skipping email ${email.id}: lead has no email address`);
            continue;
          }

          await sendEmail(email.lead.email, email.subject, email.body);

          await prisma.outreach.update({
            where: { id: email.id },
            data: {
              status: "sent",
              sentAt: new Date(),
            },
          });

          // Send Telegram notification (fire-and-forget)
          const telegramConfig = getDefaultTelegramConfig();
          if (telegramConfig.botToken && telegramConfig.chatId) {
            sendTelegramNotification(telegramConfig, {
              type: "scheduled",
              leadEmail: email.lead.email,
              leadName: email.lead.businessName || undefined,
              company: email.lead.industry || undefined,
            }).catch((err) => console.error("[Scheduler] Telegram notification failed:", err));
          }

          succeeded++;
          console.log(`[Scheduler] Sent scheduled email to ${email.lead.email}`);
        } catch (error) {
          failed++;
          console.error(`[Scheduler] Failed to send email to ${email.lead.email}:`, error);
        }
      }

      if (failed > 0) {
        throw new Error(`Failed to send ${failed}/${scheduledEmails.length} scheduled emails`);
      }

      return { processed: succeeded };
    }
  );

  schedulerWorker.on("completed", (job) => {
    console.log(`[Scheduler] Job ${job.id} completed`);
  });

  schedulerWorker.on("failed", (job, err) => {
    console.error(`[Scheduler] Job ${job?.id} failed:`, err);
  });

  return schedulerWorker;
}

/**
 * Schedule an email for later
 */
export async function scheduleEmail(outreachId: string, sendAt: Date): Promise<{ success: boolean; error?: string }> {
  try {
    const outreach = await prisma.outreach.findUnique({
      where: { id: outreachId },
      include: { lead: true },
    });

    if (!outreach) {
      return { success: false, error: "Outreach not found" };
    }

    await prisma.outreach.update({
      where: { id: outreachId },
      data: {
        scheduledAt: sendAt,
        status: "scheduled",
      },
    });

    console.log(`[Scheduler] Scheduled email to ${outreach.lead.email} for ${sendAt}`);
    return { success: true };
  } catch (error) {
    console.error("[Scheduler] Failed to schedule email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
