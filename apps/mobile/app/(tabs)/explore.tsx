import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { TaxiSheet } from "@/src/TaxiSheet";
import { useUserLocation } from "@/src/LocationContext";
import { BAKU_CENTER, VENUES, type Venue } from "@/src/venues";

export default function MapScreen() {
  const params = useLocalSearchParams<{ venue?: string; navigate?: string }>();
  const initialVenue = useMemo(() => VENUES.find((item) => item.id === Number(params.venue)) ?? VENUES[0], [params.venue]);
  const [selected, setSelected] = useState<Venue | null>(initialVenue ?? null);
  const [navigationActive, setNavigationActive] = useState(Boolean(initialVenue) && params.navigate === "1");
  const [taxiVenue, setTaxiVenue] = useState<Venue | null>(null);
  const mapRef = useRef<MapView>(null);
  const hasCenteredOnUser = useRef(false);
  const { coords, loading: locating, error: locationError, requestLocation, refreshLocation } = useUserLocation();
  const locationAllowed = Boolean(coords);

  useEffect(() => {
    setSelected(initialVenue ?? null);
    setNavigationActive(Boolean(initialVenue) && params.navigate === "1");
    if (!initialVenue) return;
    mapRef.current?.animateToRegion({ latitude: initialVenue.latitude, longitude: initialVenue.longitude, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 500);
  }, [initialVenue, params.navigate]);

  useEffect(() => {
    if (!coords || params.venue || hasCenteredOnUser.current) return;
    hasCenteredOnUser.current = true;
    mapRef.current?.animateToRegion({ latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 }, 500);
  }, [coords, params.venue]);

  useEffect(() => {
    if (!coords || !navigationActive || !selected) return;
    mapRef.current?.fitToCoordinates(
      [
        { latitude: coords.latitude, longitude: coords.longitude },
        { latitude: selected.latitude, longitude: selected.longitude },
      ],
      { edgePadding: { top: 90, right: 55, bottom: 210, left: 55 }, animated: true },
    );
  }, [coords, navigationActive, selected]);

  const routeDistance = useMemo(() => {
    if (!coords || !selected) return null;
    const toRadians = (value: number) => value * Math.PI / 180;
    const latDistance = toRadians(selected.latitude - coords.latitude);
    const lngDistance = toRadians(selected.longitude - coords.longitude);
    const a = Math.sin(latDistance / 2) ** 2 + Math.cos(toRadians(coords.latitude)) * Math.cos(toRadians(selected.latitude)) * Math.sin(lngDistance / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, [coords, selected]);

  function selectVenue(venue: Venue) {
    setSelected(venue);
    setNavigationActive(false);
    mapRef.current?.animateToRegion({ latitude: venue.latitude, longitude: venue.longitude, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 450);
  }

  async function startNavigation() {
    if (!selected) return;
    const available = coords ? true : await requestLocation();
    if (available) setNavigationActive(true);
  }

  function focusRoute() {
    if (!coords || !selected) return;
    mapRef.current?.fitToCoordinates(
      [
        { latitude: coords.latitude, longitude: coords.longitude },
        { latitude: selected.latitude, longitude: selected.longitude },
      ],
      { edgePadding: { top: 90, right: 55, bottom: 210, left: 55 }, animated: true },
    );
  }

  async function showMyLocation() {
    const available = coords ? await refreshLocation() : await requestLocation();
    if (!available) return;
    hasCenteredOnUser.current = true;
    if (coords) mapRef.current?.animateToRegion({ latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 }, 500);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>HARAGEDEK NAVIGATION</Text><Text style={styles.title}>{navigationActive ? "Your route" : "Baku night map"}</Text></View>
        <Pressable onPress={showMyLocation} style={[styles.locationButton, locationAllowed && styles.locationActive]} accessibilityRole="button" accessibilityLabel="Show my current location">
          <Ionicons name="navigate" size={19} color={locationAllowed ? "#09090e" : "#f59e0b"} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.venueStrip}>
        {VENUES.map((venue) => <Pressable key={venue.id} onPress={() => selectVenue(venue)} style={[styles.venuePill, venue.id === selected?.id && styles.venuePillSelected]}><Text numberOfLines={1} style={[styles.venuePillText, venue.id === selected?.id && styles.venuePillTextSelected]}>{venue.name}</Text></Pressable>)}
      </ScrollView>

      <View style={styles.mapWrap}>
        <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={BAKU_CENTER} mapType="mutedStandard" showsCompass showsUserLocation={locationAllowed} showsMyLocationButton={false}>
          {navigationActive && coords && selected && <Polyline coordinates={[{ latitude: coords.latitude, longitude: coords.longitude }, { latitude: selected.latitude, longitude: selected.longitude }]} strokeColor="#67e8f9" strokeWidth={6} lineCap="round" lineJoin="round" />}
          {coords && <Marker coordinate={{ latitude: coords.latitude, longitude: coords.longitude }} title="Your location" anchor={{ x: 0.5, y: 0.5 }}><View style={styles.userMarkerOuter}><View style={styles.userMarkerInner} /></View></Marker>}
          {VENUES.map((venue) => <Marker key={venue.id} coordinate={{ latitude: venue.latitude, longitude: venue.longitude }} title={venue.name} description={venue.deal} pinColor={venue.id === selected?.id ? "#f59e0b" : "#7c3aed"} onPress={() => selectVenue(venue)} />)}
        </MapView>

        {!locationAllowed && <Pressable onPress={showMyLocation} disabled={locating} style={styles.permissionBanner}><Ionicons name="location-outline" color="#f59e0b" size={17} /><Text style={styles.permissionText}>{locating ? "Finding your position…" : locationError ? `${locationError} Tap to retry.` : "Tap to show your position"}</Text></Pressable>}

        {selected ? <View style={styles.destinationCard}>
          <View style={styles.destinationMain}>
            <Image source={{ uri: selected.image }} style={styles.image} />
            <View style={styles.destinationCopy}><Text style={styles.selectedLabel}>{navigationActive ? "IN-APP ROUTE" : "SELECTED DESTINATION"}</Text><Text numberOfLines={1} style={styles.venueName}>{selected.name}</Text><Text numberOfLines={1} style={styles.address}>{selected.address}</Text></View>
            <Pressable onPress={() => setTaxiVenue(selected)} style={styles.optionsButton} accessibilityRole="button" accessibilityLabel={`Other navigation options for ${selected.name}`}><Ionicons name="ellipsis-horizontal" color="#ffffff" size={22} /></Pressable>
          </View>
          <Pressable onPress={navigationActive && coords ? focusRoute : startNavigation} style={[styles.navigateButton, navigationActive && coords && styles.routeActiveButton]} accessibilityRole="button" accessibilityLabel={navigationActive ? `Show active route to ${selected.name}` : `Navigate to ${selected.name} in Haragedek`}>
            <Ionicons name="navigate" color="#09090e" size={18} />
            <Text style={styles.navigateText}>{navigationActive && coords ? `Route active${routeDistance === null ? "" : `  ·  ${routeDistance.toFixed(1)} km`}` : locating ? "Finding your location…" : "Navigate me in Haragedek"}</Text>
          </Pressable>
        </View> : <View style={styles.emptyMapCard}><Ionicons name="storefront-outline" color="#f59e0b" size={22} /><View><Text style={styles.venueName}>No live venues yet</Text><Text style={styles.address}>Verified merchant venues will appear on this map.</Text></View></View>}
      </View>
      <TaxiSheet venue={taxiVenue} onClose={() => setTaxiVenue(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#09090e" },
  header: { paddingHorizontal: 18, paddingTop: 13, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: "#f59e0b", fontSize: 9, fontWeight: "800", letterSpacing: 1.8 },
  title: { color: "#ffffff", fontSize: 27, fontWeight: "900", letterSpacing: -0.6, marginTop: 3 },
  locationButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: "rgba(245,158,11,0.4)", backgroundColor: "#14141d", alignItems: "center", justifyContent: "center" },
  locationActive: { backgroundColor: "#f59e0b", borderColor: "#f59e0b" },
  venueStrip: { paddingHorizontal: 18, paddingBottom: 13, gap: 8 },
  venuePill: { maxWidth: 170, borderRadius: 17, borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "#14141d" },
  venuePillSelected: { backgroundColor: "#f59e0b", borderColor: "#f59e0b" },
  venuePillText: { color: "#8f8f9d", fontSize: 11, fontWeight: "700" },
  venuePillTextSelected: { color: "#09090e" },
  mapWrap: { flex: 1, overflow: "hidden", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  permissionBanner: { position: "absolute", top: 12, alignSelf: "center", borderRadius: 18, backgroundColor: "rgba(14,14,21,0.94)", borderWidth: 1, borderColor: "rgba(245,158,11,0.28)", paddingHorizontal: 13, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 7 },
  permissionText: { color: "#ffffff", fontSize: 11, fontWeight: "700" },
  userMarkerOuter: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#ffffff", backgroundColor: "rgba(37,99,235,0.25)", alignItems: "center", justifyContent: "center" },
  userMarkerInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#2563eb" },
  destinationCard: { position: "absolute", left: 12, right: 12, bottom: 12, borderRadius: 20, padding: 10, backgroundColor: "rgba(14,14,21,0.95)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", gap: 10 },
  emptyMapCard: { position: "absolute", left: 12, right: 12, bottom: 12, minHeight: 82, borderRadius: 20, padding: 16, backgroundColor: "rgba(14,14,21,0.95)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", flexDirection: "row", alignItems: "center", gap: 12 },
  destinationMain: { flexDirection: "row", alignItems: "center", gap: 11 },
  image: { width: 66, height: 60, borderRadius: 13 },
  destinationCopy: { flex: 1 },
  selectedLabel: { color: "#f59e0b", fontSize: 8, fontWeight: "800", letterSpacing: 1.2 },
  venueName: { color: "#ffffff", fontSize: 17, fontWeight: "800", marginTop: 3 },
  address: { color: "#858593", fontSize: 10, marginTop: 4 },
  optionsButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  navigateButton: { minHeight: 46, borderRadius: 14, backgroundColor: "#f59e0b", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  routeActiveButton: { backgroundColor: "#67e8f9" },
  navigateText: { color: "#09090e", fontSize: 12, fontWeight: "900" },
});
