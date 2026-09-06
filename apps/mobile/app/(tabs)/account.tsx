import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { displayFont, palette } from "@/src/theme";
import type { Deal, Restaurant } from "@/src/types";

export default function AccountScreen() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [saved, setSaved] = useState<Deal[]>([]);
  const [venues, setVenues] = useState<Restaurant[]>([]);
  const [code, setCode] = useState("");
  const [venueId, setVenueId] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      if (user.role === "CONSUMER") api<{ deals: Deal[] }>("/users/me/saved").then(({ deals }) => setSaved(deals)).catch(() => setSaved([]));
      if (user.role === "MERCHANT") api<{ restaurants: Restaurant[] }>("/merchant/dashboard").then(({ restaurants }) => { setVenues(restaurants); setVenueId((current) => current || restaurants[0]?.id || ""); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Merchant venues could not load."));
    }, 0);
    return () => clearTimeout(timer);
  }, [user]);

  async function verify(value = code) {
    const normalized = value.trim().toUpperCase();
    if (!normalized) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const reward = normalized.startsWith("PTS-");
      const result = await api<{ kind: "DEAL" | "POINT_REWARD"; spinUnlocked?: boolean; redemption?: { deal?: { title?: string }; user?: { name?: string } }; reward?: { discountPct: number; discountAmountAzn: number; user?: { name?: string } } }>("/merchant/redemptions/redeem", { method: "POST", body: JSON.stringify({ code: normalized, venueId: reward ? venueId : undefined, billAmountAzn: reward ? Number(billAmount) : undefined }) });
      setNotice(result.kind === "DEAL" ? `Visit verified${result.redemption?.user?.name ? ` for ${result.redemption.user.name}` : ""}. One reward spin is now unlocked.` : `Reward verified. Apply ${result.reward?.discountAmountAzn ?? 0} AZN discount.`);
      setCode(""); setBillAmount(""); setScanning(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This QR/code could not be verified."); }
    finally { setBusy(false); }
  }

  if (authLoading) return <SafeAreaView style={styles.center}><ActivityIndicator color={palette.gold} /></SafeAreaView>;
  if (!user) return <SafeAreaView style={styles.safe}><View style={styles.guest}><View style={styles.guestIcon}><Ionicons name="person-outline" size={31} color={palette.gold} /></View><Text style={styles.title}>Your WhereToGo account</Text><Text style={styles.body}>Log in to save offers, create visit QR codes, collect points, and manage your venue.</Text><Pressable onPress={() => router.push("/login/customer" as never)} style={styles.primary}><Text style={styles.primaryText}>Customer login</Text></Pressable><Pressable onPress={() => router.push("/login/merchant" as never)} style={styles.secondary}><Text style={styles.secondaryText}>Merchant login</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.profile}><View style={styles.avatar}><Text style={styles.avatarText}>{user.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.profileCopy}><Text style={styles.name}>{user.name}</Text><Text style={styles.email}>{user.email}</Text><Text style={styles.role}>{user.role} ACCOUNT</Text></View></View>

    {user.role === "MERCHANT" && <View style={styles.panel}><Text style={styles.eyebrow}>CUSTOMER PROOF</Text><Text style={styles.panelTitle}>Verify QR or reward code</Text><Text style={styles.body}>Scan the customer&apos;s QR to confirm the visit automatically. Manual entry is still available.</Text><Pressable onPress={() => setScanning(true)} style={styles.scanButton}><Ionicons name="camera" size={18} color={palette.night} /><Text style={styles.primaryText}>Scan customer QR</Text></Pressable>
      {venues.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.venuePills}>{venues.map((venue) => <Pressable key={venue.id} onPress={() => setVenueId(venue.id)} style={[styles.venuePill, venueId === venue.id && styles.venuePillActive]}><Text style={[styles.venuePillText, venueId === venue.id && styles.venuePillTextActive]}>{venue.name}</Text></Pressable>)}</ScrollView>}
      <Text style={styles.fieldLabel}>QR OR CODE</Text><TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="GS-… or PTS-…" placeholderTextColor="#646475" style={styles.input} />
      {code.trim().toUpperCase().startsWith("PTS-") && <><Text style={styles.fieldLabel}>BILL AMOUNT (AZN)</Text><TextInput value={billAmount} onChangeText={setBillAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#646475" style={styles.input} /></>}
      <Pressable onPress={() => void verify()} disabled={busy || code.trim().length < 4} style={[styles.primary, (busy || code.trim().length < 4) && styles.disabled]}><Text style={styles.primaryText}>{busy ? "Verifying…" : "Verify code"}</Text></Pressable>
    </View>}

    {user.role === "CONSUMER" && <View><View style={styles.savedHeading}><View><Text style={styles.eyebrow}>YOUR SHORTLIST</Text><Text style={styles.panelTitle}>Saved offers</Text></View><Text style={styles.savedCount}>{saved.length}</Text></View>{saved.length ? saved.map((deal) => <Pressable key={deal.id} onPress={() => router.push({ pathname: "/deals/[id]", params: { id: deal.id } } as never)} style={styles.savedCard}><View style={styles.savedIcon}><Ionicons name="bookmark" size={18} color={palette.gold} /></View><View style={styles.savedCopy}><Text style={styles.savedTitle} numberOfLines={1}>{deal.title}</Text><Text style={styles.savedVenue}>{deal.restaurant.name}</Text></View><Ionicons name="chevron-forward" size={18} color={palette.muted} /></Pressable>) : <View style={styles.empty}><Text style={styles.body}>Offers you save will appear here.</Text></View>}</View>}
    {user.role === "ADMIN" && <View style={styles.panel}><Text style={styles.eyebrow}>WHERETOGO OPERATIONS</Text><Text style={styles.panelTitle}>Admin account</Text><Text style={styles.body}>The full moderation workspace remains available in the WhereToGo web dashboard.</Text></View>}
    {notice ? <Text style={styles.success}>{notice}</Text> : null}{error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable onPress={() => void logout()} style={styles.logout}><Ionicons name="log-out-outline" size={18} color="#fca5a5" /><Text style={styles.logoutText}>Log out</Text></Pressable>
  </ScrollView><Scanner visible={scanning} onClose={() => setScanning(false)} onScan={(value) => { setCode(value); setScanning(false); if (!value.trim().toUpperCase().startsWith("PTS-")) void verify(value); }} /></SafeAreaView>;
}

function Scanner({ visible, onClose, onScan }: { visible: boolean; onClose: () => void; onScan: (value: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  useEffect(() => { if (visible) { const timer = setTimeout(() => setLocked(false), 0); return () => clearTimeout(timer); } }, [visible]);
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.scanner}><View style={styles.scannerHeader}><View><Text style={styles.eyebrow}>CAMERA SCANNER</Text><Text style={styles.scannerTitle}>Scan customer proof</Text></View><Pressable onPress={onClose} style={styles.close}><Ionicons name="close" size={23} color={palette.white} /></Pressable></View>{!permission?.granted ? <View style={styles.permission}><Ionicons name="camera-outline" size={36} color={palette.gold} /><Text style={styles.body}>Camera permission is required to scan customer QR codes.</Text><Pressable onPress={() => void requestPermission()} style={styles.primary}><Text style={styles.primaryText}>Allow camera</Text></Pressable></View> : <View style={styles.cameraWrap}><CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={locked ? undefined : ({ data }) => { setLocked(true); onScan(data); }} /><View style={styles.scanFrame} /><Text style={styles.scanHelp}>Place the customer&apos;s QR inside the frame</Text></View>}</SafeAreaView></Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.night }, center: { flex: 1, backgroundColor: palette.night, alignItems: "center", justifyContent: "center" }, content: { padding: 18, paddingBottom: 40 }, guest: { flex: 1, padding: 26, alignItems: "center", justifyContent: "center" }, guestIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: "rgba(245,158,11,.1)", alignItems: "center", justifyContent: "center" }, title: { color: palette.white, fontFamily: displayFont, fontSize: 31, fontWeight: "700", textAlign: "center", marginTop: 18 }, body: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 7 }, primary: { minHeight: 46, borderRadius: 14, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center", marginTop: 14, paddingHorizontal: 18 }, primaryText: { color: palette.night, fontSize: 11, fontWeight: "900" }, secondary: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center", marginTop: 9, paddingHorizontal: 18 }, secondaryText: { color: palette.white, fontSize: 11, fontWeight: "800" }, profile: { flexDirection: "row", alignItems: "center", gap: 13, borderBottomWidth: 1, borderBottomColor: palette.line, paddingBottom: 20 }, avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" }, avatarText: { color: palette.night, fontSize: 20, fontWeight: "900" }, profileCopy: { flex: 1 }, name: { color: palette.white, fontSize: 20, fontWeight: "800" }, email: { color: palette.muted, fontSize: 11, marginTop: 3 }, role: { color: palette.gold, fontSize: 8, fontWeight: "900", letterSpacing: 1.4, marginTop: 5 }, panel: { borderRadius: 21, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 18, marginTop: 22 }, eyebrow: { color: palette.cyan, fontSize: 8, fontWeight: "900", letterSpacing: 1.7 }, panelTitle: { color: palette.white, fontFamily: displayFont, fontSize: 26, fontWeight: "700", marginTop: 5 }, scanButton: { minHeight: 48, borderRadius: 14, backgroundColor: palette.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }, venuePills: { gap: 7, marginTop: 13 }, venuePill: { borderRadius: 16, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 11, paddingVertical: 7 }, venuePillActive: { backgroundColor: palette.gold }, venuePillText: { color: palette.muted, fontSize: 10, fontWeight: "800" }, venuePillTextActive: { color: palette.night }, fieldLabel: { color: palette.muted, fontSize: 8, letterSpacing: 1.4, fontWeight: "900", marginTop: 15, marginBottom: 6 }, input: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,.045)", color: palette.white, paddingHorizontal: 13, fontSize: 13 }, disabled: { opacity: 0.45 }, savedHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 28, marginBottom: 13 }, savedCount: { color: palette.gold, fontWeight: "900", fontSize: 17 }, savedCard: { minHeight: 72, borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 }, savedIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(245,158,11,.1)", alignItems: "center", justifyContent: "center" }, savedCopy: { flex: 1 }, savedTitle: { color: palette.white, fontWeight: "800", fontSize: 13 }, savedVenue: { color: palette.muted, fontSize: 10, marginTop: 4 }, empty: { borderRadius: 17, borderWidth: 1, borderColor: palette.line, padding: 18 }, success: { color: "#a7f3d0", borderRadius: 14, borderWidth: 1, borderColor: "rgba(16,185,129,.3)", backgroundColor: "rgba(16,185,129,.1)", padding: 12, marginTop: 14, fontSize: 11 }, error: { color: "#fecaca", borderRadius: 14, borderWidth: 1, borderColor: "rgba(239,68,68,.3)", backgroundColor: "rgba(239,68,68,.1)", padding: 12, marginTop: 14, fontSize: 11 }, logout: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: "rgba(239,68,68,.2)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 24 }, logoutText: { color: "#fca5a5", fontSize: 11, fontWeight: "800" }, scanner: { flex: 1, backgroundColor: palette.night }, scannerHeader: { height: 76, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, scannerTitle: { color: palette.white, fontFamily: displayFont, fontSize: 25, fontWeight: "700", marginTop: 3 }, close: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }, permission: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center" }, cameraWrap: { flex: 1, alignItems: "center", justifyContent: "center" }, scanFrame: { width: 250, height: 250, borderRadius: 24, borderWidth: 3, borderColor: palette.gold, backgroundColor: "transparent" }, scanHelp: { position: "absolute", bottom: 45, color: palette.white, backgroundColor: "rgba(9,9,14,.8)", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, fontSize: 11, fontWeight: "800" },
});
