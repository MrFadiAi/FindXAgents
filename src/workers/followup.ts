/**
 * Auto Follow-up Worker
 * Sends follow-up emails after 3 days if no response, using the existing outreach pipeline.
 */

import { createWorker } from "../lib/queue/index.js";
import { QUEUE_NAMES } from "./queues.js";
import { sendTelegramNotification, getDefaultTelegramConfig } from "../lib/notifications/telegram.js";
import { sendOutreach } from "../modules/outreach/outreach.service.js";
import { prisma } from "../lib/db/client.js";

export interface FollowUpJobData {
  checkFollowUps: boolean;
}

const FOLLOW_UP_DELAY_DAYS = 3;
const MAX_FOLLOW_UPS = 2;

export async function startFollowUpWorker() {
  const followUpWorker = createWorker<FollowUpJobData>(
    QUEUE_NAMES.EMAIL_FOLLOWUP,
    async (job) => {
      console.log(`[FollowUp] Checking for follow-up emails...`);

      const now = new Date();
      const followUpDate = new Date(now);
      followUpDate.setDate(followUpDate.getDate() - FOLLOW_UP_DELAY_DAYS);

      // Find emails sent 3+ days ago with no opens, replies, or follow-ups
      const emailsNeedingFollowUp = await prisma.outreach.findMany({
        where: {
          sentAt: {
            lte: followUpDate,
          },
          status: "sent",
          openedAt: null,
          repliedAt: null,
          followUpCount: {
            lt: MAX_FOLLOW_UPS,
          },
        },
        include: {
          lead: true,
        },
      });

      console.log(`[FollowUp] Found ${emailsNeedingFollowUp.length} emails needing follow-up`);

      for (const email of emailsNeedingFollowUp) {
        try {
          const newFollowUpCount = (email.followUpCount || 0) + 1;

          // Create a new follow-up Outreach record using the existing template
          const followUp = await prisma.outreach.create({
            data: {
              leadId: email.leadId,
              status: "approved",
              subject: `Re: ${email.subject}`,
              body: `Hi ${email.lead.businessName},\n\nI wanted to follow up on my previous email. Let me know if you have any questions.\n\nBest regards`,
              personalizedDetails: {
                originalOutreachId: email.id,
                followUpNumber: newFollowUpCount,
              },
            },
          });

          // Send through the existing pipeline
          const result = await sendOutreach(followUp.id);

          // Update the original outreach's follow-up tracking
          await prisma.outreach.update({
            where: { id: email.id },
            data: {
              followUpCount: newFollowUpCount,
              lastFollowUpAt: new Date(),
            },
          });

          // Send Telegram notification
          const telegramConfig = getDefaultTelegramConfig();
          if (telegramConfig) {
            const notifResult = await sendTelegramNotification(telegramConfig, {
              type: "followup",
              leadEmail: email.lead.email || "unknown",
              company: email.lead.businessName || undefined,
              additionalInfo: `Follow-up #${newFollowUpCount} — ${result.sent ? "sent" : "failed"}`,
            });
            if (!notifResult.success) {
              console.warn(`[FollowUp] Telegram notification failed for ${email.lead.email}: ${notifResult.error}`);
            }
          }

          console.log(`[FollowUp] ${result.sent ? "Sent" : "Failed"} follow-up #${newFollowUpCount} to ${email.lead.email}`);
        } catch (error) {
          console.error(`[FollowUp] Failed to send follow-up to ${email.lead.email}:`, error);
          // Mark failed follow-ups so they don't become orphans
          if (followUp) {
            await prisma.outreach.update({
              where: { id: followUp.id },
              data: { status: "failed" },
            }).catch(() => {});
          }
        }
      }

      return { processed: emailsNeedingFollowUp.length };
    }
  );

  followUpWorker.on("completed", (job) => {
    console.log(`[FollowUp] Job ${job.id} completed`);
  });

  followUpWorker.on("failed", (job, err) => {
    console.error(`[FollowUp] Job ${job?.id} failed:`, err);
  });

  return followUpWorker;
}

/**
 * Set up the repeatable follow-up job (call once on server boot).
 */
export async function setupFollowUpCron() {
  const { emailFollowUpQueue } = await import("./queues.js");
  await emailFollowUpQueue.add("check-followups", { checkFollowUps: true }, {
    repeat: { every: 300_000 },
  });
  console.log("[FollowUp] Repeatable job configured (every 5m)");
}
