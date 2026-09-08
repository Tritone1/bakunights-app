import { Ionicons } from "@expo/vector-icons";
import { Linking, Modal, Pressable, StyleSheet, View } from "react-native";

import { LocalizedText as Text } from "./LocalizedText";
import { useLanguage } from "./LanguageContext";
import type { Restaurant } from "./types";

type Props = {
  venue: Restaurant | null;
  onClose: () => void;
};

export function TaxiSheet({ venue, onClose }: Props) {
  const { translate } = useLanguage();
  if (!venue) return null;

  async function openGoogleMaps() {
    const destination = `${venue?.lat},${venue?.lng}`;
    await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`);
  }

  async function openWaze() {
    const destination = `${venue?.lat},${venue?.lng}`;
    await Linking.openURL(`https://waze.com/ul?ll=${encodeURIComponent(destination)}&navigate=yes&zoom=17&utm_source=wheretogo`);
  }

  async function openRideService() {
    const destination = `${venue?.lat},${venue?.lng}`;
    await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`);
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={translate("Close navigation options")}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.headingRow}>
            <View>
              <Text style={styles.eyebrow}>OPTIONAL EXTERNAL APPS</Text>
              <Text style={styles.title}>Other navigation options</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={translate("Close")}>
              <Ionicons name="close" color="#ffffff" size={22} />
            </Pressable>
          </View>

          <View style={styles.destination}>
            <Text style={styles.label}>DESTINATION</Text>
            <Text style={styles.venue}>{venue.name}</Text>
            <Text style={styles.address}>{venue.address}</Text>
          </View>

          <View style={styles.mapsProvider}>
            <View style={styles.providerRow}>
              <View style={styles.mapsLogo}><Ionicons name="map" color="#ffffff" size={23} /></View>
              <View><Text style={styles.providerName}>Google Maps</Text><Text style={styles.providerCaption}>Driving directions</Text></View>
            </View>
            <Text style={styles.help}>Open driving directions to this venue using its exact map coordinates.</Text>
            <View style={styles.mapsActions}>
              <Pressable onPress={openGoogleMaps} style={styles.mapsButton} accessibilityRole="button">
                <Ionicons name="car" color="#ffffff" size={16} />
                <Text style={styles.mapsButtonText}>Driving</Text>
              </Pressable>
              <Pressable onPress={openRideService} style={styles.mapsButton} accessibilityRole="button">
                <Ionicons name="car-sport" color="#ffffff" size={16} />
                <Text style={styles.mapsButtonText}>Ride service</Text>
              </Pressable>
            </View>
            <Text style={styles.rideHelp}>In Google Maps, choose Rides and select Bolt. Google will pass the pickup and destination to Bolt.</Text>
          </View>
          <View style={styles.wazeProvider}>
            <View style={styles.providerRow}>
              <View style={styles.wazeLogo}><Ionicons name="navigate" color="#07151a" size={23} /></View>
              <View><Text style={styles.providerName}>Waze</Text><Text style={styles.providerCaption}>Destination ready in the Waze app</Text></View>
            </View>
            <Pressable onPress={openWaze} style={styles.wazeButton} accessibilityRole="button">
              <Text style={styles.wazeButtonText}>Open destination in Waze</Text>
              <Ionicons name="arrow-forward" color="#07151a" size={16} />
            </Pressable>
          </View>
          <Text style={styles.disclaimer}>WhereToGo sends this venue&apos;s exact coordinates to the selected map or ride service.</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.72)" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "#12121a", paddingHorizontal: 20, paddingBottom: 28, paddingTop: 10 },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 18 },
  headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  eyebrow: { color: "#2fdf84", fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  title: { color: "#ffffff", fontSize: 28, fontWeight: "800", marginTop: 4 },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  destination: { marginTop: 22, padding: 16, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  label: { color: "#777785", fontSize: 10, fontWeight: "800", letterSpacing: 1.6 },
  venue: { color: "#ffffff", fontSize: 16, fontWeight: "700", marginTop: 8 },
  address: { color: "#8f8f9d", fontSize: 13, marginTop: 4 },
  mapsProvider: { marginTop: 14, padding: 16, borderRadius: 18, backgroundColor: "rgba(66,133,244,0.08)", borderWidth: 1, borderColor: "rgba(66,133,244,0.3)" },
  wazeProvider: { marginTop: 10, padding: 16, borderRadius: 18, backgroundColor: "rgba(51,204,255,0.08)", borderWidth: 1, borderColor: "rgba(51,204,255,0.3)" },
  providerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  mapsLogo: { width: 46, height: 46, borderRadius: 13, backgroundColor: "#4285f4", alignItems: "center", justifyContent: "center" },
  wazeLogo: { width: 46, height: 46, borderRadius: 13, backgroundColor: "#33ccff", alignItems: "center", justifyContent: "center" },
  providerName: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  providerCaption: { color: "#8f8f9d", fontSize: 12, marginTop: 2 },
  help: { color: "#9a9aa7", fontSize: 12, lineHeight: 18, marginTop: 14 },
  mapsActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  mapsButton: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: "#4285f4", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  mapsButtonText: { color: "#ffffff", fontWeight: "800", fontSize: 12 },
  rideHelp: { color: "#7f8fab", fontSize: 10, lineHeight: 15, marginTop: 10 },
  wazeButton: { minHeight: 48, borderRadius: 14, backgroundColor: "#33ccff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 14 },
  wazeButtonText: { color: "#07151a", fontWeight: "800", fontSize: 12 },
  disclaimer: { color: "#5f5f6c", fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 14 },
});
