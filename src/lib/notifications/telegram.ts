/**
 * Telegram Notification Service
 * Sends notifications for email events (sent, opened, replied, etc.)
 */

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

interface NotificationPayload {
  type: 'sent' | 'opened' | 'reply' | 'bounce' | 'failed' | 'scheduled' | 'followup';
  leadEmail: string;
  leadName?: string;
  company?: string;
  timestamp?: Date;
  additionalInfo?: string;
}

const EMOJI_MAP = {
  sent: '✅',
  opened: '📧',
  reply: '💬',
  bounce: '⚠️',
  failed: '❌',
  scheduled: '⏰',
  followup: '🔄',
};

const TITLE_MAP = {
  sent: 'Email Sent',
  opened: 'Email Opened',
  reply: 'Reply Received',
  bounce: 'Email Bounced',
  failed: 'Email Failed',
  scheduled: 'Scheduled Email Sent',
  followup: 'Follow-up Sent',
};

/**
 * Send a notification to Telegram
 */
export async function sendTelegramNotification(
  config: TelegramConfig,
  payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
  const { botToken, chatId } = config;
  const { type, leadEmail, leadName, company, timestamp, additionalInfo } = payload;

  if (!botToken || !chatId) {
    return { success: false, error: 'Telegram configuration missing' };
  }

  const emoji = EMOJI_MAP[type];
  const title = TITLE_MAP[type];
  const time = timestamp || new Date();

  const message = `
${emoji} *${title}*

📧 *Email:* ${leadEmail}
${leadName ? `👤 *Name:* ${leadName}\n` : ''}${company ? `🏢 *Company:* ${company}\n` : ''}${additionalInfo ? `📝 *Info:* ${additionalInfo}\n` : ''}
🕐 *Time:* ${time.toLocaleString('en-US', { timeZone: 'Africa/Casablanca' })}
`.trim();

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      }
    );

    const data = await response.json();

    if (!data.ok) {
      return { success: false, error: data.description };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test Telegram configuration
 */
export async function testTelegramConnection(
  config: TelegramConfig
): Promise<{ success: boolean; error?: string }> {
  return sendTelegramNotification(config, {
    type: 'sent',
    leadEmail: 'test@example.com',
    leadName: 'Test User',
    company: 'Test Company',
    additionalInfo: 'This is a test notification',
  });
}

/**
 * Get default Telegram configuration from environment
 */
export function getDefaultTelegramConfig(): TelegramConfig {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  };
}
