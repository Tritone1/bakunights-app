import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/AuthContext";
import { useLanguage } from "@/src/LanguageContext";

export default function TabLayout() {
  const { translate } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const merchant = user?.role === "MERCHANT" || user?.role === "ADMIN";
  return (
    <View style={styles.root}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#f59e0b",
        tabBarInactiveTintColor: "#777785",
        tabBarStyle: { backgroundColor: "#0e0e15", borderTopColor: "rgba(255,255,255,0.08)", height: 82, paddingTop: 8, overflow: "visible" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", paddingBottom: 7 },
      }}>
      <Tabs.Screen name="index" options={{ title: translate(merchant ? "Dashboard" : "Home"), tabBarIcon: ({ color, size }) => <Ionicons name={merchant ? "grid" : "home"} color={color} size={size} /> }} />
      <Tabs.Screen name="rewards" options={{ href: merchant ? null : undefined, title: translate("Rewards"), tabBarIcon: ({ color, size }) => <Ionicons name="gift" color={color} size={size} /> }} />
      <Tabs.Screen name="visits" options={{ href: merchant ? null : undefined, title: translate("My visits"), tabBarIcon: ({ color, size }) => <Ionicons name="time" color={color} size={size} /> }} />
      <Tabs.Screen name="menu" options={{ href: merchant ? undefined : null, title: translate("Menu"), tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" color={color} size={size} /> }} />
      <Tabs.Screen name="scan" options={{ href: null, title: translate("Scan"), tabBarIcon: ({ color, size }) => <Ionicons name="camera" color={color} size={size} /> }} />
      <Tabs.Screen name="account" options={{ title: translate("Profile"), tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }} />
      <Tabs.Screen name="explore" options={{ href: null, title: translate("Map"), tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} /> }} />
    </Tabs>
    {merchant ? <Pressable onPress={() => router.push("/(tabs)/scan" as never)} accessibilityRole="button" accessibilityLabel={translate("Scan customer QR")} style={[styles.cameraButton, { bottom: Math.max(insets.bottom, 8) + 62 }, pathname.endsWith("/scan") && styles.cameraButtonActive]}><Ionicons name="camera" size={28} color="#09090e" /></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cameraButton: { position: "absolute", left: "50%", marginLeft: -31, width: 62, height: 62, borderRadius: 31, backgroundColor: "#f59e0b", borderWidth: 5, borderColor: "#09090e", alignItems: "center", justifyContent: "center", zIndex: 50, shadowColor: "#000", shadowOpacity: .42, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 12 },
  cameraButtonActive: { borderColor: "#67e8f9", transform: [{ scale: 1.04 }] },
});
