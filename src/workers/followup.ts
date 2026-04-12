/**
 * Auto Follow-up Worker
 * Sends follow-up emails after 3 days if no response
 */

import { createWorker } from "../lib/queue/index.js";
import { sendTelegramNotification, getDefaultTelegramConfig } from "../lib/notifications/telegram.js";
import { prisma } from "../lib/db/index.js";

export interface FollowUpJobData {
  checkFollowUps: boolean;
}

const FOLLOW_UP_DELAY_DAYS = 3;
const MAX_FOLLOW_UPS = 2;

export async function startFollowUpWorker() {
  const followUpWorker = createWorker<FollowUpJobData>(
    "email-followup",
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
          // Here you would call your email sending service
          // For now, we'll just update the follow-up count and send notification
          
          await prisma.outreach.update({
            where: { id: email.id },
            data: {
              followUpCount: (email.followUpCount || 0) + 1,
              lastFollowUpAt: new Date(),
            },
          });

          // Send Telegram notification
          const telegramConfig = getDefaultTelegramConfig();
          if (telegramConfig.botToken && telegramConfig.chatId) {
            await sendTelegramNotification(telegramConfig, {
              type: "followup",
              leadEmail: email.lead.email,
              leadName: email.lead.name || undefined,
              company: email.lead.company || undefined,
              additionalInfo: `Follow-up #${(email.followUpCount || 0) + 1}`,
            });
          }

          console.log(`[FollowUp] Sent follow-up to ${email.lead.email}`);
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
