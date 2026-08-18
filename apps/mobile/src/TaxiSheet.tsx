import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import type { Venue } from "./venues";

type Props = {
  venue: Venue | null;
  onClose: () => void;
};

export function TaxiSheet({ venue, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  if (!venue) return null;

  async function copyDestination() {
    await Clipboard.setStringAsync(`${venue?.name}, ${venue?.address}`);
    setCopied(true);
  }

  async function openBolt() {
    await Clipboard.setStringAsync(`${venue?.name}, ${venue?.address}`);
    setCopied(true);
    try {
      await Linking.openURL("bolt://");
    } catch {
      const storeUrl = Platform.select({
        ios: "https://apps.apple.com/app/bolt-request-a-ride/id675033630",
        android: "https://play.google.com/store/apps/details?id=ee.mtakso.client",
        default: "https://bolt.eu/",
      });
      await Linking.openURL(storeUrl);
    }
  }

  async function openGoogleMaps() {
    const destination = `${venue?.latitude},${venue?.longitude}`;
    await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`);
  }

  async function openWaze() {
    const destination = `${venue?.latitude},${venue?.longitude}`;
    await Linking.openURL(`https://waze.com/ul?ll=${encodeURIComponent(destination)}&navigate=yes&zoom=17&utm_source=bakunights`);
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close navigation options">
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.headingRow}>
            <View>
              <Text style={styles.eyebrow}>OPTIONAL EXTERNAL APPS</Text>
              <Text style={styles.title}>Other navigation options</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" color="#ffffff" size={22} />
            </Pressable>
          </View>

          <View style={styles.destination}>
            <Text style={styles.label}>DESTINATION</Text>
            <Text style={styles.venue}>{venue.name}</Text>
            <Text style={styles.address}>{venue.address}</Text>
          </View>

          <View style={styles.provider}>
            <View style={styles.providerRow}>
              <View style={styles.boltLogo}><Text style={styles.boltText}>bolt</Text></View>
              <View><Text style={styles.providerName}>Bolt</Text><Text style={styles.providerCaption}>Ride-hailing app</Text></View>
            </View>
            <Text style={styles.help}>We copy the destination and open the Bolt app. Paste it into Bolt&apos;s destination field to continue.</Text>
            <View style={styles.actions}>
              <Pressable onPress={copyDestination} style={styles.copyButton} accessibilityRole="button">
                <Ionicons name={copied ? "checkmark" : "copy-outline"} color="#ffffff" size={16} />
                <Text style={styles.copyText}>{copied ? "Copied" : "Copy destination"}</Text>
              </Pressable>
              <Pressable onPress={openBolt} style={styles.boltButton} accessibilityRole="button">
                <Text style={styles.boltButtonText}>Open Bolt app</Text>
                <Ionicons name="arrow-forward" color="#07150d" size={16} />
              </Pressable>
            </View>
          </View>

          <View style={styles.mapsProvider}>
            <View style={styles.providerRow}>
              <View style={styles.mapsLogo}><Ionicons name="map" color="#ffffff" size={23} /></View>
              <View><Text style={styles.providerName}>Google Maps</Text><Text style={styles.providerCaption}>Driving directions</Text></View>
            </View>
            <Text style={styles.help}>Open driving directions to this venue using its exact map coordinates.</Text>
            <Pressable onPress={openGoogleMaps} style={styles.mapsButton} accessibilityRole="button">
              <Text style={styles.mapsButtonText}>Open Google Maps</Text>
              <Ionicons name="arrow-forward" color="#ffffff" size={16} />
            </Pressable>
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
          <Text style={styles.disclaimer}>Your route stays in Haragedek unless you choose one of these external apps. Haragedek is not affiliated with either service.</Text>
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
  provider: { marginTop: 14, padding: 16, borderRadius: 18, backgroundColor: "rgba(47,223,132,0.07)", borderWidth: 1, borderColor: "rgba(47,223,132,0.25)" },
  mapsProvider: { marginTop: 10, padding: 16, borderRadius: 18, backgroundColor: "rgba(66,133,244,0.08)", borderWidth: 1, borderColor: "rgba(66,133,244,0.3)" },
  wazeProvider: { marginTop: 10, padding: 16, borderRadius: 18, backgroundColor: "rgba(51,204,255,0.08)", borderWidth: 1, borderColor: "rgba(51,204,255,0.3)" },
  providerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  boltLogo: { width: 46, height: 46, borderRadius: 13, backgroundColor: "#2fdf84", alignItems: "center", justifyContent: "center" },
  boltText: { color: "#07150d", fontSize: 18, fontWeight: "900", letterSpacing: -1.5 },
  mapsLogo: { width: 46, height: 46, borderRadius: 13, backgroundColor: "#4285f4", alignItems: "center", justifyContent: "center" },
  wazeLogo: { width: 46, height: 46, borderRadius: 13, backgroundColor: "#33ccff", alignItems: "center", justifyContent: "center" },
  providerName: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  providerCaption: { color: "#8f8f9d", fontSize: 12, marginTop: 2 },
  help: { color: "#9a9aa7", fontSize: 12, lineHeight: 18, marginTop: 14 },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  copyButton: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  copyText: { color: "#ffffff", fontWeight: "700", fontSize: 12 },
  boltButton: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: "#2fdf84", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  boltButtonText: { color: "#07150d", fontWeight: "800", fontSize: 12 },
  mapsButton: { minHeight: 48, borderRadius: 14, backgroundColor: "#4285f4", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 14 },
  mapsButtonText: { color: "#ffffff", fontWeight: "800", fontSize: 12 },
  wazeButton: { minHeight: 48, borderRadius: 14, backgroundColor: "#33ccff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 14 },
  wazeButtonText: { color: "#07151a", fontWeight: "800", fontSize: 12 },
  disclaimer: { color: "#5f5f6c", fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 14 },
});
