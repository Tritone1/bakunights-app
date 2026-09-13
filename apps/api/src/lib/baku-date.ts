const BAKU_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

export function bakuDate(now = new Date()) {
  const shifted = new Date(now.getTime() + BAKU_UTC_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}
