import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useLanguage } from "@/src/LanguageContext";
import { useUserLocation } from "@/src/LocationContext";
import { LocalizedText as Text } from "@/src/LocalizedText";
import { TaxiSheet } from "@/src/TaxiSheet";
import { displayFont, palette } from "@/src/theme";
import type { Restaurant } from "@/src/types";

const BAKU_CENTER = { latitude: 40.3977, longitude: 49.8671, latitudeDelta: 0.09, longitudeDelta: 0.09 };

export default function MapScreen() {
  const params = useLocalSearchParams<{ venue?: string; navigate?: string }>();
  const { language } = useLanguage();
  const [venues, setVenues] = useState<Restaurant[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [navigationActive, setNavigationActive] = useState(params.navigate === "1");
  const [optionsVenue, setOptionsVenue] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mapRef = useRef<MapView>(null);
  const { coords, loading: locating, error: locationError, requestLocation, refreshLocation } = useUserLocation();

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => api<{ restaurants: Restaurant[] }>(`/restaurants?lang=${language}`).then(({ restaurants }) => {
      if (!active) return;
      setVenues(restaurants);
      const initial = restaurants.find((venue) => venue.id === params.venue) || restaurants[0] || null;
      setSelected(initial);
      if (initial) setTimeout(() => mapRef.current?.animateToRegion({ latitude: initial.lat, longitude: initial.lng, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 450), 50);
      setError("");
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Map venues could not load."))
      .finally(() => active && setLoading(false)), 0);
    return () => { active = false; clearTimeout(timer); };
  }, [language, params.venue]);

  useEffect(() => {
    if (!coords || !navigationActive || !selected) return;
    mapRef.current?.fitToCoordinates([{ latitude: coords.latitude, longitude: coords.longitude }, { latitude: selected.lat, longitude: selected.lng }], { edgePadding: { top: 90, right: 55, bottom: 210, left: 55 }, animated: true });
  }, [coords, navigationActive, selected]);

  const routeDistance = useMemo(() => {
    if (!coords || !selected) return null;
    const radians = (value: number) => value * Math.PI / 180;
    const latDistance = radians(selected.lat - coords.latitude);
    const lngDistance = radians(selected.lng - coords.longitude);
    const a = Math.sin(latDistance / 2) ** 2 + Math.cos(radians(coords.latitude)) * Math.cos(radians(selected.lat)) * Math.sin(lngDistance / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, [coords, selected]);

  function selectVenue(venue: Restaurant) {
    setSelected(venue);
    setNavigationActive(false);
    mapRef.current?.animateToRegion({ latitude: venue.lat, longitude: venue.lng, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 450);
  }

  async function navigate() {
    if (!selected) return;
    const available = coords ? true : await requestLocation();
    if (available) setNavigationActive(true);
  }

  async function showMe() {
    const available = coords ? await refreshLocation() : await requestLocation();
    if (available && coords) mapRef.current?.animateToRegion({ latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 }, 450);
  }

  return <SafeAreaView style={styles.screen} edges={["top"]}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>WHERETOGO NAVIGATION</Text><Text style={styles.title}>{navigationActive ? "Your route" : "Find your way"}</Text></View><Pressable onPress={() => void showMe()} style={[styles.locationButton, coords && styles.locationActive]}><Ionicons name="navigate" size={19} color={coords ? palette.night : palette.gold} /></Pressable></View>
    {loading ? <ActivityIndicator color={palette.gold} style={styles.loader} /> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.venueStrip}>{venues.map((venue) => <Pressable key={venue.id} onPress={() => selectVenue(venue)} style={[styles.venuePill, venue.id === selected?.id && styles.venuePillSelected]}><Text numberOfLines={1} style={[styles.venuePillText, venue.id === selected?.id && styles.venuePillTextSelected]}>{venue.name}</Text></Pressable>)}</ScrollView>}
    <View style={styles.mapWrap}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={BAKU_CENTER} mapType="mutedStandard" showsCompass showsUserLocation={Boolean(coords)} showsMyLocationButton={false}>
        {navigationActive && coords && selected && <Polyline coordinates={[{ latitude: coords.latitude, longitude: coords.longitude }, { latitude: selected.lat, longitude: selected.lng }]} strokeColor={palette.cyan} strokeWidth={6} lineCap="round" lineJoin="round" />}
        {venues.map((venue) => <Marker key={venue.id} coordinate={{ latitude: venue.lat, longitude: venue.lng }} title={venue.name} description={venue.liveDeal?.title || venue.address} pinColor={venue.id === selected?.id ? palette.gold : "#7c3aed"} onPress={() => selectVenue(venue)} />)}
      </MapView>
      {!coords && <Pressable onPress={() => void showMe()} disabled={locating} style={styles.permission}><Ionicons name="location-outline" size={17} color={palette.gold} /><Text style={styles.permissionText}>{locating ? "Finding your position…" : locationError || "Tap to show your position"}</Text></Pressable>}
      {error && <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View>}
      {selected ? <View style={styles.destination}>
        <View style={styles.destinationTop}>{selected.photoUrl ? <Image source={{ uri: selected.photoUrl }} style={styles.image} /> : <View style={[styles.image, styles.fallback]}><Ionicons name="storefront" size={22} color={palette.gold} /></View>}<View style={styles.copy}><Text style={styles.selectedLabel}>{navigationActive ? "IN-APP ROUTE" : "SELECTED DESTINATION"}</Text><Text numberOfLines={1} style={styles.name}>{selected.name}</Text><Text numberOfLines={1} style={styles.address}>{selected.address}</Text></View><Pressable onPress={() => setOptionsVenue(selected)} style={styles.options}><Ionicons name="ellipsis-horizontal" size={21} color={palette.white} /></Pressable></View>
        <Pressable onPress={() => void navigate()} style={[styles.navigate, navigationActive && styles.navigateActive]}><Ionicons name="navigate" size={18} color={palette.night} /><Text style={styles.navigateText}>{navigationActive ? `Route active${routeDistance == null ? "" : ` · ${routeDistance.toFixed(1)} km`}` : "Navigate in WhereToGo"}</Text></Pressable>
      </View> : !loading && <View style={styles.empty}><Ionicons name="storefront-outline" size={22} color={palette.gold} /><Text style={styles.name}>No venues available</Text></View>}
    </View>
    <TaxiSheet venue={optionsVenue} onClose={() => setOptionsVenue(null)} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.night }, header: { paddingHorizontal: 18, paddingTop: 13, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, eyebrow: { color: palette.gold, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 }, title: { color: palette.white, fontFamily: displayFont, fontSize: 29, fontWeight: "700", marginTop: 3 }, locationButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: "rgba(245,158,11,.4)", backgroundColor: palette.card, alignItems: "center", justifyContent: "center" }, locationActive: { backgroundColor: palette.gold }, loader: { marginVertical: 12 }, venueStrip: { paddingHorizontal: 18, paddingBottom: 13, gap: 8 }, venuePill: { maxWidth: 170, borderRadius: 17, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: palette.card }, venuePillSelected: { backgroundColor: palette.gold, borderColor: palette.gold }, venuePillText: { color: palette.muted, fontSize: 11, fontWeight: "800" }, venuePillTextSelected: { color: palette.night }, mapWrap: { flex: 1, overflow: "hidden", borderTopWidth: 1, borderTopColor: palette.line }, permission: { position: "absolute", top: 12, alignSelf: "center", borderRadius: 18, backgroundColor: "rgba(14,14,21,.94)", borderWidth: 1, borderColor: "rgba(245,158,11,.28)", paddingHorizontal: 13, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 7 }, permissionText: { color: palette.white, fontSize: 11, fontWeight: "700", maxWidth: 270 }, error: { position: "absolute", top: 12, left: 18, right: 18, borderRadius: 14, backgroundColor: "rgba(80,10,15,.92)", padding: 12 }, errorText: { color: "#fecaca", fontSize: 11 }, destination: { position: "absolute", left: 12, right: 12, bottom: 12, borderRadius: 20, padding: 10, backgroundColor: "rgba(14,14,21,.96)", borderWidth: 1, borderColor: "rgba(255,255,255,.12)", gap: 10 }, destinationTop: { flexDirection: "row", alignItems: "center", gap: 11 }, image: { width: 66, height: 60, borderRadius: 13 }, fallback: { alignItems: "center", justifyContent: "center", backgroundColor: palette.cardRaised }, copy: { flex: 1 }, selectedLabel: { color: palette.gold, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 }, name: { color: palette.white, fontFamily: displayFont, fontSize: 18, fontWeight: "700", marginTop: 3 }, address: { color: palette.muted, fontSize: 10, marginTop: 4 }, options: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }, navigate: { minHeight: 46, borderRadius: 14, backgroundColor: palette.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, navigateActive: { backgroundColor: palette.cyan }, navigateText: { color: palette.night, fontSize: 12, fontWeight: "900" }, empty: { position: "absolute", left: 12, right: 12, bottom: 12, borderRadius: 20, padding: 18, backgroundColor: "rgba(14,14,21,.96)", flexDirection: "row", alignItems: "center", gap: 10 },
});
