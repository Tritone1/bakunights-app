import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { LocalizedText as Text } from "@/src/LocalizedText";
import { displayFont, palette } from "@/src/theme";
import type { Deal } from "@/src/types";

type Visit = { id: string; redemptionCode: string; claimedAt: string; redeemedAt: string | null; deal: Deal };

export default function VisitsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (!user || user.role !== "CONSUMER") { setLoading(false); return; }
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const result = await api<{ redemptions: Visit[] }>("/users/me/redemptions");
      setVisits(result.redemptions);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load your visits."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  if (authLoading) return <SafeAreaView style={styles.center}><ActivityIndicator color={palette.gold} /></SafeAreaView>;
  if (!user) return <SafeAreaView style={styles.safe}><View style={styles.guest}><View style={styles.guestIcon}><Ionicons name="time-outline" size={32} color={palette.gold} /></View><Text style={styles.guestTitle}>Your visits, all together</Text><Text style={styles.guestCopy}>Log in to see the offers you claimed and the venues that verified your visits.</Text><Pressable onPress={() => router.push("/login/customer" as never)} style={styles.primary}><Text style={styles.primaryText}>Customer login</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.gold} />} contentContainerStyle={styles.content}>
    <View style={styles.heading}><Text style={styles.eyebrow}>YOUR ACTIVITY</Text><Text style={styles.title}>My last visits</Text><Text style={styles.subtitle}>A history of your claimed offers and merchant-verified visits.</Text></View>
    {loading ? <ActivityIndicator color={palette.gold} style={styles.loader} /> : error ? <Pressable onPress={() => void load()} style={styles.message}><Ionicons name="alert-circle" size={19} color="#fca5a5" /><Text style={styles.error}>{error} Tap to retry.</Text></Pressable> : visits.length ? <View style={styles.timeline}>{visits.map((visit, index) => {
      const verified = Boolean(visit.redeemedAt);
      const date = new Date(visit.redeemedAt || visit.claimedAt);
      return <Pressable key={visit.id} onPress={() => router.push({ pathname: "/deals/[id]", params: { id: visit.deal.id } } as never)} style={styles.visitRow}>
        <View style={styles.rail}><View style={[styles.timelineDot, verified && styles.timelineDotVerified]}><Ionicons name={verified ? "checkmark" : "time"} size={14} color={verified ? palette.night : palette.gold} /></View>{index < visits.length - 1 ? <View style={styles.line} /> : null}</View>
        <View style={styles.card}><View style={styles.cardTop}><Text style={styles.date}>{date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</Text><View style={[styles.status, verified && styles.statusVerified]}><Text style={[styles.statusText, verified && styles.statusTextVerified]}>{verified ? "VERIFIED VISIT" : "QR READY"}</Text></View></View><Text style={styles.offerTitle}>{visit.deal.title}</Text><View style={styles.venueRow}><Ionicons name="storefront-outline" size={14} color={palette.cyan} /><Text style={styles.venue}>{visit.deal.restaurant.name}</Text></View><View style={styles.codeRow}><Text style={styles.code}>{visit.redemptionCode}</Text><Ionicons name="chevron-forward" size={17} color={palette.muted} /></View></View>
      </Pressable>;
    })}</View> : <View style={styles.empty}><Ionicons name="footsteps-outline" size={33} color={palette.gold} /><Text style={styles.emptyTitle}>No visits yet</Text><Text style={styles.emptyCopy}>Claim an offer at a venue and it will appear here. Once the merchant scans your QR, it becomes a verified visit.</Text><Pressable onPress={() => router.push("/(tabs)" as never)} style={styles.primary}><Text style={styles.primaryText}>Explore offers</Text></Pressable></View>}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.night }, center: { flex: 1, backgroundColor: palette.night, alignItems: "center", justifyContent: "center" }, content: { padding: 18, paddingBottom: 40 }, heading: { paddingTop: 19, paddingBottom: 24 }, eyebrow: { color: palette.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.9 }, title: { color: palette.white, fontFamily: displayFont, fontSize: 38, fontWeight: "700", marginTop: 5 }, subtitle: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 7 }, loader: { marginTop: 70 }, timeline: { gap: 0 }, visitRow: { flexDirection: "row", gap: 12 }, rail: { width: 31, alignItems: "center" }, timelineDot: { width: 31, height: 31, borderRadius: 16, borderWidth: 1, borderColor: "rgba(245,158,11,.4)", backgroundColor: "rgba(245,158,11,.1)", alignItems: "center", justifyContent: "center", zIndex: 1 }, timelineDotVerified: { backgroundColor: palette.gold, borderColor: palette.gold }, line: { width: 1, flex: 1, minHeight: 24, backgroundColor: "rgba(255,255,255,.12)" }, card: { flex: 1, borderRadius: 19, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 15, marginBottom: 13 }, cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, date: { color: palette.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 }, status: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(245,158,11,.3)", backgroundColor: "rgba(245,158,11,.08)", paddingHorizontal: 8, paddingVertical: 5 }, statusVerified: { borderColor: "rgba(16,185,129,.3)", backgroundColor: "rgba(16,185,129,.09)" }, statusText: { color: palette.gold, fontSize: 7, fontWeight: "900" }, statusTextVerified: { color: "#6ee7b7" }, offerTitle: { color: palette.white, fontSize: 16, lineHeight: 21, fontWeight: "800", marginTop: 11 }, venueRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 9 }, venue: { color: palette.cyan, fontSize: 11, fontWeight: "700" }, codeRow: { borderTopWidth: 1, borderTopColor: palette.line, marginTop: 13, paddingTop: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, code: { color: palette.goldSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  guest: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28 }, guestIcon: { width: 68, height: 68, borderRadius: 24, backgroundColor: "rgba(245,158,11,.1)", alignItems: "center", justifyContent: "center" }, guestTitle: { color: palette.white, fontFamily: displayFont, fontSize: 30, textAlign: "center", fontWeight: "700", marginTop: 17 }, guestCopy: { color: palette.muted, textAlign: "center", lineHeight: 19, fontSize: 12, marginTop: 8 }, primary: { minHeight: 46, alignSelf: "stretch", borderRadius: 14, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center", marginTop: 18 }, primaryText: { color: palette.night, fontWeight: "900", fontSize: 12 }, empty: { borderRadius: 22, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 28, alignItems: "center", marginTop: 20 }, emptyTitle: { color: palette.white, fontFamily: displayFont, fontSize: 25, fontWeight: "700", marginTop: 13 }, emptyCopy: { color: palette.muted, textAlign: "center", fontSize: 11, lineHeight: 18, marginTop: 7 }, message: { flexDirection: "row", gap: 9, alignItems: "center", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(239,68,68,.3)", backgroundColor: "rgba(239,68,68,.08)" }, error: { color: "#fecaca", flex: 1, fontSize: 11 },
});
