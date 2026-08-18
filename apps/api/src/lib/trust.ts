import { prisma } from "../db.js";

export async function recomputeVenueTrust(venueId: string) {
  const recent = await prisma.redemptionFeedback.findMany({
    where: { redemption: { deal: { restaurantId: venueId } } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { wasHonored: true },
  });
  const honestyRate = recent.length ? recent.filter((item) => item.wasHonored).length / recent.length * 100 : null;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentNoCount = await prisma.redemptionFeedback.count({
    where: { wasHonored: false, createdAt: { gte: sevenDaysAgo }, redemption: { deal: { restaurantId: venueId } } },
  });
  const reasons: string[] = [];
  if (recent.length >= 5 && honestyRate != null && honestyRate < 80) reasons.push(`Rolling honesty rate is ${honestyRate.toFixed(0)}% over the last ${recent.length} responses.`);
  if (recentNoCount >= 3) reasons.push(`${recentNoCount} customers reported an offer was not honored in the last 7 days.`);
  if (reasons.length) {
    const existing = await prisma.venueTrustFlag.findFirst({ where: { venueId, status: "OPEN" } });
    if (!existing) await prisma.venueTrustFlag.create({ data: { venueId, reason: reasons.join(" ") } });
    else await prisma.venueTrustFlag.update({ where: { id: existing.id }, data: { reason: reasons.join(" ") } });
  }
  const [redemptionCount, openFlagCount, venue] = await Promise.all([
    prisma.redemption.count({ where: { redeemedAt: { not: null }, deal: { restaurantId: venueId } } }),
    prisma.venueTrustFlag.count({ where: { venueId, status: "OPEN" } }),
    prisma.restaurant.findUnique({ where: { id: venueId }, select: { trustedBadgeRevoked: true } }),
  ]);
  const isVerifiedTrusted = !venue?.trustedBadgeRevoked && redemptionCount >= 10 && honestyRate != null && honestyRate > 90 && openFlagCount === 0;
  await prisma.restaurant.update({ where: { id: venueId }, data: { honestyRate, isVerifiedTrusted } });
  return { honestyRate, redemptionCount, openFlagCount, isVerifiedTrusted };
}

export async function recomputeAllVenueTrust() {
  const venues = await prisma.restaurant.findMany({ select: { id: true } });
  for (const venue of venues) await recomputeVenueTrust(venue.id);
}
