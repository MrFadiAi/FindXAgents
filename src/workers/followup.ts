/**
 * Auto Follow-up Worker
 * Sends follow-up emails after 3 days if no response
 */

import { createWorker } from "../lib/queue/index.js";
import { QUEUE_NAMES } from "./queues.js";
import { sendTelegramNotification, getDefaultTelegramConfig } from "../lib/notifications/telegram.js";
import { sendEmail } from "../lib/email/client.js";
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
          if (!email.lead.email) {
            console.warn(`[FollowUp] Skipping email ${email.id}: lead has no email address`);
            continue;
          }

          const newFollowUpCount = (email.followUpCount || 0) + 1;

          await sendEmail(email.lead.email, email.subject, email.body);

          await prisma.outreach.update({
            where: { id: email.id },
            data: {
              followUpCount: newFollowUpCount,
              lastFollowUpAt: new Date(),
            },
          });

          // Send Telegram notification (fire-and-forget)
          const telegramConfig = getDefaultTelegramConfig();
          if (telegramConfig.botToken && telegramConfig.chatId) {
            sendTelegramNotification(telegramConfig, {
              type: "followup",
              leadEmail: email.lead.email,
              leadName: email.lead.businessName || undefined,
              company: email.lead.industry || undefined,
              additionalInfo: `Follow-up #${newFollowUpCount}`,
            }).catch((err) => console.error("[FollowUp] Telegram notification failed:", err));
          }

          console.log(`[FollowUp] Sent follow-up #${newFollowUpCount} to ${email.lead.email}`);
        } catch (error) {
          console.error(`[FollowUp] Failed to send follow-up to ${email.lead.email}:`, error);
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
 * Check if a lead should receive a follow-up
 */
export function shouldSendFollowUp(outreach: {
  sentAt: Date | null;
  openedAt: Date | null;
  repliedAt: Date | null;
  followUpCount: number | null;
}): boolean {
  if (!outreach.sentAt) return false;
  if (outreach.openedAt || outreach.repliedAt) return false;

  const daysSinceSent = Math.floor(
    (Date.now() - outreach.sentAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const currentFollowUps = outreach.followUpCount || 0;

  return daysSinceSent >= FOLLOW_UP_DELAY_DAYS && currentFollowUps < MAX_FOLLOW_UPS;
}
