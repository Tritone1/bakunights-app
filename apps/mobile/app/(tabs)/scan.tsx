import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { LocalizedText as Text, LocalizedTextInput as TextInput } from "@/src/LocalizedText";
import { displayFont, palette } from "@/src/theme";
import type { Restaurant } from "@/src/types";

export default function ScanScreen() {
  const { user, loading: authLoading } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [venues, setVenues] = useState<Restaurant[]>([]);
  const [venueId, setVenueId] = useState("");
  const [code, setCode] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.role !== "MERCHANT" && user?.role !== "ADMIN") return;
    api<{ restaurants: Restaurant[] }>("/merchant/dashboard").then(({ restaurants }) => { setVenues(restaurants); setVenueId((current) => current || restaurants[0]?.id || ""); }).catch(() => undefined);
  }, [user]);

  async function verify(value = code) {
    const normalized = value.trim().toUpperCase();
    if (normalized.length < 4 || busy) return;
    setBusy(true); setNotice(""); setError(""); setLocked(true);
    try {
      const reward = normalized.startsWith("PTS-");
      const result = await api<{ kind: "DEAL" | "POINT_REWARD"; spinStatus?: "UNLOCKED" | "ALREADY_AVAILABLE" | "USED_TODAY"; redemption?: { user?: { name?: string } }; reward?: { discountAmountAzn: number } }>("/merchant/redemptions/redeem", { method: "POST", body: JSON.stringify({ code: normalized, venueId: reward ? venueId : undefined, billAmountAzn: reward ? Number(billAmount) : undefined }) });
      setNotice(result.kind === "DEAL"
        ? `Visit verified${result.redemption?.user?.name ? ` for ${result.redemption.user.name}` : ""}. ${result.spinStatus === "UNLOCKED" ? "Today's reward spin is now unlocked." : result.spinStatus === "ALREADY_AVAILABLE" ? "Today's spin was already available; extra deals do not add another spin." : "Today's spin was already used; this deal does not carry over to tomorrow."}`
        : `Reward accepted. Apply ${result.reward?.discountAmountAzn ?? 0} AZN discount.`);
      setCode(""); setBillAmount("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This QR code could not be verified."); }
    finally { setBusy(false); }
  }

  if (authLoading) return <SafeAreaView style={styles.center}><ActivityIndicator color={palette.gold} /></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    <View style={styles.heading}><View><Text style={styles.eyebrow}>CUSTOMER PROOF</Text><Text style={styles.title}>Scan QR</Text><Text style={styles.subtitle}>Verify an offer visit or accept a points reward.</Text></View><View style={styles.cameraIcon}><Ionicons name="qr-code" size={24} color={palette.night} /></View></View>

    {!permission?.granted ? <View style={styles.permission}><View style={styles.permissionIcon}><Ionicons name="camera-outline" size={34} color={palette.gold} /></View><Text style={styles.permissionTitle}>Camera access needed</Text><Text style={styles.body}>Allow camera access to scan customer QR codes instantly. You can still enter a code manually below.</Text><Pressable onPress={() => void requestPermission()} style={styles.primary}><Ionicons name="camera" size={18} color={palette.night} /><Text style={styles.primaryText}>Allow camera</Text></Pressable></View> : <View style={styles.cameraWrap}><CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={locked || busy ? undefined : ({ data }) => { setCode(data); void verify(data); }} /><View style={styles.cameraShade} /><View style={styles.scanFrame}><View style={[styles.corner, styles.topLeft]} /><View style={[styles.corner, styles.topRight]} /><View style={[styles.corner, styles.bottomLeft]} /><View style={[styles.corner, styles.bottomRight]} /></View><Text style={styles.scanHelp}>{busy ? "VERIFYING CODE…" : locked ? "READY FOR NEXT SCAN" : "ALIGN QR INSIDE THE FRAME"}</Text>{locked && !busy ? <Pressable onPress={() => { setLocked(false); setNotice(""); setError(""); }} style={styles.scanAgain}><Ionicons name="scan" size={16} color={palette.night} /><Text style={styles.scanAgainText}>Scan another</Text></Pressable> : null}</View>}

    {(notice || error) ? <View style={[styles.message, error ? styles.messageError : styles.messageSuccess]}><Ionicons name={error ? "alert-circle" : "checkmark-circle"} size={21} color={error ? "#fca5a5" : "#6ee7b7"} /><View style={styles.flex}><Text style={[styles.messageTitle, { color: error ? "#fecaca" : "#a7f3d0" }]}>{error ? "Could not verify" : "Verified successfully"}</Text><Text style={[styles.messageCopy, { color: error ? "#fca5a5" : "#6ee7b7" }]}>{error || notice}</Text></View></View> : null}

    <View style={styles.manual}><Text style={styles.eyebrow}>MANUAL ENTRY</Text><Text style={styles.manualTitle}>Enter customer code</Text>{venues.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.venuePills}>{venues.map((venue) => <Pressable key={venue.id} onPress={() => setVenueId(venue.id)} style={[styles.venuePill, venue.id === venueId && styles.venuePillActive]}><Text style={[styles.venuePillText, venue.id === venueId && styles.venuePillTextActive]}>{venue.name}</Text></Pressable>)}</ScrollView> : null}<Text style={styles.label}>QR OR REWARD CODE</Text><TextInput value={code} onChangeText={(value) => { setCode(value); setLocked(false); }} autoCapitalize="characters" placeholder="GS-... or PTS-..." placeholderTextColor="#5f5f73" style={styles.input} />{code.trim().toUpperCase().startsWith("PTS-") ? <><Text style={styles.label}>BILL AMOUNT (AZN)</Text><TextInput value={billAmount} onChangeText={setBillAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#5f5f73" style={styles.input} /></> : null}<Pressable onPress={() => void verify()} disabled={busy || code.trim().length < 4} style={[styles.primary, (busy || code.trim().length < 4) && styles.disabled]}><Ionicons name="checkmark-circle" size={18} color={palette.night} /><Text style={styles.primaryText}>{busy ? "Verifying…" : "Verify code"}</Text></Pressable></View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.night }, center: { flex: 1, backgroundColor: palette.night, alignItems: "center", justifyContent: "center" }, content: { padding: 18, paddingBottom: 42 }, flex: { flex: 1 }, heading: { minHeight: 111, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, eyebrow: { color: palette.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 }, title: { color: palette.white, fontFamily: displayFont, fontWeight: "700", fontSize: 38, marginTop: 4 }, subtitle: { color: palette.muted, fontSize: 11, marginTop: 5 }, cameraIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" }, cameraWrap: { height: 420, borderRadius: 27, overflow: "hidden", borderWidth: 1, borderColor: "rgba(245,158,11,.3)", alignItems: "center", justifyContent: "center" }, cameraShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(9,9,14,.12)" }, scanFrame: { width: 230, height: 230 }, corner: { position: "absolute", width: 48, height: 48, borderColor: palette.gold }, topLeft: { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 18 }, topRight: { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 18 }, bottomLeft: { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 18 }, bottomRight: { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 18 }, scanHelp: { position: "absolute", bottom: 60, color: palette.white, backgroundColor: "rgba(9,9,14,.78)", borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, fontSize: 9, letterSpacing: 1.1, fontWeight: "900" }, scanAgain: { position: "absolute", bottom: 14, backgroundColor: palette.gold, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 8, flexDirection: "row", gap: 6, alignItems: "center" }, scanAgainText: { color: palette.night, fontSize: 10, fontWeight: "900" },
  permission: { minHeight: 310, borderRadius: 25, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 25, alignItems: "center", justifyContent: "center" }, permissionIcon: { width: 66, height: 66, borderRadius: 22, backgroundColor: "rgba(245,158,11,.09)", alignItems: "center", justifyContent: "center" }, permissionTitle: { color: palette.white, fontFamily: displayFont, fontWeight: "700", fontSize: 25, marginTop: 14 }, body: { color: palette.muted, textAlign: "center", fontSize: 11, lineHeight: 18, marginTop: 7 }, primary: { minHeight: 47, alignSelf: "stretch", borderRadius: 14, backgroundColor: palette.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }, primaryText: { color: palette.night, fontSize: 11, fontWeight: "900" }, disabled: { opacity: .4 }, message: { borderRadius: 17, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 13 }, messageSuccess: { borderColor: "rgba(16,185,129,.3)", backgroundColor: "rgba(16,185,129,.09)" }, messageError: { borderColor: "rgba(239,68,68,.3)", backgroundColor: "rgba(239,68,68,.09)" }, messageTitle: { fontSize: 12, fontWeight: "900" }, messageCopy: { fontSize: 10, lineHeight: 15, marginTop: 2 }, manual: { borderRadius: 22, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 17, marginTop: 16 }, manualTitle: { color: palette.white, fontFamily: displayFont, fontSize: 23, fontWeight: "700", marginTop: 4, marginBottom: 14 }, label: { color: palette.muted, fontSize: 8, letterSpacing: 1.3, fontWeight: "900", marginTop: 10, marginBottom: 6 }, input: { minHeight: 49, borderRadius: 13, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,.04)", color: palette.white, paddingHorizontal: 13, fontSize: 12 }, venuePills: { gap: 7, paddingBottom: 6 }, venuePill: { borderRadius: 16, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 11, paddingVertical: 8 }, venuePillActive: { borderColor: "rgba(245,158,11,.5)", backgroundColor: "rgba(245,158,11,.1)" }, venuePillText: { color: palette.muted, fontSize: 9, fontWeight: "800" }, venuePillTextActive: { color: palette.gold },
});
