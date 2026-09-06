import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#f59e0b",
        tabBarInactiveTintColor: "#777785",
        tabBarStyle: { backgroundColor: "#0e0e15", borderTopColor: "rgba(255,255,255,0.08)", height: 82, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", paddingBottom: 7 },
      }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }} />
      <Tabs.Screen name="rewards" options={{ title: "Rewards", tabBarIcon: ({ color, size }) => <Ionicons name="gift" color={color} size={size} /> }} />
      <Tabs.Screen name="explore" options={{ title: "Map", tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} /> }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }} />
    </Tabs>
  );
}
