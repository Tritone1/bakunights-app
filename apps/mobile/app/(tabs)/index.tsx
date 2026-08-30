import { Ionicons } from "@expo/vector-icons";
import type { LocationObjectCoords } from "expo-location";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/AuthContext";
import { useUserLocation } from "@/src/LocationContext";
import { VENUES, type Venue } from "@/src/venues";

const CATEGORIES = ["All", "Restaurant", "Bar", "Pub", "Lounge"] as const;

function distanceKm(from: LocationObjectCoords, venue: Venue) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthRadius = 6371;
  const latDistance = toRadians(venue.latitude - from.latitude);
  const lngDistance = toRadians(venue.longitude - from.longitude);
  const a = Math.sin(latDistance / 2) ** 2 + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(venue.latitude)) * Math.sin(lngDistance / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DiscoverScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const { user, loading: authLoading, logout } = useAuth();
  const { coords: location, loading: locating, error: locationError, requestLocation } = useUserLocation();

  const venues = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = VENUES.filter((venue) => (category === "All" || venue.category === category) && (!normalizedQuery || `${venue.name} ${venue.category} ${venue.address} ${venue.deal}`.toLowerCase().includes(normalizedQuery)));
    return location ? [...result].sort((a, b) => distanceKm(location, a) - distanceKm(location, b)) : result;
  }, [category, location, query]);

  async function findMe() {
    const available = await requestLocation();
    if (!available) Alert.alert("Location unavailable", "Enable Location Services, Precise Location, and While Using the App for Expo Go, then try again.");
  }

  function toggleSave(id: number) {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openAccountMenu() {
    Alert.alert(user?.name || "Your account", user?.email, [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void logout() },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.brand}><View style={styles.logo}><Ionicons name="moon" color="#09090e" size={20} /></View><Text style={styles.brandText}>Baku<Text style={styles.gold}>Nights</Text></Text></View>
          <Pressable onPress={findMe} disabled={locating} style={[styles.locationButton, location && styles.locationActive]} accessibilityRole="button">
            <Ionicons name={location ? "navigate" : "location-outline"} color={location ? "#09090e" : "#f59e0b"} size={16} />
            <Text style={[styles.locationText, location && styles.locationTextActive]}>{locating ? "Finding…" : location ? "Location active" : "Find me"}</Text>
          </Pressable>
        </View>
        {!authLoading && !user && <View style={styles.authActions}>
          <Pressable onPress={() => router.push("/login/customer" as never)} style={styles.customerLogin} accessibilityRole="button">
            <Ionicons name="person-outline" color="#ffffff" size={16} />
            <Text style={styles.customerLoginText}>Customer login</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/login/merchant" as never)} style={styles.merchantLogin} accessibilityRole="button">
            <Ionicons name="storefront-outline" color="#09090e" size={16} />
            <Text style={styles.merchantLoginText}>Merchant login</Text>
          </Pressable>
        </View>}
        {!authLoading && user && <Pressable onPress={openAccountMenu} style={styles.accountBar} accessibilityRole="button">
          <View style={styles.accountAvatar}><Text style={styles.accountAvatarText}>{user.name.slice(0, 1).toUpperCase()}</Text></View>
          <View style={styles.accountCopy}><Text style={styles.accountName}>{user.name}</Text><Text style={styles.accountRole}>{user.role === "MERCHANT" ? "Merchant account" : "Customer account"}</Text></View>
          <Ionicons name="chevron-down" color="#8f8f9d" size={18} />
        </Pressable>}
        {locationError && <Pressable onPress={findMe} style={styles.locationError} accessibilityRole="button"><Ionicons name="warning-outline" color="#f59e0b" size={17} /><Text style={styles.locationErrorText}>{locationError} Tap to retry.</Text></Pressable>}

        <View style={styles.hero}>
          <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE IN BAKU</Text></View>
          <Text style={styles.heroTitle}>Tonight in <Text style={styles.gold}>Baku</Text></Text>
          <Text style={styles.heroBody}>Native dining and nightlife discovery, built for your iPhone.</Text>
        </View>

        <View style={styles.searchWrap}><Ionicons name="search" color="#777785" size={19} /><TextInput value={query} onChangeText={setQuery} placeholder="Search venues, vibes, or districts" placeholderTextColor="#777785" style={styles.searchInput} returnKeyType="search" /></View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
          {CATEGORIES.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.category, category === item && styles.categorySelected]}><Text style={[styles.categoryText, category === item && styles.categoryTextSelected]}>{item}</Text></Pressable>)}
        </ScrollView>

        <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>CURATED FOR TONIGHT</Text><Text style={styles.sectionTitle}>{location ? "Nearest to you" : "Find your next stop"}</Text></View><Text style={styles.count}>{venues.length} venues</Text></View>

        {venues.map((venue) => {
          const liveDistance = location ? `${distanceKm(location, venue).toFixed(1)} km` : venue.distance;
          return <View key={venue.id} style={styles.card}>
            <Image source={{ uri: venue.image }} style={styles.cardImage} />
            <View style={styles.imageShade} />
            <Pressable onPress={() => toggleSave(venue.id)} style={[styles.save, saved.has(venue.id) && styles.saveActive]} accessibilityRole="button" accessibilityLabel={`${saved.has(venue.id) ? "Remove" : "Save"} ${venue.name}`}><Ionicons name={saved.has(venue.id) ? "bookmark" : "bookmark-outline"} color={saved.has(venue.id) ? "#09090e" : "#ffffff"} size={18} /></Pressable>
            <View style={styles.cardBody}>
              <View style={styles.cardTitleRow}><View style={styles.cardTitleWrap}><Text style={styles.cardCategory}>{venue.category.toUpperCase()}</Text><Text style={styles.cardTitle}>{venue.name}</Text></View><View style={styles.rating}><Ionicons name="star" color="#f59e0b" size={13} /><Text style={styles.ratingText}>{venue.rating}</Text></View></View>
              <View style={styles.addressRow}><Ionicons name="location" color="#f59e0b" size={15} /><Text style={styles.address} numberOfLines={1}>{venue.address}</Text><Text style={styles.distance}>{liveDistance}</Text></View>
              <Text style={styles.deal}>{venue.deal}</Text>
              <View style={styles.cardFooter}><Text style={styles.hours}>{venue.hours}</Text><Pressable onPress={() => router.push({ pathname: "/(tabs)/explore", params: { venue: String(venue.id), navigate: "1" } })} style={styles.navigateButton} accessibilityRole="button" accessibilityLabel={`Navigate to ${venue.name} in WhereToGo`}><Text style={styles.navigateText}>Navigate me</Text><Ionicons name="navigate" color="#09090e" size={16} /></Pressable></View>
            </View>
          </View>;
        })}
        {!venues.length && <View style={styles.empty}><Ionicons name="storefront-outline" color="#f59e0b" size={28} /><Text style={styles.emptyTitle}>No live venues yet</Text><Text style={styles.emptyBody}>Verified merchant venues will appear here.</Text></View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#09090e" },
  content: { paddingBottom: 30 },
  header: { paddingHorizontal: 18, height: 66, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f59e0b", alignItems: "center", justifyContent: "center" },
  brandText: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  gold: { color: "#f59e0b" },
  locationButton: { height: 38, borderRadius: 19, borderWidth: 1, borderColor: "rgba(245,158,11,0.35)", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  locationActive: { backgroundColor: "#f59e0b", borderColor: "#f59e0b" },
  locationText: { color: "#f59e0b", fontWeight: "700", fontSize: 11 },
  locationTextActive: { color: "#09090e" },
  authActions: { marginHorizontal: 18, marginBottom: 8, flexDirection: "row", gap: 9 },
  customerLogin: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", backgroundColor: "#15151e", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  customerLoginText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  merchantLogin: { flex: 1, height: 44, borderRadius: 14, backgroundColor: "#f59e0b", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  merchantLoginText: { color: "#09090e", fontSize: 12, fontWeight: "900" },
  accountBar: { marginHorizontal: 18, marginBottom: 8, minHeight: 52, borderRadius: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "#15151e", paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 10 },
  accountAvatar: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#f59e0b", alignItems: "center", justifyContent: "center" },
  accountAvatarText: { color: "#09090e", fontSize: 14, fontWeight: "900" },
  accountCopy: { flex: 1 },
  accountName: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  accountRole: { color: "#777785", fontSize: 10, marginTop: 2 },
  locationError: { marginHorizontal: 18, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: "rgba(245,158,11,0.3)", backgroundColor: "rgba(245,158,11,0.08)", paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  locationErrorText: { color: "#f8cf83", fontSize: 11, lineHeight: 16, flex: 1 },
  hero: { marginHorizontal: 18, marginTop: 10, borderRadius: 24, padding: 22, overflow: "hidden", backgroundColor: "#15151e", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  liveBadge: { alignSelf: "flex-start", borderRadius: 14, backgroundColor: "rgba(245,158,11,0.12)", paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", gap: 7, alignItems: "center" },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#f59e0b" },
  liveText: { color: "#f8cf83", fontSize: 9, fontWeight: "800", letterSpacing: 1.4 },
  heroTitle: { color: "#ffffff", fontSize: 42, lineHeight: 45, fontWeight: "900", letterSpacing: -1.5, marginTop: 18 },
  heroBody: { color: "#a0a0ad", fontSize: 14, lineHeight: 21, marginTop: 12, maxWidth: 310 },
  searchWrap: { marginHorizontal: 18, marginTop: 22, height: 50, borderRadius: 16, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#12121a", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  searchInput: { color: "#ffffff", flex: 1, fontSize: 14 },
  categories: { gap: 8, paddingHorizontal: 18, paddingVertical: 16 },
  category: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", backgroundColor: "rgba(255,255,255,0.03)" },
  categorySelected: { backgroundColor: "#f59e0b", borderColor: "#f59e0b" },
  categoryText: { color: "#8f8f9d", fontSize: 12, fontWeight: "700" },
  categoryTextSelected: { color: "#09090e" },
  sectionHeading: { marginHorizontal: 18, marginTop: 9, marginBottom: 14, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  eyebrow: { color: "#f59e0b", fontSize: 9, fontWeight: "800", letterSpacing: 1.8 },
  sectionTitle: { color: "#ffffff", fontSize: 25, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
  count: { color: "#777785", fontSize: 11 },
  card: { marginHorizontal: 18, marginBottom: 16, borderRadius: 22, backgroundColor: "#14141d", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  cardImage: { height: 175, width: "100%" },
  imageShade: { position: "absolute", left: 0, right: 0, top: 90, height: 85, backgroundColor: "rgba(9,9,14,0.32)" },
  save: { position: "absolute", right: 14, top: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  saveActive: { backgroundColor: "#f59e0b", borderColor: "#f59e0b" },
  cardBody: { padding: 17 },
  cardTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardTitleWrap: { flex: 1 },
  cardCategory: { color: "#f59e0b", fontSize: 9, letterSpacing: 1.7, fontWeight: "800" },
  cardTitle: { color: "#ffffff", fontSize: 24, fontWeight: "800", marginTop: 3 },
  rating: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(245,158,11,0.1)", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 },
  ratingText: { color: "#f8cf83", fontSize: 11, fontWeight: "800" },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  address: { color: "#858593", fontSize: 12, flex: 1 },
  distance: { color: "#f59e0b", fontSize: 11, fontWeight: "800" },
  deal: { color: "#ffffff", fontSize: 14, fontWeight: "700", marginTop: 17, paddingTop: 15, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)" },
  cardFooter: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  hours: { color: "#777785", fontSize: 10, flex: 1 },
  navigateButton: { height: 39, borderRadius: 20, backgroundColor: "#f59e0b", paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 7 },
  navigateText: { color: "#09090e", fontSize: 11, fontWeight: "800" },
  empty: { margin: 18, minHeight: 180, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800", marginTop: 10 },
  emptyBody: { color: "#777785", fontSize: 12, marginTop: 5 },
});
