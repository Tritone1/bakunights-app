import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ComponentProps } from "react";
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";

type PickedImage = { uri: string; name: string; type: string; size?: number };

export default function MobileRegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ accountType?: string }>();
  const isMerchant = params.accountType === "merchant";
  const [name, setName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueLat, setVenueLat] = useState("");
  const [venueLng, setVenueLng] = useState("");
  const [venueImage, setVenueImage] = useState<PickedImage | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devVerificationUrl, setDevVerificationUrl] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");

  async function findVenueLocation() {
    setError("");
    setLocationMessage("");
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Allow location access or enter the venue address and coordinates manually.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setVenueLat(position.coords.latitude.toFixed(6));
      setVenueLng(position.coords.longitude.toFixed(6));
      try {
        const [place] = await Location.reverseGeocodeAsync(position.coords);
        if (place) {
          setVenueAddress([place.streetNumber, place.street, place.district, place.city, place.region].filter(Boolean).join(", "));
        }
      } catch {
        // Coordinates remain usable if reverse geocoding is unavailable.
      }
      setLocationMessage(`Location captured (approximately ${Math.round(position.coords.accuracy ?? 0)} m accuracy).`);
    } catch {
      setError("Could not find the venue location. Enter its address and coordinates manually.");
    } finally {
      setLocating(false);
    }
  }

  async function pickImage() {
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo-library access to choose a venue image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0]!;
    if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
      setError("Venue image must be 2 MB or smaller.");
      return;
    }
    const type = asset.mimeType || "image/jpeg";
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) {
      setError("Venue image must be a JPG, PNG, or WebP file.");
      return;
    }
    setVenueImage({ uri: asset.uri, name: asset.fileName || `venue-${Date.now()}.jpg`, type, size: asset.fileSize });
  }

  function passwordProblem() {
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (!/[a-z]/.test(password)) return "Password must include one lowercase letter.";
    if (!/[A-Z]/.test(password)) return "Password must include one uppercase letter.";
    if (password !== confirmPassword) return "Passwords do not match.";
    return "";
  }

  async function submit() {
    const validation = passwordProblem();
    if (validation) { setError(validation); return; }
    if (isMerchant && !venueName.trim()) { setError("Venue name is required."); return; }
    if (isMerchant && !venueAddress.trim()) { setError("Venue address is required."); return; }
    if (isMerchant && (!venueLat.trim() || !venueLng.trim())) {
      setError("Use your current location or enter the venue coordinates manually.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("accountType", isMerchant ? "MERCHANT" : "CONSUMER");
      form.append("name", name.trim());
      form.append("email", email.trim());
      form.append("password", password);
      form.append("confirmPassword", confirmPassword);
      if (isMerchant) {
        form.append("venueName", venueName.trim());
        form.append("venueAddress", venueAddress.trim());
        form.append("venueLat", venueLat.trim());
        form.append("venueLng", venueLng.trim());
      }
      if (isMerchant && venueImage) form.append("venueImage", venueImage as unknown as Blob);
      const result = await api<{ message: string; devVerificationUrl?: string }>("/auth/signup", { method: "POST", body: form });
      setNotice(result.message);
      setDevVerificationUrl(result.devVerificationUrl || "");
      setRegisteredEmail(email.trim());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  const registrationDisabled = busy || !name || !email || (isMerchant && (!venueName || !venueAddress || !venueLat || !venueLng));

  async function resendRegistration() {
    setBusy(true); setError("");
    try {
      const result = await api<{ message: string; devVerificationUrl?: string }>("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email: registeredEmail }) });
      setNotice(result.message); setDevVerificationUrl(result.devVerificationUrl || "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not resend verification email"); }
    finally { setBusy(false); }
  }

  if (registeredEmail) {
    return <SafeAreaView style={styles.safe}><View style={styles.successPage}><View style={styles.successIcon}><Ionicons name="mail-open-outline" color="#09090e" size={34} /></View><Text style={styles.eyebrow}>REGISTRATION RECEIVED</Text><Text style={styles.successTitle}>Check your email</Text><Text style={styles.successBody}>We sent a verification link to</Text><Text style={styles.successEmail}>{registeredEmail}</Text><Text style={styles.successHint}>Open it within 24 hours. Check spam or junk if it is not in your inbox.</Text>{notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text>{devVerificationUrl ? <Pressable onPress={() => Linking.openURL(devVerificationUrl)}><Text style={styles.verifyLink}>Open development verification link</Text></Pressable> : null}</View> : null}{error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}<Pressable disabled={busy} onPress={resendRegistration} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? "Sending..." : "Resend verification email"}</Text></Pressable><Pressable onPress={() => router.replace(`/login/${isMerchant ? "merchant" : "customer"}` as never)}><Text style={styles.link}>Back to login</Text></Pressable></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <Pressable onPress={() => router.back()} style={styles.close}><Ionicons name="close" color="#fff" size={22} /></Pressable>
            <View style={styles.logo}><Ionicons name="moon" color="#09090e" size={22} /></View>
          </View>
          <Text style={styles.eyebrow}>{isMerchant ? "VENUE PARTNERS" : "BAKU AFTER DARK"}</Text>
          <Text style={styles.title}>{isMerchant ? "Register your venue" : "Create account"}</Text>
          <Text style={styles.body}>Verify your email before logging in.</Text>
          {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text>{devVerificationUrl ? <Pressable onPress={() => Linking.openURL(devVerificationUrl)}><Text style={styles.verifyLink}>Open development verification link</Text></Pressable> : null}</View> : null}
          <Field label={isMerchant ? "Contact name" : "Name"} value={name} onChangeText={setName} autoCapitalize="words" />
          {isMerchant && <Field label="Venue name" value={venueName} onChangeText={setVenueName} autoCapitalize="words" />}
          {isMerchant && <View style={styles.locationCard}>
            <Text style={styles.locationTitle}>VENUE LOCATION</Text>
            <Text style={styles.locationHelp}>Use your position while at the venue, or enter the exact address and coordinates manually.</Text>
            <Pressable disabled={locating} onPress={findVenueLocation} style={[styles.locationButton, locating && styles.disabled]}>
              <Ionicons name="locate" color="#09090e" size={18} /><Text style={styles.locationButtonText}>{locating ? "Finding location..." : "Use my current location"}</Text>
            </Pressable>
            {locationMessage ? <Text style={styles.locationSuccess}>{locationMessage}</Text> : null}
            <Field label="Full venue address" value={venueAddress} onChangeText={setVenueAddress} autoCapitalize="words" placeholder="Street, building, district, Baku" />
            <View style={styles.coordinateRow}>
              <View style={styles.coordinateField}><Field label="Latitude" value={venueLat} onChangeText={setVenueLat} keyboardType="decimal-pad" placeholder="40.4093" /></View>
              <View style={styles.coordinateField}><Field label="Longitude" value={venueLng} onChangeText={setVenueLng} keyboardType="decimal-pad" placeholder="49.8671" /></View>
            </View>
            <Text style={styles.coordinateHelp}>For manual entry, copy the coordinates from the venue pin in Google Maps.</Text>
          </View>}
          {isMerchant && <View><Text style={styles.label}>VENUE LOGO OR PHOTO</Text><Pressable onPress={pickImage} style={styles.imagePicker}>{venueImage ? <Image source={{ uri: venueImage.uri }} style={styles.preview} /> : <View style={styles.imagePlaceholder}><Ionicons name="camera-outline" color="#f59e0b" size={27} /></View>}<View style={styles.imageCopy}><Text style={styles.imageTitle}>{venueImage ? "Change image" : "Choose image"}</Text><Text style={styles.imageHelp}>Optional · JPG, PNG or WebP · max 2 MB</Text></View></Pressable></View>}
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <View><Text style={styles.label}>PASSWORD</Text><View style={styles.passwordRow}><TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" style={styles.passwordInput} /><Pressable onPress={() => setShowPassword((value) => !value)}><Ionicons name={showPassword ? "eye-off" : "eye"} color="#9999a7" size={20} /></Pressable></View><Text style={styles.hint}>8+ characters with uppercase and lowercase letters.</Text></View>
          <Field label="Retype password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" />
          {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
          <Pressable disabled={registrationDisabled} onPress={submit} style={[styles.primary, registrationDisabled && styles.disabled]}><Text style={styles.primaryText}>{busy ? "Working..." : "Create account"}</Text><Ionicons name="arrow-forward" color="#09090e" size={18} /></Pressable>
          <Pressable onPress={() => router.replace(`/login/${isMerchant ? "merchant" : "customer"}` as never)}><Text style={styles.link}>Already registered? Log in</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) {
  return <View><Text style={styles.label}>{label.toUpperCase()}</Text><TextInput {...props} style={styles.input} placeholderTextColor="#5f5f6c" /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#09090e" },
  flex: { flex: 1 },
  content: { padding: 24, paddingBottom: 48, gap: 16 },
  top: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  close: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: "rgba(255,255,255,.12)", alignItems: "center", justifyContent: "center" },
  logo: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#f59e0b", alignItems: "center", justifyContent: "center" },
  eyebrow: { color: "#67e8f9", fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  title: { color: "#fff", fontSize: 36, fontWeight: "900", letterSpacing: -1 },
  body: { color: "#8f8f9d", fontSize: 14, marginBottom: 4 },
  successPage: { flex: 1, justifyContent: "center", padding: 24, gap: 15 },
  successIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: "#67e8f9", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  successTitle: { color: "#fff", fontSize: 40, lineHeight: 44, fontWeight: "900", letterSpacing: -1 },
  successBody: { color: "#8f8f9d", fontSize: 14, marginTop: 4 },
  successEmail: { color: "#fff", fontSize: 16, fontWeight: "900" },
  successHint: { color: "#777785", fontSize: 12, lineHeight: 18, marginBottom: 5 },
  label: { color: "#777785", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 7 },
  input: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,.12)", backgroundColor: "#15151e", color: "#fff", paddingHorizontal: 15 },
  passwordRow: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,.12)", backgroundColor: "#15151e", paddingHorizontal: 15, flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1, color: "#fff", height: "100%" },
  hint: { color: "#5f5f6c", fontSize: 10, marginTop: 6 },
  locationCard: { gap: 12, borderRadius: 17, borderWidth: 1, borderColor: "rgba(255,255,255,.1)", backgroundColor: "rgba(255,255,255,.025)", padding: 14 },
  locationTitle: { color: "#f59e0b", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  locationHelp: { color: "#777785", fontSize: 11, lineHeight: 17 },
  locationButton: { height: 48, borderRadius: 13, backgroundColor: "#67e8f9", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  locationButtonText: { color: "#09090e", fontSize: 13, fontWeight: "900" },
  locationSuccess: { color: "#a7f3d0", fontSize: 11, lineHeight: 16, backgroundColor: "rgba(52,211,153,.09)", borderRadius: 10, padding: 9 },
  coordinateRow: { flexDirection: "row", gap: 10 },
  coordinateField: { flex: 1 },
  coordinateHelp: { color: "#5f5f6c", fontSize: 10, lineHeight: 15 },
  imagePicker: { minHeight: 84, borderRadius: 16, borderStyle: "dashed", borderWidth: 1, borderColor: "rgba(255,255,255,.16)", backgroundColor: "rgba(255,255,255,.035)", padding: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  imagePlaceholder: { width: 64, height: 64, borderRadius: 13, backgroundColor: "rgba(245,158,11,.08)", alignItems: "center", justifyContent: "center" },
  preview: { width: 64, height: 64, borderRadius: 13 },
  imageCopy: { flex: 1 },
  imageTitle: { color: "#fff", fontSize: 13, fontWeight: "800" },
  imageHelp: { color: "#777785", fontSize: 10, lineHeight: 15, marginTop: 4 },
  error: { borderRadius: 14, borderWidth: 1, borderColor: "rgba(248,113,113,.35)", backgroundColor: "rgba(239,68,68,.1)", padding: 13 },
  errorText: { color: "#fecaca", fontSize: 12, lineHeight: 18 },
  notice: { borderRadius: 14, borderWidth: 1, borderColor: "rgba(103,232,249,.3)", backgroundColor: "rgba(103,232,249,.08)", padding: 13 },
  noticeText: { color: "#cffafe", fontSize: 12, lineHeight: 18 },
  verifyLink: { color: "#67e8f9", fontSize: 12, fontWeight: "800", textDecorationLine: "underline", marginTop: 8 },
  primary: { height: 52, borderRadius: 14, backgroundColor: "#f59e0b", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  disabled: { opacity: .45 },
  primaryText: { color: "#09090e", fontSize: 14, fontWeight: "900" },
  link: { color: "#67e8f9", textAlign: "center", fontWeight: "800", fontSize: 13, textDecorationLine: "underline", marginTop: 5 },
});
