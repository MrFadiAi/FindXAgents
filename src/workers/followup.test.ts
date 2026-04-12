import { describe, it, expect } from 'vitest';
import { shouldSendFollowUp } from './followup.js';

describe('shouldSendFollowUp', () => {
  const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

  it('returns false when sentAt is null', () => {
    expect(shouldSendFollowUp({ sentAt: null, openedAt: null, repliedAt: null, followUpCount: 0 })).toBe(false);
  });

  it('returns false when email was opened', () => {
    expect(shouldSendFollowUp({ sentAt: daysAgo(5), openedAt: new Date(), repliedAt: null, followUpCount: 0 })).toBe(false);
  });

  it('returns false when email was replied to', () => {
    expect(shouldSendFollowUp({ sentAt: daysAgo(5), openedAt: null, repliedAt: new Date(), followUpCount: 0 })).toBe(false);
  });

  it('returns false when sent less than 3 days ago', () => {
    expect(shouldSendFollowUp({ sentAt: daysAgo(2), openedAt: null, repliedAt: null, followUpCount: 0 })).toBe(false);
  });

  it('returns false when followUpCount >= MAX_FOLLOW_UPS (2)', () => {
    expect(shouldSendFollowUp({ sentAt: daysAgo(5), openedAt: null, repliedAt: null, followUpCount: 2 })).toBe(false);
  });

  it('returns true when eligible: 3+ days, no open/reply, count < 2', () => {
    expect(shouldSendFollowUp({ sentAt: daysAgo(3), openedAt: null, repliedAt: null, followUpCount: 0 })).toBe(true);
  });

  it('returns true at boundary: exactly 3 days, 1 follow-up', () => {
    expect(shouldSendFollowUp({ sentAt: daysAgo(3), openedAt: null, repliedAt: null, followUpCount: 1 })).toBe(true);
  });

  it('handles null followUpCount as 0', () => {
    expect(shouldSendFollowUp({ sentAt: daysAgo(5), openedAt: null, repliedAt: null, followUpCount: null })).toBe(true);
  });
});
