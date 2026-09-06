import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, appUrl } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { useLanguage } from "@/src/LanguageContext";
import { useUserLocation } from "@/src/LocationContext";
import { displayFont, palette } from "@/src/theme";
import type { Deal, HomepageStats, Restaurant } from "@/src/types";

const CATEGORIES = ["All", "Restaurant", "Cafe", "Bar", "Pub", "Lounge"] as const;
const BAKU = { latitude: 40.3719, longitude: 49.8412 };

function distanceKm(latitude: number, longitude: number, venue: Restaurant) {
  const radians = (value: number) => value * Math.PI / 180;
  const latDistance = radians(venue.lat - latitude);
  const lngDistance = radians(venue.lng - longitude);
  const a = Math.sin(latDistance / 2) ** 2 + Math.cos(radians(latitude)) * Math.cos(radians(venue.lat)) * Math.sin(lngDistance / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function offerLabel(deal: Deal) {
  if (deal.offerType === "discount" && deal.discountPct) return `${deal.discountPct}% OFF`;
  return (deal.offerType || deal.tag || "OFFER").replaceAll("_", " ").toUpperCase();
}

function openDeal(router: ReturnType<typeof useRouter>, deal: Deal) {
  router.push({ pathname: "/deals/[id]", params: { id: deal.id } } as never);
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { language, cycleLanguage } = useLanguage();
  const { coords, loading: locating, error: locationError, requestLocation } = useUserLocation();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stats, setStats] = useState<HomepageStats>({ activeVenues: 0, liveDeals: 0, areas: 0 });
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const latitude = coords?.latitude ?? BAKU.latitude;
  const longitude = coords?.longitude ?? BAKU.longitude;

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const [venueResult, dealResult, statsResult] = await Promise.all([
        api<{ restaurants: Restaurant[] }>(`/restaurants?lang=${language}`),
        api<{ deals: Deal[] }>(`/deals?lat=${latitude}&lng=${longitude}&radius=100&all=true&sort=ending&lang=${language}`),
        api<{ stats: HomepageStats }>("/restaurants/stats/home"),
      ]);
      setRestaurants(venueResult.restaurants);
      setDeals(dealResult.deals);
      setStats(statsResult.stats);
      setError("");
      if (user?.role === "CONSUMER") {
        const result = await api<{ deals: Deal[] }>(`/users/me/saved?lang=${language}`).catch(() => ({ deals: [] }));
        setSaved(new Set(result.deals.map((deal) => deal.id)));
      } else setSaved(new Set());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "WhereToGo could not load right now."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [language, latitude, longitude, user]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const filteredVenues = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return restaurants
      .filter((venue) => (category === "All" || venue.cuisine.toLowerCase() === category.toLowerCase()) && (!normalized || `${venue.name} ${venue.cuisine} ${venue.address} ${venue.liveDeal?.title || ""}`.toLowerCase().includes(normalized)))
      .sort((a, b) => distanceKm(latitude, longitude, a) - distanceKm(latitude, longitude, b));
  }, [category, latitude, longitude, query, restaurants]);
  const flashDeals = useMemo(() => [...deals].sort((a, b) => (b.discountPct ?? 0) - (a.discountPct ?? 0)).slice(0, 6), [deals]);

  async function toggleSaved(deal: Deal) {
    if (!user) { router.push("/login/customer" as never); return; }
    const wasSaved = saved.has(deal.id);
    setSaved((current) => { const next = new Set(current); if (wasSaved) next.delete(deal.id); else next.add(deal.id); return next; });
    try { await api(`/deals/${deal.id}/save`, { method: wasSaved ? "DELETE" : "PUT" }); }
    catch (reason) {
      setSaved((current) => { const next = new Set(current); if (wasSaved) next.add(deal.id); else next.delete(deal.id); return next; });
      Alert.alert("Could not update saved offers", reason instanceof Error ? reason.message : "Try again.");
    }
  }

  function account() {
    if (!user) { router.push("/login/customer" as never); return; }
    Alert.alert(user.name, user.email, [{ text: "Cancel", style: "cancel" }, { text: "Log out", style: "destructive", onPress: () => void logout() }]);
  }

  const today = new Intl.DateTimeFormat(language === "az" ? "az-AZ" : language === "ru" ? "ru-RU" : "en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.gold} />} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.brand}><View style={styles.logo}><Ionicons name="location" size={23} color={palette.night} /></View><Text style={styles.brandText}>Where<Text style={styles.gold}>ToGo</Text></Text></View>
        <View style={styles.headerActions}>
          <Pressable onPress={cycleLanguage} style={styles.roundButton} accessibilityLabel="Change language"><Text style={styles.language}>{language.toUpperCase()}</Text></Pressable>
          <Pressable onPress={() => void requestLocation()} style={[styles.roundButton, coords && styles.roundButtonActive]} accessibilityLabel="Use my location"><Ionicons name={locating ? "hourglass-outline" : "navigate"} size={17} color={coords ? palette.night : palette.gold} /></Pressable>
          <Pressable onPress={account} style={styles.accountButton} accessibilityLabel="Account"><Ionicons name={user ? "person" : "person-outline"} size={17} color={palette.white} /></Pressable>
        </View>
      </View>
      {!authLoading && !user && <View style={styles.loginRow}><Pressable onPress={() => router.push("/login/customer" as never)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Customer login</Text></Pressable><Pressable onPress={() => router.push("/login/merchant" as never)} style={styles.goldButton}><Text style={styles.goldButtonText}>Merchant login</Text></Pressable></View>}

      <ImageBackground source={{ uri: `${appUrl}/wheretogo-hero.png` }} style={styles.hero} imageStyle={styles.heroImage}>
        <View style={styles.heroShade} />
        <View style={styles.heroBottom}>
          <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveLabel}>LIVE · {today.toUpperCase()}</Text></View>
          <Text style={styles.heroTitle}>Great food.{"\n"}<Text style={styles.gold}>Great deals.</Text>{"\n"}Every day.</Text>
          <View style={styles.statsRow}><Stat value={stats.activeVenues} label="Venues" /><Stat value={stats.liveDeals} label="Deals" accent /><Stat value={stats.areas} label="Areas" /></View>
        </View>
      </ImageBackground>

      {locationError && <Pressable onPress={() => void requestLocation()} style={styles.notice}><Ionicons name="location-outline" size={17} color={palette.gold} /><Text style={styles.noticeText}>{locationError} Tap to retry.</Text></Pressable>}
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>Retry</Text></Pressable></View> : null}
      <SectionTitle eyebrow="HAPPENING NOW" title="Live offers from restaurants" />
      {loading ? <ActivityIndicator color={palette.gold} style={styles.loader} /> : deals.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>{deals.map((deal) => <OfferCard key={deal.id} deal={deal} saved={saved.has(deal.id)} onOpen={() => openDeal(router, deal)} onSave={() => void toggleSaved(deal)} />)}</ScrollView> : <Empty icon="ticket-outline" title="No live offers right now" text="New merchant offers will appear here as soon as they go live." />}

      <Pressable onPress={() => router.push("/(tabs)/rewards" as never)} style={styles.rewardsCard}><View style={styles.rewardsIcon}><Ionicons name="sparkles" size={25} color={palette.gold} /></View><View style={styles.rewardsCopy}><Text style={styles.rewardsEyebrow}>VERIFIED VISIT REWARDS</Text><Text style={styles.rewardsTitle}>Spin. Earn. Save.</Text><Text style={styles.rewardsBody}>Verify an in-store visit, spin for points, and unlock rewards.</Text></View><Ionicons name="chevron-forward" size={22} color={palette.gold} /></Pressable>

      <SectionTitle eyebrow="ENDING SOON" title="Flash deals" />
      {flashDeals.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>{flashDeals.map((deal) => <CompactDeal key={deal.id} deal={deal} onOpen={() => openDeal(router, deal)} />)}</ScrollView> : <Empty icon="flash-outline" title="No flash deals yet" text="Check again when venues publish limited-time offers." compact />}

      <View style={styles.searchHeading}><SectionTitle eyebrow="CURATED FOR TONIGHT" title="Find your next stop" inset={false} /><Text style={styles.count}>{filteredVenues.length} venues</Text></View>
      <View style={styles.search}><Ionicons name="search" size={19} color={palette.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="Search venues, vibes, or districts" placeholderTextColor="#686879" style={styles.searchInput} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>{CATEGORIES.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.category, category === item && styles.categoryActive]}><Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</Text></Pressable>)}</ScrollView>
      {filteredVenues.map((venue) => <VenueCard key={venue.id} venue={venue} latitude={latitude} longitude={longitude} onOffer={venue.liveDeal ? () => openDeal(router, venue.liveDeal!) : undefined} onMap={() => router.push({ pathname: "/(tabs)/explore", params: { venue: venue.id } } as never)} />)}
      {!loading && !filteredVenues.length && <Empty icon="storefront-outline" title="No venues found" text="Try another search or category." />}
      <Text style={styles.footer}>© {new Date().getFullYear()} WhereToGo · Great food. Great deals. Every day.</Text>
    </ScrollView>
  </SafeAreaView>;
}

