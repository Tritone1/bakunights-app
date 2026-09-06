import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { LocationProvider } from "@/src/LocationContext";
import { AuthProvider } from "@/src/AuthContext";
import { LanguageProvider } from "@/src/LanguageContext";

const whereToGoTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: "#f59e0b", background: "#09090e", card: "#12121c", border: "rgba(255,255,255,0.09)" },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={whereToGoTheme}>
      <LanguageProvider>
        <AuthProvider>
          <LocationProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#09090e" } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="deals/[id]" />
            <Stack.Screen name="login/[accountType]" options={{ presentation: "modal" }} />
            <Stack.Screen name="register/[accountType]" options={{ presentation: "modal" }} />
          </Stack>
          <StatusBar style="light" />
          </LocationProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
