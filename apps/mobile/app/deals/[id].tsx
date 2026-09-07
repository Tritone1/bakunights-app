import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Share, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { useLanguage } from "@/src/LanguageContext";
import { LocalizedText as Text } from "@/src/LocalizedText";
import { displayFont, palette } from "@/src/theme";
import type { Deal, Redemption } from "@/src/types";

type DetailResponse = { deal: Deal; saved: boolean; followed: boolean; redemption: Redemption | null };

function countdown(target: string) {
  const seconds = Math.max(0, Math.floor((new Date(target).getTime() - Date.now()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [hours, minutes, seconds % 60].map((value) => String(value).padStart(2, "0")).join(":");
}

export default function OfferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [remaining, setRemaining] = useState("00:00:00");
  const [galleryWidth, setGalleryWidth] = useState(1);
  const [activePhoto, setActivePhoto] = useState(0);
  const galleryRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try { setData(await api<DetailResponse>(`/deals/${id}?lang=${language}`)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "This offer could not load."); }
    finally { setLoading(false); }
  }, [id, language]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const photos = useMemo(() => {
    if (!data) return [];
    const deal = data.deal;
    const candidates = [
      ...(deal.photoUrl ? [{ src: deal.photoUrl, label: deal.title }] : []),
      ...(deal.offerMenuItems || []).flatMap(({ menuItem }) => menuItem.photoUrl ? [{ src: menuItem.photoUrl, label: menuItem.name }] : []),
      ...(deal.freeMenuItem?.photoUrl ? [{ src: deal.freeMenuItem.photoUrl, label: `${deal.freeMenuItem.name} · free item` }] : []),
      ...(deal.restaurant.photoUrl ? [{ src: deal.restaurant.photoUrl, label: deal.restaurant.name }] : []),
    ];
    return [...new Map(candidates.map((photo) => [photo.src, photo])).values()];
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const kickoff = setTimeout(() => setRemaining(countdown(data.deal.endsAt)), 0);
    const timer = setInterval(() => setRemaining(countdown(data.deal.endsAt)), 1000);
    return () => { clearTimeout(kickoff); clearInterval(timer); };
  }, [data]);
  useEffect(() => {
    if (photos.length <= 1 || galleryWidth <= 1) return;
    const timer = setInterval(() => setActivePhoto((current) => {
      const next = (current + 1) % photos.length;
      galleryRef.current?.scrollTo({ x: next * galleryWidth, animated: true });
      return next;
    }), 3000);
    return () => clearInterval(timer);
  }, [galleryWidth, photos.length]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3000); return () => clearTimeout(timer); }, [notice]);

  function requireCustomer() {
    if (user?.role === "CONSUMER") return true;
    router.push({ pathname: "/login/customer", params: { next: `/deals/${id}` } } as never);
    return false;
  }

  async function toggleSave() {
    if (!data || !requireCustomer()) return;
    const wasSaved = data.saved;
    setData({ ...data, saved: !wasSaved });
    try { await api(`/deals/${data.deal.id}/save`, { method: wasSaved ? "DELETE" : "PUT" }); }
    catch (reason) { setData((current) => current ? { ...current, saved: wasSaved } : current); setNotice(reason instanceof Error ? reason.message : "Could not update saved offer."); }
  }

  async function toggleFollow() {
    if (!data || !requireCustomer()) return;
    const wasFollowed = data.followed;
    setData({ ...data, followed: !wasFollowed });
    try { await api(`/restaurants/${data.deal.restaurant.id}/follow`, { method: wasFollowed ? "DELETE" : "PUT" }); }
    catch (reason) { setData((current) => current ? { ...current, followed: wasFollowed } : current); setNotice(reason instanceof Error ? reason.message : "Could not update followed venue."); }
  }

  async function claim() {
    if (!data || !requireCustomer() || data.redemption) return;
    setBusy("claim");
    try {
      const result = await api<{ redemption: Redemption }>(`/deals/${data.deal.id}/claim`, { method: "POST" });
      setData({ ...data, redemption: result.redemption });
      setNotice("QR proof created. Show it to the merchant for verification.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not create QR proof."); }
    finally { setBusy(""); }
  }

  async function submitRating() {
    if (!data || !rating || !requireCustomer()) return;
    setBusy("rating");
    try { await api(`/deals/${data.deal.id}/rating`, { method: "PUT", body: JSON.stringify({ value: rating }) }); setRating(0); setNotice("Rating saved. Thank you!"); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not save your rating."); }
    finally { setBusy(""); }
  }

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={palette.gold} /><Text style={styles.loadingText}>Preparing your offer…</Text></SafeAreaView>;
  if (error || !data) return <SafeAreaView style={styles.center}><Ionicons name="alert-circle-outline" size={34} color={palette.red} /><Text style={styles.errorTitle}>Offer unavailable</Text><Text style={styles.errorBody}>{error}</Text><Pressable onPress={() => void load()} style={styles.primary}><Text style={styles.primaryText}>Try again</Text></Pressable></SafeAreaView>;

  const { deal } = data;
  const venue = deal.restaurant;
  const priceValues = (deal.offerMenuItems || []).map(({ menuItem }) => Number(menuItem.priceAzn)).filter(Number.isFinite);
  const offerPrice = Number(deal.offerPriceAzn);
  const minimumSpend = Number(deal.minimumSpendAzn);
  const price = offerPrice > 0 ? `${offerPrice.toFixed(2)} AZN total` : minimumSpend > 0 ? `${minimumSpend.toFixed(2)} AZN minimum` : priceValues.length ? `${Math.min(...priceValues).toFixed(0)}${priceValues.length > 1 ? `–${Math.max(...priceValues).toFixed(0)}` : ""} AZN` : "Price varies";
  const tags = [...new Set([...(deal.dietaryTags || []), ...(deal.scopeCategory?.name ? [deal.scopeCategory.name] : []), ...((deal.offerMenuItems || []).map(({ menuItem }) => menuItem.category?.name).filter(Boolean) as string[])])];
  const offerTag = deal.offerType === "discount" && deal.discountPct ? `${deal.discountPct}% OFF` : (deal.offerType || "OFFER").replaceAll("_", " ").toUpperCase();
  const offerTerms = buildOfferTerms(deal);

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    <View style={styles.topBar}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={19} color={palette.white} /><Text style={styles.backText}>Back</Text></Pressable><View style={styles.tag}><Text style={styles.tagText}>{offerTag}</Text></View></View>

    <View onLayout={(event: LayoutChangeEvent) => setGalleryWidth(event.nativeEvent.layout.width)} style={styles.gallery}>
      {photos.length ? <ScrollView ref={galleryRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => setActivePhoto(Math.round(event.nativeEvent.contentOffset.x / galleryWidth))}>{photos.map((photo) => <View key={photo.src} style={{ width: galleryWidth }}><Image source={{ uri: photo.src }} resizeMode="contain" style={styles.photo} /><View style={styles.photoLabel}><Text numberOfLines={1} style={styles.photoLabelText}>{photo.label}</Text></View></View>)}</ScrollView> : <View style={[styles.photo, styles.fallback]}><Ionicons name="restaurant" size={40} color={palette.gold} /></View>}
      {photos.length > 1 && <View style={styles.dots}>{photos.map((photo, index) => <Pressable key={photo.src} onPress={() => { setActivePhoto(index); galleryRef.current?.scrollTo({ x: index * galleryWidth, animated: true }); }} style={[styles.dot, activePhoto === index && styles.dotActive]} />)}</View>}
    </View>

    <View style={styles.intro}><View style={styles.pills}><Text style={styles.category}>{venue.cuisine}</Text>{deal.tag && <Text style={styles.period}>{deal.tag}</Text>}</View><Text style={styles.title}>{deal.title}</Text><Text style={styles.venueName}>{venue.name}</Text><Text style={styles.description}>{deal.description}</Text>{deal.isMachineTranslated && <Text style={styles.translated}>AUTOMATICALLY TRANSLATED</Text>}</View>

    {offerTerms.length > 0 && <View style={styles.termsCard}><Text style={styles.eyebrow}>OFFER BREAKDOWN</Text><Text style={styles.termsTitle}>Exactly what you get</Text>{offerTerms.map((term, index) => <View key={`${term.label}-${index}`} style={styles.termRow}><Text style={styles.termLabel}>{term.label}</Text><Text style={[styles.termValue, term.tone === "green" && styles.termGreen, term.tone === "amber" && styles.termAmber]}>{term.value}</Text></View>)}</View>}

    <View style={styles.metaGrid}><Meta icon="time" label="OFFER EXPIRES" value={remaining} color={palette.red} /><Meta icon="star" label="RATING" value={`${(deal.dealRating ?? venue.rating ?? 0).toFixed(1)}/5.0`} color={palette.gold} /><Meta icon="wallet" label="PRICE RANGE" value={price} color={palette.gold} /><Meta icon="navigate" label="DISTANCE" value={deal.distanceMiles == null ? "Nearby" : `${(deal.distanceMiles * 1.60934).toFixed(1)} km`} color={palette.white} /></View>
    {tags.length > 0 && <View style={styles.tags}>{tags.map((tag) => <Text key={tag} style={styles.chip}>{tag}</Text>)}</View>}
    <View style={styles.actions}><Action icon={data.saved ? "bookmark" : "bookmark-outline"} label={data.saved ? "Saved" : "Save"} active={data.saved} onPress={() => void toggleSave()} /><Action icon={data.followed ? "heart" : "heart-outline"} label={data.followed ? "Following" : "Follow"} active={data.followed} onPress={() => void toggleFollow()} /><Action icon="share-outline" label="Share" onPress={() => void Share.share({ title: deal.title, message: `${deal.title} at ${venue.name}` })} /></View>

    <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>WHERETOGO NAVIGATION</Text><Text style={styles.sectionTitle}>Find your way</Text></View></View>
    <View style={styles.mapCard}><MapView style={styles.map} initialRegion={{ latitude: venue.lat, longitude: venue.lng, latitudeDelta: 0.018, longitudeDelta: 0.018 }} mapType="mutedStandard" scrollEnabled={false} zoomEnabled={false}><Marker coordinate={{ latitude: venue.lat, longitude: venue.lng }} title={venue.name} pinColor={palette.gold} /></MapView><Text style={styles.mapAddress} numberOfLines={2}><Ionicons name="location" size={13} color={palette.gold} /> {venue.address}</Text><View style={styles.mapButtons}><Pressable onPress={() => router.push({ pathname: "/(tabs)/explore", params: { venue: venue.id, navigate: "1" } } as never)} style={styles.mapPrimary}><Ionicons name="navigate" size={16} color={palette.night} /><Text style={styles.mapPrimaryText}>Navigate in app</Text></Pressable><Pressable onPress={() => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`)} style={styles.mapSecondary}><Ionicons name="open-outline" size={16} color={palette.white} /><Text style={styles.mapSecondaryText}>Maps</Text></Pressable></View></View>

    <View style={styles.proof}><View style={[styles.proofIcon, data.redemption?.redeemedAt && styles.proofIconConfirmed]}><Ionicons name={data.redemption?.redeemedAt ? "checkmark" : "qr-code"} size={25} color={data.redemption?.redeemedAt ? palette.green : palette.gold} /></View><Text style={styles.proofLabel}>YOUR PROOF</Text><Text style={styles.proofTitle}>{data.redemption?.redeemedAt ? "Visit Confirmed" : data.redemption ? "Show this QR" : "Claim Offer"}</Text>
      {data.redemption?.qrDataUrl && <Image source={{ uri: data.redemption.qrDataUrl }} style={styles.qr} />}
      {data.redemption && <Text selectable style={styles.code}>{data.redemption.redemptionCode}</Text>}
      {!data.redemption && <Pressable onPress={() => void claim()} disabled={busy === "claim"} style={styles.primary}><Text style={styles.primaryText}>{busy === "claim" ? "Creating QR…" : "Claim offer & create QR"}</Text></Pressable>}
      <Text style={styles.proofHelp}>{data.redemption ? "The merchant scans this QR to verify your visit—no manual typing needed." : "Claiming creates a unique QR that the merchant scans at the venue."}</Text>
    </View>

    <View style={styles.rate}><Text style={styles.eyebrow}>RATE THIS OFFER</Text><Text style={styles.sectionTitle}>Was this offer worth it?</Text><View style={styles.ratingRow}>{[1, 2, 3, 4, 5].map((value) => <Pressable key={value} onPress={() => setRating(value)} hitSlop={6}><Ionicons name={value <= rating ? "star" : "star-outline"} size={34} color={palette.gold} /></Pressable>)}{rating > 0 && <Pressable onPress={() => void submitRating()} disabled={busy === "rating"} style={styles.submit}><Text style={styles.submitText}>{busy === "rating" ? "Saving…" : "Submit"}</Text></Pressable>}</View></View>
    <Text style={styles.disclaimer}>Always confirm offer details with the venue before ordering.</Text>
    {notice ? <View style={styles.toast}><Text style={styles.toastText}>{notice}</Text></View> : null}
  </ScrollView></SafeAreaView>;
}

function buildOfferTerms(deal: Deal) {
  const rows: { label: string; value: string; tone?: "amber" | "green" }[] = [];
  const items = deal.offerMenuItems || [];
  const regularTotal = items.reduce((sum, item) => sum + Number(item.menuItem.priceAzn), 0);
  const offerPrice = Number(deal.offerPriceAzn);
  const minimumSpend = Number(deal.minimumSpendAzn);
  if (minimumSpend > 0 && deal.freeMenuItem) {
    const qualifying = deal.scopeCategory?.name || items.map((item) => item.menuItem.name).join(", ") || "Any eligible venue purchase";
    return [
      { label: "Qualifying purchase", value: qualifying },
      { label: "Minimum spend", value: `${minimumSpend.toFixed(2)} AZN`, tone: "amber" as const },
      { label: "Free item", value: `${deal.freeMenuItem.name} (${Number(deal.freeMenuItem.priceAzn).toFixed(2)} AZN value)`, tone: "green" as const },
    ];
  }
  if (deal.offerType === "discount") {
    rows.push({ label: "Discount", value: `${deal.discountPct || 0}% off`, tone: "amber" });
    rows.push({ label: "Applies to", value: deal.scopeCategory?.name ? `${deal.scopeCategory.name} · all category items` : items.length ? items.map((item) => item.menuItem.name).join(", ") : "Whole menu" });
    return rows;
  }
  if (["combo", "set_menu", "bundle"].includes(deal.offerType || "")) {
    items.forEach(({ menuItem, overridePriceAzn }) => {
      const regular = Number(menuItem.priceAzn);
      const offered = overridePriceAzn == null ? null : Number(overridePriceAzn);
      rows.push({ label: menuItem.name, value: offered === 0 ? `Free · was ${regular.toFixed(2)} AZN` : offered != null ? `${offered.toFixed(2)} AZN · was ${regular.toFixed(2)} AZN` : `${regular.toFixed(2)} AZN`, tone: offered === 0 ? "green" : undefined });
    });
    const effectiveTotal = offerPrice > 0 ? offerPrice : items.reduce((sum, item) => sum + (item.overridePriceAzn == null ? Number(item.menuItem.priceAzn) : Number(item.overridePriceAzn)), 0);
    rows.push({ label: "Regular total", value: `${regularTotal.toFixed(2)} AZN` });
    rows.push({ label: "Offer total", value: `${effectiveTotal.toFixed(2)} AZN`, tone: "green" });
    if (regularTotal > effectiveTotal) rows.push({ label: "You save", value: `${(regularTotal - effectiveTotal).toFixed(2)} AZN (${Math.round((1 - effectiveTotal / regularTotal) * 100)}%)`, tone: "amber" });
  }
  return rows;
}

function Meta({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }) { return <View style={styles.meta}><View style={[styles.metaIcon, { backgroundColor: `${color}18` }]}><Ionicons name={icon} size={18} color={color} /></View><View style={styles.metaCopy}><Text style={styles.metaLabel}>{label}</Text><Text style={styles.metaValue}>{value}</Text></View></View>; }
function Action({ icon, label, active = false, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.action, active && styles.actionActive]}><Ionicons name={icon} size={18} color={active ? palette.night : palette.white} /><Text style={[styles.actionText, active && styles.actionTextActive]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.night }, content: { paddingBottom: 45 }, center: { flex: 1, backgroundColor: palette.night, alignItems: "center", justifyContent: "center", padding: 24 }, loadingText: { color: palette.muted, marginTop: 12 }, errorTitle: { color: palette.white, fontFamily: displayFont, fontSize: 26, marginTop: 12 }, errorBody: { color: palette.muted, textAlign: "center", marginTop: 7 }, topBar: { height: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 }, back: { flexDirection: "row", gap: 3, alignItems: "center", borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, paddingHorizontal: 12, paddingVertical: 9 }, backText: { color: palette.white, fontWeight: "800", fontSize: 12 }, tag: { borderRadius: 16, backgroundColor: palette.red, paddingHorizontal: 11, paddingVertical: 7 }, tagText: { color: palette.white, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  gallery: { height: 285, marginHorizontal: 16, overflow: "hidden", borderRadius: 22, borderWidth: 1, borderColor: palette.line, backgroundColor: "#0d0d14" }, photo: { width: "100%", height: 283, backgroundColor: "#0d0d14" }, fallback: { alignItems: "center", justifyContent: "center" }, photoLabel: { position: "absolute", left: 12, bottom: 14, maxWidth: 220, borderRadius: 12, backgroundColor: "rgba(9,9,14,.85)", paddingHorizontal: 10, paddingVertical: 7 }, photoLabelText: { color: palette.white, fontSize: 10, fontWeight: "800" }, dots: { position: "absolute", right: 13, bottom: 17, flexDirection: "row", gap: 6 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,.35)" }, dotActive: { width: 24, backgroundColor: palette.gold },
  intro: { paddingHorizontal: 18, paddingTop: 21 }, pills: { flexDirection: "row", gap: 7 }, category: { color: palette.white, backgroundColor: "rgba(255,255,255,.07)", borderRadius: 15, paddingHorizontal: 10, paddingVertical: 6, fontSize: 9, fontWeight: "800" }, period: { color: palette.goldSoft, backgroundColor: "rgba(245,158,11,.1)", borderRadius: 15, paddingHorizontal: 10, paddingVertical: 6, fontSize: 9, fontWeight: "800" }, title: { color: palette.white, fontFamily: displayFont, fontSize: 34, lineHeight: 39, fontWeight: "700", marginTop: 13 }, venueName: { color: palette.gold, fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginTop: 6 }, description: { color: "#b3b3c8", fontSize: 14, lineHeight: 21, marginTop: 9 }, translated: { color: palette.goldSoft, fontSize: 8, letterSpacing: 1.3, fontWeight: "900", marginTop: 9 },
  termsCard: { marginHorizontal: 16, marginTop: 20, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, paddingHorizontal: 16, paddingTop: 16, overflow: "hidden" }, termsTitle: { color: palette.white, fontFamily: displayFont, fontSize: 24, fontWeight: "700", marginTop: 4, marginBottom: 8 }, termRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 16, borderTopWidth: 1, borderTopColor: palette.line, paddingVertical: 12 }, termLabel: { color: palette.muted, fontSize: 11, flex: 1 }, termValue: { color: palette.white, fontSize: 11, fontWeight: "800", textAlign: "right", flex: 1.6 }, termGreen: { color: palette.green }, termAmber: { color: palette.gold },
  metaGrid: { marginHorizontal: 16, marginTop: 22, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, overflow: "hidden", flexDirection: "row", flexWrap: "wrap" }, meta: { width: "50%", minHeight: 94, padding: 13, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 0.5, borderColor: palette.line }, metaIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }, metaCopy: { flex: 1 }, metaLabel: { color: palette.muted, fontSize: 7, fontWeight: "900", letterSpacing: 1.1 }, metaValue: { color: palette.white, fontSize: 12, fontWeight: "900", marginTop: 5 }, tags: { flexDirection: "row", flexWrap: "wrap", gap: 7, paddingHorizontal: 18, marginTop: 16 }, chip: { color: "#aaaac0", borderRadius: 16, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,.045)", paddingHorizontal: 10, paddingVertical: 7, fontSize: 9, fontWeight: "700" }, actions: { flexDirection: "row", gap: 8, marginHorizontal: 16, marginTop: 17 }, action: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.cardRaised, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }, actionActive: { backgroundColor: palette.gold, borderColor: palette.gold }, actionText: { color: palette.white, fontSize: 10, fontWeight: "800" }, actionTextActive: { color: palette.night },
  sectionHeading: { marginHorizontal: 18, marginTop: 30 }, eyebrow: { color: palette.gold, fontSize: 8, fontWeight: "900", letterSpacing: 1.7 }, sectionTitle: { color: palette.white, fontFamily: displayFont, fontWeight: "700", fontSize: 26, marginTop: 5 }, mapCard: { marginHorizontal: 16, marginTop: 14, borderRadius: 20, borderWidth: 1, borderColor: palette.line, overflow: "hidden", backgroundColor: palette.card }, map: { height: 220, width: "100%" }, mapAddress: { color: palette.muted, paddingHorizontal: 14, paddingTop: 12, fontSize: 11, lineHeight: 16 }, mapButtons: { flexDirection: "row", gap: 8, padding: 12 }, mapPrimary: { flex: 1, height: 44, borderRadius: 13, backgroundColor: palette.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, mapPrimaryText: { color: palette.night, fontSize: 10, fontWeight: "900" }, mapSecondary: { width: 82, height: 44, borderRadius: 13, borderWidth: 1, borderColor: palette.line, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, mapSecondaryText: { color: palette.white, fontSize: 10, fontWeight: "800" },
  proof: { marginHorizontal: 16, marginTop: 24, borderRadius: 22, borderWidth: 1, borderColor: "rgba(245,158,11,.35)", backgroundColor: "rgba(245,158,11,.07)", padding: 20, alignItems: "center" }, proofIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(245,158,11,.12)", alignItems: "center", justifyContent: "center" }, proofIconConfirmed: { backgroundColor: "rgba(16,185,129,.12)" }, proofLabel: { color: palette.muted, fontSize: 8, letterSpacing: 1.8, fontWeight: "900", marginTop: 14 }, proofTitle: { color: palette.white, fontFamily: displayFont, fontSize: 28, fontWeight: "700", marginTop: 5 }, qr: { width: 210, height: 210, borderRadius: 14, marginTop: 16 }, code: { color: palette.goldSoft, backgroundColor: "rgba(0,0,0,.25)", borderRadius: 11, padding: 11, fontWeight: "900", letterSpacing: 2, marginTop: 10 }, proofHelp: { color: palette.muted, textAlign: "center", fontSize: 10, lineHeight: 15, marginTop: 13 }, primary: { minWidth: 180, height: 45, borderRadius: 14, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center", marginTop: 15, paddingHorizontal: 18 }, primaryText: { color: palette.night, fontSize: 11, fontWeight: "900" },
  rate: { marginHorizontal: 16, marginTop: 24, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 18 }, ratingRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 17, flexWrap: "wrap" }, submit: { height: 40, borderRadius: 13, backgroundColor: palette.gold, paddingHorizontal: 15, alignItems: "center", justifyContent: "center", marginLeft: 4 }, submitText: { color: palette.night, fontSize: 11, fontWeight: "900" }, disclaimer: { color: "#555568", fontSize: 8, lineHeight: 13, textAlign: "center", textTransform: "uppercase", letterSpacing: 1.2, margin: 20 }, toast: { position: "absolute", left: 24, right: 24, bottom: 24, borderRadius: 15, borderWidth: 1, borderColor: "rgba(103,232,249,.3)", backgroundColor: "#162d33", padding: 14 }, toastText: { color: "#cffafe", fontSize: 11, textAlign: "center", fontWeight: "700" },
});
