/**
 * Email Scheduler Worker
 * Checks for scheduled emails and sends them at the right time.
 */

import { createWorker } from "../lib/queue/index.js";
import { QUEUE_NAMES, emailSchedulerQueue } from "./queues.js";
import { sendTelegramNotification, getDefaultTelegramConfig } from "../lib/notifications/telegram.js";
import { prisma } from "../lib/db/index.js";

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

      for (const email of scheduledEmails) {
        try {
          // Mark as sent (TODO: integrate with actual email sending service)
          await prisma.outreach.update({
            where: { id: email.id },
            data: {
              status: "sent",
              sentAt: new Date(),
            },
          });

          // Send Telegram notification
          const telegramConfig = getDefaultTelegramConfig();
          if (telegramConfig) {
            const notifResult = await sendTelegramNotification(telegramConfig, {
              type: "scheduled",
              leadEmail: email.lead.email || "unknown",
              company: email.lead.businessName || undefined,
            });
            if (!notifResult.success) {
              console.warn(`[Scheduler] Telegram notification failed for ${email.lead.email}: ${notifResult.error}`);
            }
          }

          console.log(`[Scheduler] Sent scheduled email to ${email.lead.email}`);
        } catch (error) {
          console.error(`[Scheduler] Failed to send email to ${email.lead.email}:`, error);
          // Mark as failed so the scheduler doesn't retry indefinitely
          await prisma.outreach.update({
            where: { id: email.id },
            data: { status: "failed" },
          }).catch(() => {});
        }
      }

      return { processed: scheduledEmails.length };
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
 * Set up the repeatable scheduler job (call once on server boot).
 */
export async function setupSchedulerCron() {
  await emailSchedulerQueue.add("check-pending", { checkScheduledEmails: true }, {
    repeat: { every: 60_000 },
  });
  console.log("[Scheduler] Repeatable job configured (every 60s)");
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

    const allowedStatuses = ["draft", "pending_approval", "approved"];
    if (!allowedStatuses.includes(outreach.status)) {
      return { success: false, error: `Cannot schedule outreach with status "${outreach.status}"` };
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
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