function Stat({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) { return <View style={styles.stat}><Text style={[styles.statValue, accent && styles.gold]}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function SectionTitle({ eyebrow, title, inset = true }: { eyebrow: string; title: string; inset?: boolean }) { return <View style={[styles.sectionTitleWrap, !inset && styles.noInset]}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.sectionTitle}>{title}</Text></View>; }

function OfferCard({ deal, saved, onOpen, onSave }: { deal: Deal; saved: boolean; onOpen: () => void; onSave: () => void }) {
  const image = deal.photoUrl || deal.restaurant.photoUrl;
  return <Pressable onPress={onOpen} style={styles.offerCard}>{image ? <Image source={{ uri: image }} style={styles.offerImage} /> : <View style={[styles.offerImage, styles.imageFallback]}><Ionicons name="restaurant" size={30} color={palette.gold} /></View>}<View style={styles.offerShade} /><View style={styles.dealBadge}><Text style={styles.dealBadgeText}>{offerLabel(deal)}</Text></View><Pressable onPress={(event) => { event.stopPropagation(); onSave(); }} style={[styles.saveButton, saved && styles.saveButtonActive]}><Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={17} color={saved ? palette.night : palette.white} /></Pressable><View style={styles.offerCopy}><Text style={styles.offerVenue}>{deal.restaurant.name}</Text><Text numberOfLines={2} style={styles.offerTitle}>{deal.title}</Text><View style={styles.offerMeta}><Ionicons name="star" size={13} color={palette.gold} /><Text style={styles.offerMetaText}>{deal.dealRating?.toFixed(1) || "New"}</Text>{deal.distanceMiles != null && <Text style={styles.offerDistance}>{(deal.distanceMiles * 1.60934).toFixed(1)} km</Text>}</View></View></Pressable>;
}

function CompactDeal({ deal, onOpen }: { deal: Deal; onOpen: () => void }) { return <Pressable onPress={onOpen} style={styles.compactCard}>{deal.photoUrl || deal.restaurant.photoUrl ? <Image source={{ uri: deal.photoUrl || deal.restaurant.photoUrl || undefined }} style={styles.compactImage} /> : <View style={[styles.compactImage, styles.imageFallback]}><Ionicons name="flash" size={26} color={palette.gold} /></View>}<View style={styles.compactCopy}><Text style={styles.compactBadge}>{offerLabel(deal)}</Text><Text style={styles.compactTitle} numberOfLines={2}>{deal.title}</Text><Text style={styles.compactVenue}>{deal.restaurant.name}</Text></View></Pressable>; }

function VenueCard({ venue, latitude, longitude, onOffer, onMap }: { venue: Restaurant; latitude: number; longitude: number; onOffer?: () => void; onMap: () => void }) { return <Pressable onPress={onOffer || onMap} style={styles.venueCard}>{venue.photoUrl ? <Image source={{ uri: venue.photoUrl }} style={styles.venueImage} /> : <View style={[styles.venueImage, styles.imageFallback]}><Ionicons name="storefront" size={30} color={palette.gold} /></View>}<View style={styles.venueBody}><View style={styles.venueTop}><View style={styles.flex}><Text style={styles.venueCategory}>{venue.cuisine.toUpperCase()}</Text><Text style={styles.venueName}>{venue.name}</Text></View><View style={styles.rating}><Ionicons name="star" size={13} color={palette.gold} /><Text style={styles.ratingText}>{(venue.rating ?? 0).toFixed(1)}</Text></View></View><Text style={styles.address} numberOfLines={1}><Ionicons name="location" size={13} color={palette.gold} /> {venue.address}</Text>{venue.liveDeal && <Text style={styles.venueDeal} numberOfLines={2}>{venue.liveDeal.title}</Text>}<View style={styles.venueFooter}><Text style={styles.distance}>{distanceKm(latitude, longitude, venue).toFixed(1)} km away</Text><Pressable onPress={(event) => { event.stopPropagation(); onMap(); }} style={styles.navigate}><Text style={styles.navigateText}>Navigate</Text><Ionicons name="navigate" size={14} color={palette.night} /></Pressable></View></View></Pressable>; }
function Empty({ icon, title, text, compact = false }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; compact?: boolean }) { return <View style={[styles.empty, compact && styles.emptyCompact]}><Ionicons name={icon} size={26} color={palette.gold} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.night }, content: { paddingBottom: 38 }, header: { height: 66, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, brand: { flexDirection: "row", alignItems: "center", gap: 10 }, logo: { width: 40, height: 40, borderRadius: 13, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" }, brandText: { color: palette.white, fontSize: 21, fontWeight: "800", letterSpacing: -0.5 }, gold: { color: palette.gold }, headerActions: { flexDirection: "row", gap: 7 }, roundButton: { width: 39, height: 39, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,.045)", alignItems: "center", justifyContent: "center" }, roundButtonActive: { backgroundColor: palette.gold, borderColor: palette.gold }, accountButton: { width: 39, height: 39, borderRadius: 20, borderWidth: 1, borderColor: "rgba(245,158,11,.3)", backgroundColor: "rgba(245,158,11,.1)", alignItems: "center", justifyContent: "center" }, language: { color: palette.gold, fontWeight: "900", fontSize: 10 },
  loginRow: { flexDirection: "row", gap: 9, paddingHorizontal: 18, paddingBottom: 10 }, secondaryButton: { flex: 1, height: 42, borderRadius: 14, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center", backgroundColor: palette.card }, secondaryButtonText: { color: palette.white, fontSize: 12, fontWeight: "800" }, goldButton: { flex: 1, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: palette.gold }, goldButtonText: { color: palette.night, fontSize: 12, fontWeight: "900" },
  hero: { height: 490, marginHorizontal: 12, borderRadius: 26, overflow: "hidden", justifyContent: "flex-end", borderWidth: 1, borderColor: palette.line }, heroImage: { borderRadius: 26 }, heroShade: { position: "absolute", inset: 0, backgroundColor: "rgba(9,9,14,.26)" }, heroBottom: { padding: 20, paddingTop: 100, backgroundColor: "rgba(9,9,14,.52)" }, livePill: { alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(9,9,14,.72)", borderWidth: 1, borderColor: "rgba(245,158,11,.35)" }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.gold }, liveLabel: { color: "#ffe2a8", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, heroTitle: { marginTop: 14, color: palette.white, fontFamily: displayFont, fontSize: 39, lineHeight: 43, fontWeight: "700" }, statsRow: { flexDirection: "row", gap: 7, marginTop: 17 }, stat: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(9,9,14,.68)", paddingHorizontal: 10, paddingVertical: 8 }, statValue: { color: palette.white, fontWeight: "900", fontSize: 14 }, statLabel: { color: "#aaaabc", fontSize: 9 },
  notice: { margin: 18, marginBottom: 0, borderRadius: 14, borderWidth: 1, borderColor: "rgba(245,158,11,.28)", backgroundColor: "rgba(245,158,11,.08)", padding: 12, flexDirection: "row", gap: 8 }, noticeText: { color: palette.goldSoft, flex: 1, fontSize: 11, lineHeight: 16 }, error: { margin: 18, marginBottom: 0, borderRadius: 14, borderWidth: 1, borderColor: "rgba(239,68,68,.3)", backgroundColor: "rgba(239,68,68,.1)", padding: 13 }, errorText: { color: "#fecaca", fontSize: 12 }, retry: { color: palette.white, fontWeight: "900", marginTop: 8 },
  sectionTitleWrap: { marginTop: 36, marginBottom: 16, paddingHorizontal: 18 }, noInset: { paddingHorizontal: 0, marginBottom: 0 }, eyebrow: { color: palette.gold, fontSize: 9, fontWeight: "900", letterSpacing: 1.9 }, sectionTitle: { color: palette.white, fontFamily: displayFont, fontSize: 29, fontWeight: "700", marginTop: 5 }, loader: { marginVertical: 32 }, horizontalList: { paddingHorizontal: 18, gap: 13 }, offerCard: { width: 274, height: 330, borderRadius: 22, overflow: "hidden", backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line }, offerImage: { width: "100%", height: "100%" }, imageFallback: { alignItems: "center", justifyContent: "center", backgroundColor: palette.cardRaised }, offerShade: { position: "absolute", inset: 0, backgroundColor: "rgba(9,9,14,.27)" }, dealBadge: { position: "absolute", left: 14, top: 14, backgroundColor: palette.red, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 }, dealBadgeText: { color: palette.white, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, saveButton: { position: "absolute", right: 14, top: 14, width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: "rgba(255,255,255,.2)", backgroundColor: "rgba(0,0,0,.58)", alignItems: "center", justifyContent: "center" }, saveButtonActive: { backgroundColor: palette.gold, borderColor: palette.gold }, offerCopy: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 17, paddingTop: 55, backgroundColor: "rgba(9,9,14,.82)" }, offerVenue: { color: palette.gold, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 }, offerTitle: { color: palette.white, fontFamily: displayFont, fontSize: 23, lineHeight: 27, fontWeight: "700", marginTop: 4 }, offerMeta: { marginTop: 11, flexDirection: "row", alignItems: "center", gap: 4 }, offerMetaText: { color: palette.white, fontSize: 11, fontWeight: "800" }, offerDistance: { color: "#aaaabc", fontSize: 10, marginLeft: "auto" },
  rewardsCard: { marginHorizontal: 18, marginTop: 38, borderRadius: 22, borderWidth: 1, borderColor: "rgba(103,232,249,.18)", backgroundColor: "#0d0d15", padding: 18, flexDirection: "row", alignItems: "center", gap: 14 }, rewardsIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(245,158,11,.11)", alignItems: "center", justifyContent: "center" }, rewardsCopy: { flex: 1 }, rewardsEyebrow: { color: palette.cyan, fontSize: 8, fontWeight: "900", letterSpacing: 1.4 }, rewardsTitle: { color: palette.white, fontFamily: displayFont, fontSize: 24, fontWeight: "700", marginTop: 3 }, rewardsBody: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, compactCard: { width: 230, minHeight: 108, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, flexDirection: "row" }, compactImage: { width: 88, minHeight: 108 }, compactCopy: { flex: 1, padding: 12 }, compactBadge: { color: palette.red, fontSize: 8, fontWeight: "900", letterSpacing: 1 }, compactTitle: { color: palette.white, fontFamily: displayFont, fontSize: 17, lineHeight: 20, fontWeight: "700", marginTop: 6 }, compactVenue: { color: palette.muted, fontSize: 9, marginTop: "auto" },
  searchHeading: { marginHorizontal: 18, marginTop: 2, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }, count: { color: palette.muted, fontSize: 10, marginBottom: 4 }, search: { height: 50, marginHorizontal: 18, marginTop: 17, borderRadius: 16, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 }, searchInput: { flex: 1, color: palette.white, fontSize: 13 }, categories: { paddingHorizontal: 18, paddingVertical: 14, gap: 8 }, category: { borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,.035)", paddingHorizontal: 15, paddingVertical: 9 }, categoryActive: { backgroundColor: palette.gold, borderColor: palette.gold }, categoryText: { color: palette.muted, fontSize: 11, fontWeight: "800" }, categoryTextActive: { color: palette.night },
  venueCard: { marginHorizontal: 18, marginBottom: 15, borderRadius: 21, overflow: "hidden", borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card }, venueImage: { width: "100%", height: 170 }, venueBody: { padding: 16 }, venueTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 }, flex: { flex: 1 }, venueCategory: { color: palette.gold, fontSize: 8, fontWeight: "900", letterSpacing: 1.6 }, venueName: { color: palette.white, fontFamily: displayFont, fontSize: 25, fontWeight: "700", marginTop: 3 }, rating: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "rgba(245,158,11,.1)" }, ratingText: { color: palette.goldSoft, fontWeight: "900", fontSize: 10 }, address: { color: palette.muted, fontSize: 11, marginTop: 10 }, venueDeal: { color: palette.white, fontSize: 13, fontWeight: "700", lineHeight: 18, marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line }, venueFooter: { marginTop: 14, flexDirection: "row", alignItems: "center" }, distance: { color: palette.muted, flex: 1, fontSize: 10 }, navigate: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 18, backgroundColor: palette.gold, paddingHorizontal: 14, paddingVertical: 9 }, navigateText: { color: palette.night, fontSize: 10, fontWeight: "900" },
  empty: { minHeight: 170, marginHorizontal: 18, borderRadius: 21, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center", padding: 24 }, emptyCompact: { minHeight: 115 }, emptyTitle: { color: palette.white, fontSize: 17, fontWeight: "800", marginTop: 9 }, emptyText: { color: palette.muted, textAlign: "center", fontSize: 11, lineHeight: 16, marginTop: 5 }, footer: { color: "#555568", textAlign: "center", fontSize: 9, marginHorizontal: 18, marginTop: 30 },
});
