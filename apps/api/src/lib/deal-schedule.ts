const BAKU_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Moves an offer onto the current/next Baku calendar day without changing its
 * original wall-clock hours. If today's window is already over, the next
 * day's window is returned. Windows that cross midnight keep doing so.
 */
export function rescheduleDealWindow(startsAt: Date, endsAt: Date, now = new Date()) {
  const durationMs = endsAt.getTime() - startsAt.getTime();
  if (durationMs <= 0) throw new RangeError("Offer end time must be after its start time.");

  const originalStartInBaku = new Date(startsAt.getTime() + BAKU_UTC_OFFSET_MS);
  const nowInBaku = new Date(now.getTime() + BAKU_UTC_OFFSET_MS);
  let nextStartsAt = new Date(Date.UTC(
    nowInBaku.getUTCFullYear(),
    nowInBaku.getUTCMonth(),
    nowInBaku.getUTCDate(),
    originalStartInBaku.getUTCHours(),
    originalStartInBaku.getUTCMinutes(),
    originalStartInBaku.getUTCSeconds(),
    originalStartInBaku.getUTCMilliseconds(),
  ) - BAKU_UTC_OFFSET_MS);
  let nextEndsAt = new Date(nextStartsAt.getTime() + durationMs);

  if (nextEndsAt <= now) {
    const daysToAdvance = Math.floor((now.getTime() - nextEndsAt.getTime()) / DAY_MS) + 1;
    nextStartsAt = new Date(nextStartsAt.getTime() + daysToAdvance * DAY_MS);
    nextEndsAt = new Date(nextEndsAt.getTime() + daysToAdvance * DAY_MS);
  }

  return { startsAt: nextStartsAt, endsAt: nextEndsAt };
}
