import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { useLanguage } from "@/src/LanguageContext";
import { displayFont, palette } from "@/src/theme";
import type { Deal, Restaurant } from "@/src/types";

type Preferences = {
  radius: number;
  cuisine: string;
  minDiscount: number;
  dietary: string;
  endingSoon: boolean;
  sort: "distance" | "discount" | "ending" | "rating";
};

type Profile = {
  id: string;
  email: string;
  name: string;
  role: "CONSUMER" | "MERCHANT" | "ADMIN";
  homeLat: number | null;
  homeLng: number | null;
  preferencesJson: Preferences | null;
  createdAt: string;
};

type Enrollment = {
  id: string;
  venueName: string;
  venueType: string;
  venueAddress: string;
  venueLat: number;
  venueLng: number;
  contactPhone: string;
  contactEmail: string;
  proofNotes: string;
  status: "pending" | "approved" | "rejected";
  reviewNotes?: string | null;
};

type SectionKey = "details" | "preferences" | "security" | "merchant";
type LocationTarget = "profile" | "merchant";

const DEFAULT_PREFERENCES: Preferences = {
  radius: 10,
  cuisine: "",
  minDiscount: 0,
  dietary: "",
  endingSoon: false,
  sort: "distance",
};
const VENUE_TYPES = ["Restaurant", "Pub", "Bar", "Lounge", "Cafe"];
const RADIUS_OPTIONS = [3, 5, 10, 25, 50];
const DISCOUNT_OPTIONS = [0, 20, 30, 50];
const DIETARY_OPTIONS = ["Any", "Halal", "Vegan", "Vegetarian", "Gluten-free"];
const SORT_OPTIONS: { value: Preferences["sort"]; label: string }[] = [
  { value: "distance", label: "Nearest" },
  { value: "discount", label: "Biggest discount" },
  { value: "ending", label: "Ending soon" },
  { value: "rating", label: "Top rated" },
];

export default function AccountScreen() {
  const router = useRouter();
  const { user, loading: authLoading, refresh, logout } = useAuth();
  const { language, cycleLanguage } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saved, setSaved] = useState<Deal[]>([]);
  const [venues, setVenues] = useState<Restaurant[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [homeLat, setHomeLat] = useState("");
  const [homeLng, setHomeLng] = useState("");
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [venueName, setVenueName] = useState("");
  const [venueType, setVenueType] = useState("Restaurant");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueLat, setVenueLat] = useState("");
  const [venueLng, setVenueLng] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [proofNotes, setProofNotes] = useState("");

  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteOwnedVenues, setDeleteOwnedVenues] = useState(false);

  const [code, setCode] = useState("");
  const [venueId, setVenueId] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [scanning, setScanning] = useState(false);

  const showMessage = useCallback((message: string, isError = false) => {
    setNotice(isError ? "" : message);
    setError(isError ? message : "");
  }, []);

  useEffect(() => {
    if (!notice && !error) return;
    const timer = setTimeout(() => { setNotice(""); setError(""); }, 4500);
    return () => clearTimeout(timer);
  }, [notice, error]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const requests: Promise<unknown>[] = [
      api<{ profile: Profile }>("/users/me/profile").then(({ profile: value }) => {
        if (!active) return;
        setProfile(value);
        setName(value.name);
        setHomeLat(value.homeLat == null ? "" : String(value.homeLat));
        setHomeLng(value.homeLng == null ? "" : String(value.homeLng));
        setPreferences(value.preferencesJson ?? DEFAULT_PREFERENCES);
        setContactEmail(value.email);
      }),
    ];
    if (user.role === "CONSUMER") {
      requests.push(api<{ deals: Deal[] }>("/users/me/saved").then(({ deals }) => active && setSaved(deals)));
      requests.push(api<{ enrollment: Enrollment | null }>("/merchant/enrollment").then(({ enrollment: value }) => {
        if (!active) return;
        setEnrollment(value);
        if (value) {
          setVenueName(value.venueName);
          setVenueType(value.venueType);
          setVenueAddress(value.venueAddress);
          setVenueLat(String(value.venueLat));
          setVenueLng(String(value.venueLng));
          setContactPhone(value.contactPhone);
          setContactEmail(value.contactEmail);
          setProofNotes(value.proofNotes);
        }
      }));
    }
    if (user.role === "MERCHANT") {
      requests.push(api<{ restaurants: Restaurant[] }>("/merchant/dashboard").then(({ restaurants }) => {
        if (!active) return;
        setVenues(restaurants);
        setVenueId((value) => value || restaurants[0]?.id || "");
      }));
    }
    Promise.all(requests).catch((reason) => active && showMessage(reason instanceof Error ? reason.message : "Account details could not load.", true));
    return () => { active = false; };
  }, [showMessage, user]);

  function toggleSection(section: SectionKey) {
    setOpenSection((current) => current === section ? null : section);
  }

  async function saveDetails() {
    if (!name.trim()) return showMessage("Display name is required.", true);
    if ((homeLat && !Number.isFinite(Number(homeLat))) || (homeLng && !Number.isFinite(Number(homeLng)))) return showMessage("Enter valid latitude and longitude values.", true);
    setBusy("details");
    try {
      const { user: updated } = await api<{ user: Profile }>("/users/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), homeLat: homeLat ? Number(homeLat) : null, homeLng: homeLng ? Number(homeLng) : null }),
      });
      setProfile((value) => value ? { ...value, ...updated } : updated);
      await refresh();
      showMessage("Profile details saved.");
    } catch (reason) { showMessage(reason instanceof Error ? reason.message : "Could not save profile details.", true); }
    finally { setBusy(""); }
  }

  async function savePreferences() {
    setBusy("preferences");
    try {
      await api("/users/me/preferences", { method: "PUT", body: JSON.stringify(preferences) });
      setProfile((value) => value ? { ...value, preferencesJson: preferences } : value);
      showMessage("Deal preferences saved.");
    } catch (reason) { showMessage(reason instanceof Error ? reason.message : "Could not save deal preferences.", true); }
    finally { setBusy(""); }
  }

  async function changePassword() {
    if (!currentPassword || newPassword.length < 8) return showMessage("Enter your current password and a new password of at least 8 characters.", true);
    if (newPassword !== confirmPassword) return showMessage("New passwords do not match.", true);
    setBusy("security");
    try {
      await api("/users/me/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      showMessage("Password updated.");
    } catch (reason) { showMessage(reason instanceof Error ? reason.message : "Could not update password.", true); }
    finally { setBusy(""); }
  }

  async function captureLocation(target: LocationTarget) {
    setBusy(`location-${target}`);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Location permission was denied.");
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = result.coords.latitude.toFixed(6);
      const lng = result.coords.longitude.toFixed(6);
      if (target === "profile") { setHomeLat(lat); setHomeLng(lng); }
      else { setVenueLat(lat); setVenueLng(lng); }
      showMessage("Location captured. Save the form to keep it.");
    } catch (reason) { showMessage(reason instanceof Error ? reason.message : "Could not get your location.", true); }
    finally { setBusy(""); }
  }

  async function submitEnrollment() {
    if (!venueName.trim() || !venueAddress.trim() || !contactPhone.trim() || !contactEmail.trim() || !venueLat || !venueLng) return showMessage("Complete all merchant application fields.", true);
    if (proofNotes.trim().length < 20) return showMessage("Please add at least 20 characters explaining how you manage this venue.", true);
    setBusy("merchant");
    try {
      const result = await api<{ enrollment: Enrollment }>("/merchant/enroll", {
        method: "POST",
        body: JSON.stringify({ venueName: venueName.trim(), venueType, venueAddress: venueAddress.trim(), venueLat: Number(venueLat), venueLng: Number(venueLng), contactPhone: contactPhone.trim(), contactEmail: contactEmail.trim(), proofNotes: proofNotes.trim() }),
      });
      setEnrollment(result.enrollment);
      setOpenSection(null);
      showMessage("Merchant application sent for review.");
    } catch (reason) { showMessage(reason instanceof Error ? reason.message : "Could not submit merchant application.", true); }
    finally { setBusy(""); }
  }

  async function deleteAccount() {
    if (!deletePassword) return;
    setBusy("delete");
    try {
      await api("/users/me", { method: "DELETE", body: JSON.stringify({ password: deletePassword, deleteOwnedVenues }) });
      setShowDelete(false);
      await refresh();
      router.replace("/(tabs)" as never);
    } catch (reason) { showMessage(reason instanceof Error ? reason.message : "Could not delete account.", true); }
    finally { setBusy(""); }
  }

  async function verify(value = code) {
    const normalized = value.trim().toUpperCase();
    if (!normalized) return;
    setBusy("verify"); setError(""); setNotice("");
    try {
      const reward = normalized.startsWith("PTS-");
      const result = await api<{ kind: "DEAL" | "POINT_REWARD"; redemption?: { user?: { name?: string } }; reward?: { discountAmountAzn: number } }>("/merchant/redemptions/redeem", {
        method: "POST",
        body: JSON.stringify({ code: normalized, venueId: reward ? venueId : undefined, billAmountAzn: reward ? Number(billAmount) : undefined }),
      });
      showMessage(result.kind === "DEAL" ? `Visit verified${result.redemption?.user?.name ? ` for ${result.redemption.user.name}` : ""}. One reward spin is now unlocked.` : `Reward verified. Apply ${result.reward?.discountAmountAzn ?? 0} AZN discount.`);
      setCode(""); setBillAmount(""); setScanning(false);
    } catch (reason) { showMessage(reason instanceof Error ? reason.message : "This QR/code could not be verified.", true); }
    finally { setBusy(""); }
  }

  if (authLoading) return <SafeAreaView style={styles.center}><ActivityIndicator color={palette.gold} /></SafeAreaView>;
  if (!user) return <GuestAccount onCustomer={() => router.push("/login/customer" as never)} onMerchant={() => router.push("/login/merchant" as never)} />;

  const memberSince = profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "";
  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.profileHero}>
          <View style={styles.heroGlow} />
          <View style={styles.avatar}><Text style={styles.avatarText}>{user.name.slice(0, 1).toUpperCase()}</Text></View>
          <View style={styles.profileCopy}><Text style={styles.role}>{user.role} ACCOUNT</Text><Text style={styles.name}>{user.name}</Text><Text style={styles.email}>{user.email}</Text>{memberSince ? <Text style={styles.memberSince}>Member since {memberSince}</Text> : null}</View>
        </View>

        {(notice || error) ? <Pressable onPress={() => { setNotice(""); setError(""); }} style={[styles.message, error ? styles.errorMessage : styles.successMessage]}><Ionicons name={error ? "alert-circle" : "checkmark-circle"} size={18} color={error ? "#fca5a5" : "#6ee7b7"} /><Text style={[styles.messageText, { color: error ? "#fecaca" : "#a7f3d0" }]}>{error || notice}</Text><Ionicons name="close" size={16} color={palette.muted} /></Pressable> : null}
        {user.role === "CONSUMER" && <>
          <View style={styles.quickGrid}>
            <QuickLink icon="gift-outline" title="Rewards" detail="Points and spins" onPress={() => router.push("/(tabs)/rewards" as never)} />
            <QuickLink icon="map-outline" title="Explore map" detail="Offers near you" onPress={() => router.push("/(tabs)/explore" as never)} />
          </View>
          <SavedOffers deals={saved} onOpen={(id) => router.push({ pathname: "/deals/[id]", params: { id } } as never)} />
        </>}

        {user.role === "MERCHANT" && <MerchantScannerCard venues={venues} venueId={venueId} setVenueId={setVenueId} code={code} setCode={setCode} billAmount={billAmount} setBillAmount={setBillAmount} busy={busy === "verify"} onScan={() => setScanning(true)} onVerify={() => void verify()} />}
        {user.role === "ADMIN" && <View style={styles.panel}><Text style={styles.eyebrow}>WHERETOGO OPERATIONS</Text><Text style={styles.panelTitle}>Admin account</Text><Text style={styles.body}>Use the web dashboard for the full moderation workspace.</Text></View>}

        <Text style={styles.groupLabel}>ACCOUNT SETTINGS</Text>
        <SettingsSection icon="person-outline" eyebrow="PERSONAL INFORMATION" title="Your details" summary="Name, email and home location" open={openSection === "details"} onPress={() => toggleSection("details")}>
          <Field label="DISPLAY NAME" value={name} onChangeText={setName} placeholder="Your name" />
          <Field label="ACCOUNT EMAIL" value={profile?.email ?? user.email} editable={false} muted />
          <View style={styles.twoColumns}><Field compact label="HOME LATITUDE" value={homeLat} onChangeText={setHomeLat} keyboardType="numbers-and-punctuation" placeholder="40.4093" /><Field compact label="HOME LONGITUDE" value={homeLng} onChangeText={setHomeLng} keyboardType="numbers-and-punctuation" placeholder="49.8671" /></View>
          <Pressable onPress={() => void captureLocation("profile")} disabled={busy === "location-profile"} style={styles.locationButton}><Ionicons name="locate" size={17} color={palette.cyan} /><Text style={styles.locationText}>{busy === "location-profile" ? "Finding location..." : "Use my current location"}</Text></Pressable>
          <PrimaryButton label={busy === "details" ? "Saving..." : "Save profile"} icon="save-outline" disabled={Boolean(busy)} onPress={() => void saveDetails()} />
        </SettingsSection>

        <SettingsSection icon="options-outline" eyebrow="RECOMMENDATIONS" title="Deal preferences" summary="Radius, cuisine, discount and sorting" open={openSection === "preferences"} onPress={() => toggleSection("preferences")}>
          <ChoiceGroup label="SEARCH RADIUS" options={RADIUS_OPTIONS.map((value) => ({ value, label: `${value} km` }))} value={preferences.radius} onChange={(radius) => setPreferences((current) => ({ ...current, radius }))} />
          <Field label="PREFERRED CUISINE" value={preferences.cuisine} onChangeText={(cuisine) => setPreferences((current) => ({ ...current, cuisine }))} placeholder="Any cuisine" />
          <ChoiceGroup label="MINIMUM DISCOUNT" options={DISCOUNT_OPTIONS.map((value) => ({ value, label: value ? `${value}%+` : "Any" }))} value={preferences.minDiscount} onChange={(minDiscount) => setPreferences((current) => ({ ...current, minDiscount }))} />
          <ChoiceGroup label="DIETARY PREFERENCE" options={DIETARY_OPTIONS.map((label) => ({ value: label === "Any" ? "" : label.toLowerCase(), label }))} value={preferences.dietary} onChange={(dietary) => setPreferences((current) => ({ ...current, dietary }))} />
          <ChoiceGroup label="SORT OFFERS BY" options={SORT_OPTIONS} value={preferences.sort} onChange={(sort) => setPreferences((current) => ({ ...current, sort }))} />
          <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.switchTitle}>Prioritize ending soon</Text><Text style={styles.switchDetail}>Show urgent offers earlier</Text></View><Switch value={preferences.endingSoon} onValueChange={(endingSoon) => setPreferences((current) => ({ ...current, endingSoon }))} trackColor={{ false: "#343441", true: "#805306" }} thumbColor={preferences.endingSoon ? palette.gold : "#aaaabc"} /></View>
          <PrimaryButton label={busy === "preferences" ? "Saving..." : "Save preferences"} icon="compass-outline" disabled={Boolean(busy)} onPress={() => void savePreferences()} />
        </SettingsSection>

        <SettingsSection icon="key-outline" eyebrow="SECURITY" title="Change password" summary="Update your account password" open={openSection === "security"} onPress={() => toggleSection("security")}>
          <Field label="CURRENT PASSWORD" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
          <Field label="NEW PASSWORD" value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="At least 8 characters" />
          <Field label="CONFIRM NEW PASSWORD" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
          <PrimaryButton label={busy === "security" ? "Updating..." : "Update password"} icon="shield-checkmark-outline" disabled={Boolean(busy)} onPress={() => void changePassword()} />
        </SettingsSection>

        {user.role === "CONSUMER" && <SettingsSection icon="storefront-outline" eyebrow="VENUE OWNERS" title={enrollment?.status === "pending" ? "Application pending" : enrollment?.status === "approved" ? "Application approved" : "Apply as a merchant"} summary="List and manage your venue on WhereToGo" open={openSection === "merchant"} onPress={() => toggleSection("merchant")}>
          {enrollment && <EnrollmentStatus enrollment={enrollment} />}
          {enrollment?.status !== "pending" && enrollment?.status !== "approved" && <>
            <Field label="VENUE NAME" value={venueName} onChangeText={setVenueName} />
            <ChoiceGroup label="VENUE TYPE" options={VENUE_TYPES.map((value) => ({ value, label: value }))} value={venueType} onChange={setVenueType} />
            <Field label="FULL VENUE ADDRESS" value={venueAddress} onChangeText={setVenueAddress} />
            <View style={styles.twoColumns}><Field compact label="LATITUDE" value={venueLat} onChangeText={setVenueLat} keyboardType="numbers-and-punctuation" /><Field compact label="LONGITUDE" value={venueLng} onChangeText={setVenueLng} keyboardType="numbers-and-punctuation" /></View>
            <Pressable onPress={() => void captureLocation("merchant")} disabled={busy === "location-merchant"} style={styles.locationButton}><Ionicons name="locate" size={17} color={palette.cyan} /><Text style={styles.locationText}>{busy === "location-merchant" ? "Finding location..." : "Use venue's current location"}</Text></Pressable>
            <Field label="CONTACT PHONE" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />
            <Field label="CONTACT EMAIL" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" />
            <Field label="PROOF YOU MANAGE THIS VENUE" value={proofNotes} onChangeText={setProofNotes} multiline placeholder="Tell our review team how we can verify ownership..." />
            <PrimaryButton label={busy === "merchant" ? "Sending..." : "Send for review"} icon="paper-plane-outline" disabled={Boolean(busy)} onPress={() => void submitEnrollment()} />
          </>}
        </SettingsSection>}

        <Text style={styles.groupLabel}>ACCOUNT ACTIONS</Text>
        {user.role === "MERCHANT" && <Pressable onPress={() => router.push("/(tabs)" as never)} style={styles.actionRow}><View style={styles.actionIcon}><Ionicons name="storefront-outline" size={19} color={palette.cyan} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>Merchant workspace</Text><Text style={styles.actionDetail}>Manage venues and offers from Home</Text></View><Ionicons name="chevron-forward" size={18} color={palette.muted} /></Pressable>}
        <Pressable onPress={cycleLanguage} style={styles.actionRow}><View style={styles.actionIcon}><Ionicons name="language-outline" size={19} color={palette.cyan} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>Offer language</Text><Text style={styles.actionDetail}>Currently {language.toUpperCase()} · tap to change</Text></View><Text style={styles.actionValue}>{language.toUpperCase()}</Text></Pressable>
        <Pressable onPress={() => void Linking.openSettings()} style={styles.actionRow}><View style={styles.actionIcon}><Ionicons name="settings-outline" size={19} color={palette.cyan} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>Device permissions</Text><Text style={styles.actionDetail}>Camera, location and notifications</Text></View><Ionicons name="open-outline" size={18} color={palette.muted} /></Pressable>
        <Pressable onPress={() => void logout()} style={styles.actionRow}><View style={styles.actionIcon}><Ionicons name="log-out-outline" size={19} color="#fca5a5" /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>Log out</Text><Text style={styles.actionDetail}>Sign out on this device</Text></View><Ionicons name="chevron-forward" size={18} color={palette.muted} /></Pressable>
        <Pressable onPress={() => setShowDelete(true)} style={[styles.actionRow, styles.dangerRow]}><View style={[styles.actionIcon, styles.dangerIcon]}><Ionicons name="trash-outline" size={19} color="#f87171" /></View><View style={styles.actionCopy}><Text style={styles.dangerTitle}>Delete account</Text><Text style={styles.actionDetail}>Permanently remove your account and data</Text></View><Ionicons name="chevron-forward" size={18} color="#f87171" /></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
    <Scanner visible={scanning} onClose={() => setScanning(false)} onScan={(value) => { setCode(value); setScanning(false); if (!value.trim().toUpperCase().startsWith("PTS-")) void verify(value); }} />
    <DeleteAccountModal visible={showDelete} password={deletePassword} setPassword={setDeletePassword} merchant={user.role === "MERCHANT"} deleteOwnedVenues={deleteOwnedVenues} setDeleteOwnedVenues={setDeleteOwnedVenues} busy={busy === "delete"} onClose={() => { setShowDelete(false); setDeletePassword(""); }} onDelete={() => void deleteAccount()} />
  </SafeAreaView>;
}

function GuestAccount({ onCustomer, onMerchant }: { onCustomer: () => void; onMerchant: () => void }) {
  return <SafeAreaView style={styles.safe}><View style={styles.guest}><View style={styles.guestIcon}><Ionicons name="person-outline" size={31} color={palette.gold} /></View><Text style={styles.guestTitle}>Your WhereToGo account</Text><Text style={styles.body}>Log in to save offers, create visit QR codes, collect points, and manage your venue.</Text><PrimaryButton label="Customer login" onPress={onCustomer} /><Pressable onPress={onMerchant} style={styles.secondary}><Text style={styles.secondaryText}>Merchant login</Text></Pressable></View></SafeAreaView>;
}

function QuickLink({ icon, title, detail, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.quickLink}><View style={styles.quickIcon}><Ionicons name={icon} size={20} color={palette.gold} /></View><Text style={styles.quickTitle}>{title}</Text><Text style={styles.quickDetail}>{detail}</Text></Pressable>;
}

function SavedOffers({ deals, onOpen }: { deals: Deal[]; onOpen: (id: string) => void }) {
  return <View><View style={styles.savedHeading}><View><Text style={styles.eyebrow}>YOUR SHORTLIST</Text><Text style={styles.panelTitle}>Saved offers</Text></View><Text style={styles.savedCount}>{deals.length}</Text></View>{deals.length ? deals.map((deal) => <Pressable key={deal.id} onPress={() => onOpen(deal.id)} style={styles.savedCard}><View style={styles.savedIcon}><Ionicons name="bookmark" size={18} color={palette.gold} /></View><View style={styles.savedCopy}><Text style={styles.savedTitle} numberOfLines={1}>{deal.title}</Text><Text style={styles.savedVenue}>{deal.restaurant.name}</Text></View><Ionicons name="chevron-forward" size={18} color={palette.muted} /></Pressable>) : <View style={styles.empty}><Ionicons name="bookmark-outline" size={24} color={palette.muted} /><Text style={styles.emptyTitle}>No saved offers yet</Text><Text style={styles.body}>Tap Save on an offer and it will appear here.</Text></View>}</View>;
}

function SettingsSection({ icon, eyebrow, title, summary, open, onPress, children }: { icon: keyof typeof Ionicons.glyphMap; eyebrow: string; title: string; summary: string; open: boolean; onPress: () => void; children: ReactNode }) {
  return <View style={[styles.settingsCard, open && styles.settingsCardOpen]}><Pressable onPress={onPress} style={styles.settingsHeader}><View style={styles.sectionIcon}><Ionicons name={icon} size={20} color={palette.cyan} /></View><View style={styles.settingsCopy}><Text style={styles.sectionEyebrow}>{eyebrow}</Text><Text style={styles.settingsTitle}>{title}</Text><Text style={styles.settingsSummary}>{summary}</Text></View><Ionicons name={open ? "chevron-up" : "chevron-down"} size={19} color={palette.muted} /></Pressable>{open ? <View style={styles.sectionBody}>{children}</View> : null}</View>;
}

function Field({ label, muted, compact, multiline, ...props }: { label: string; muted?: boolean; compact?: boolean; multiline?: boolean } & React.ComponentProps<typeof TextInput>) {
  return <View style={compact ? styles.compactField : undefined}><Text style={styles.fieldLabel}>{label}</Text><TextInput placeholderTextColor="#5f5f73" style={[styles.input, muted && styles.inputMuted, multiline && styles.textarea]} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} {...props} /></View>;
}

function ChoiceGroup<T extends string | number>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return <View><Text style={styles.fieldLabel}>{label}</Text><View style={styles.choices}>{options.map((option) => <Pressable key={String(option.value)} onPress={() => onChange(option.value)} style={[styles.choice, value === option.value && styles.choiceActive]}><Text style={[styles.choiceText, value === option.value && styles.choiceTextActive]}>{option.label}</Text></Pressable>)}</View></View>;
}

function PrimaryButton({ label, icon, disabled, onPress }: { label: string; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.primary, disabled && styles.disabled]}>{icon ? <Ionicons name={icon} size={17} color={palette.night} /> : null}<Text style={styles.primaryText}>{label}</Text></Pressable>;
}

function EnrollmentStatus({ enrollment }: { enrollment: Enrollment }) {
  const rejected = enrollment.status === "rejected";
  return <View style={[styles.statusBox, rejected && styles.statusRejected]}><View style={styles.statusHeading}><Ionicons name={rejected ? "alert-circle" : enrollment.status === "approved" ? "checkmark-circle" : "time"} size={18} color={rejected ? "#fca5a5" : enrollment.status === "approved" ? "#6ee7b7" : palette.gold} /><Text style={styles.statusTitle}>Application {enrollment.status}</Text></View><Text style={styles.statusDetail}>{enrollment.venueName} · {enrollment.venueAddress}</Text>{enrollment.reviewNotes ? <Text style={styles.reviewNote}>Admin note: {enrollment.reviewNotes}</Text> : null}</View>;
}

function MerchantScannerCard({ venues, venueId, setVenueId, code, setCode, billAmount, setBillAmount, busy, onScan, onVerify }: { venues: Restaurant[]; venueId: string; setVenueId: (value: string) => void; code: string; setCode: (value: string) => void; billAmount: string; setBillAmount: (value: string) => void; busy: boolean; onScan: () => void; onVerify: () => void }) {
  return <View style={styles.panel}><Text style={styles.eyebrow}>CUSTOMER PROOF</Text><Text style={styles.panelTitle}>Verify QR or reward</Text><Text style={styles.body}>Scan the customer&apos;s QR. Manual entry remains available below.</Text><PrimaryButton label="Scan customer QR" icon="camera" onPress={onScan} />{venues.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.venuePills}>{venues.map((venue) => <Pressable key={venue.id} onPress={() => setVenueId(venue.id)} style={[styles.choice, venueId === venue.id && styles.choiceActive]}><Text style={[styles.choiceText, venueId === venue.id && styles.choiceTextActive]}>{venue.name}</Text></Pressable>)}</ScrollView>}<Field label="QR OR CODE" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="GS-... or PTS-..." />{code.trim().toUpperCase().startsWith("PTS-") && <Field label="BILL AMOUNT (AZN)" value={billAmount} onChangeText={setBillAmount} keyboardType="decimal-pad" placeholder="0.00" />}<PrimaryButton label={busy ? "Verifying..." : "Verify code"} disabled={busy || code.trim().length < 4} onPress={onVerify} /></View>;
}

function DeleteAccountModal({ visible, password, setPassword, merchant, deleteOwnedVenues, setDeleteOwnedVenues, busy, onClose, onDelete }: { visible: boolean; password: string; setPassword: (value: string) => void; merchant: boolean; deleteOwnedVenues: boolean; setDeleteOwnedVenues: (value: boolean) => void; busy: boolean; onClose: () => void; onDelete: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.deleteModal}><View style={styles.deleteBadge}><Ionicons name="trash-outline" size={23} color="#f87171" /></View><Text style={styles.deleteTitle}>Delete your account?</Text><Text style={styles.deleteCopy}>This cannot be undone. Enter your current password to permanently remove your account and personal data.</Text><Field label="CURRENT PASSWORD" value={password} onChangeText={setPassword} secureTextEntry autoFocus />{merchant && <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.switchTitle}>Delete owned venues</Text><Text style={styles.switchDetail}>Required if venues still belong to you</Text></View><Switch value={deleteOwnedVenues} onValueChange={setDeleteOwnedVenues} trackColor={{ false: "#343441", true: "#7f1d1d" }} thumbColor={deleteOwnedVenues ? "#f87171" : "#aaaabc"} /></View>}<View style={styles.modalActions}><Pressable onPress={onClose} style={styles.cancelButton}><Text style={styles.secondaryText}>Cancel</Text></Pressable><Pressable onPress={onDelete} disabled={!password || busy} style={[styles.deleteButton, (!password || busy) && styles.disabled]}><Text style={styles.deleteButtonText}>{busy ? "Deleting..." : "Delete permanently"}</Text></Pressable></View></View></KeyboardAvoidingView></Modal>;
}

function Scanner({ visible, onClose, onScan }: { visible: boolean; onClose: () => void; onScan: (value: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  return <Modal visible={visible} animationType="slide" onShow={() => setLocked(false)} onRequestClose={onClose}><SafeAreaView style={styles.scanner}><View style={styles.scannerHeader}><View><Text style={styles.eyebrow}>CAMERA SCANNER</Text><Text style={styles.scannerTitle}>Scan customer proof</Text></View><Pressable onPress={onClose} style={styles.close}><Ionicons name="close" size={23} color={palette.white} /></Pressable></View>{!permission?.granted ? <View style={styles.permission}><Ionicons name="camera-outline" size={36} color={palette.gold} /><Text style={styles.body}>Camera permission is required to scan customer QR codes.</Text><PrimaryButton label="Allow camera" onPress={() => void requestPermission()} /></View> : <View style={styles.cameraWrap}><CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={locked ? undefined : ({ data }) => { setLocked(true); onScan(data); }} /><View style={styles.scanFrame} /><Text style={styles.scanHelp}>Place the customer&apos;s QR inside the frame</Text></View>}</SafeAreaView></Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.night }, center: { flex: 1, backgroundColor: palette.night, alignItems: "center", justifyContent: "center" }, content: { padding: 18, paddingBottom: 45 }, loader: { marginTop: 18 },
  guest: { flex: 1, padding: 26, alignItems: "center", justifyContent: "center" }, guestIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: "rgba(245,158,11,.1)", alignItems: "center", justifyContent: "center" }, guestTitle: { color: palette.white, fontFamily: displayFont, fontSize: 31, fontWeight: "700", textAlign: "center", marginTop: 18 },
  profileHero: { minHeight: 154, overflow: "hidden", borderRadius: 25, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 20, flexDirection: "row", alignItems: "center", gap: 15 }, heroGlow: { position: "absolute", width: 180, height: 180, borderRadius: 90, right: -55, top: -85, backgroundColor: "rgba(245,158,11,.16)" }, avatar: { width: 65, height: 65, borderRadius: 22, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center", shadowColor: palette.gold, shadowOpacity: .22, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }, avatarText: { color: palette.night, fontSize: 25, fontWeight: "900" }, profileCopy: { flex: 1 }, role: { color: palette.gold, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 }, name: { color: palette.white, fontFamily: displayFont, fontSize: 27, fontWeight: "700", marginTop: 3 }, email: { color: palette.muted, fontSize: 11, marginTop: 3 }, memberSince: { color: "#64647a", fontSize: 9, marginTop: 7 },
  message: { borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 14, flexDirection: "row", alignItems: "center", gap: 9 }, successMessage: { borderColor: "rgba(16,185,129,.3)", backgroundColor: "rgba(16,185,129,.1)" }, errorMessage: { borderColor: "rgba(239,68,68,.3)", backgroundColor: "rgba(239,68,68,.1)" }, messageText: { flex: 1, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  quickGrid: { flexDirection: "row", gap: 10, marginTop: 14 }, quickLink: { flex: 1, borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 14 }, quickIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: "rgba(245,158,11,.09)", alignItems: "center", justifyContent: "center" }, quickTitle: { color: palette.white, fontWeight: "800", fontSize: 12, marginTop: 10 }, quickDetail: { color: palette.muted, fontSize: 9, marginTop: 3 },
  groupLabel: { color: palette.gold, fontSize: 8, letterSpacing: 1.8, fontWeight: "900", marginTop: 28, marginBottom: 9 }, panel: { borderRadius: 21, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 18, marginTop: 18 }, eyebrow: { color: palette.cyan, fontSize: 8, fontWeight: "900", letterSpacing: 1.7 }, panelTitle: { color: palette.white, fontFamily: displayFont, fontSize: 25, fontWeight: "700", marginTop: 5 }, body: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 7 },
  savedHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 27, marginBottom: 12 }, savedCount: { color: palette.gold, fontWeight: "900", fontSize: 17 }, savedCard: { minHeight: 70, borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 }, savedIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "rgba(245,158,11,.1)", alignItems: "center", justifyContent: "center" }, savedCopy: { flex: 1 }, savedTitle: { color: palette.white, fontWeight: "800", fontSize: 13 }, savedVenue: { color: palette.muted, fontSize: 10, marginTop: 4 }, empty: { borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 21, alignItems: "center" }, emptyTitle: { color: palette.white, fontWeight: "800", fontSize: 13, marginTop: 8 },
  settingsCard: { borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, marginBottom: 9, overflow: "hidden" }, settingsCardOpen: { borderColor: "rgba(103,232,249,.2)" }, settingsHeader: { minHeight: 82, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }, sectionIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "rgba(103,232,249,.08)", alignItems: "center", justifyContent: "center" }, settingsCopy: { flex: 1 }, sectionEyebrow: { color: "#69697d", fontSize: 7, letterSpacing: 1.2, fontWeight: "900" }, settingsTitle: { color: palette.white, fontFamily: displayFont, fontSize: 18, fontWeight: "700", marginTop: 2 }, settingsSummary: { color: palette.muted, fontSize: 9, marginTop: 2 }, sectionBody: { borderTopWidth: 1, borderTopColor: palette.line, padding: 15, gap: 13 },
  fieldLabel: { color: palette.muted, fontSize: 8, letterSpacing: 1.25, fontWeight: "900", marginBottom: 6 }, input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,.04)", color: palette.white, paddingHorizontal: 13, fontSize: 12 }, inputMuted: { color: palette.muted, backgroundColor: "rgba(255,255,255,.025)" }, textarea: { minHeight: 100, paddingTop: 13, lineHeight: 18 }, twoColumns: { flexDirection: "row", gap: 9 }, compactField: { flex: 1 }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, choice: { borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,.035)", paddingHorizontal: 11, paddingVertical: 8 }, choiceActive: { borderColor: "rgba(245,158,11,.55)", backgroundColor: "rgba(245,158,11,.13)" }, choiceText: { color: palette.muted, fontSize: 10, fontWeight: "800" }, choiceTextActive: { color: palette.goldSoft },
  locationButton: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7 }, locationText: { color: palette.cyan, fontSize: 10, fontWeight: "800" }, switchRow: { minHeight: 61, borderRadius: 13, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,.03)", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, switchCopy: { flex: 1 }, switchTitle: { color: palette.white, fontSize: 11, fontWeight: "800" }, switchDetail: { color: palette.muted, fontSize: 9, marginTop: 3 },
  primary: { minHeight: 47, borderRadius: 13, backgroundColor: palette.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 17 }, primaryText: { color: palette.night, fontSize: 11, fontWeight: "900" }, secondary: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: palette.line, alignSelf: "stretch", alignItems: "center", justifyContent: "center", marginTop: 9, paddingHorizontal: 18 }, secondaryText: { color: palette.white, fontSize: 11, fontWeight: "800" }, disabled: { opacity: .45 },
  actionRow: { minHeight: 70, borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 }, actionIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "rgba(255,255,255,.05)", alignItems: "center", justifyContent: "center" }, actionCopy: { flex: 1 }, actionTitle: { color: palette.white, fontWeight: "800", fontSize: 12 }, actionDetail: { color: palette.muted, fontSize: 9, marginTop: 3 }, actionValue: { color: palette.gold, fontSize: 10, fontWeight: "900" }, dangerRow: { borderColor: "rgba(239,68,68,.2)" }, dangerIcon: { backgroundColor: "rgba(239,68,68,.08)" }, dangerTitle: { color: "#fca5a5", fontWeight: "800", fontSize: 12 },
  statusBox: { borderRadius: 14, borderWidth: 1, borderColor: "rgba(16,185,129,.25)", backgroundColor: "rgba(16,185,129,.08)", padding: 12 }, statusRejected: { borderColor: "rgba(239,68,68,.25)", backgroundColor: "rgba(239,68,68,.08)" }, statusHeading: { flexDirection: "row", alignItems: "center", gap: 7 }, statusTitle: { color: palette.white, fontWeight: "900", fontSize: 11, textTransform: "capitalize" }, statusDetail: { color: palette.muted, fontSize: 9, lineHeight: 14, marginTop: 6 }, reviewNote: { color: palette.goldSoft, fontSize: 9, lineHeight: 14, marginTop: 5 }, venuePills: { gap: 7, marginTop: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.82)", alignItems: "center", justifyContent: "center", padding: 18 }, deleteModal: { width: "100%", maxWidth: 430, borderRadius: 23, borderWidth: 1, borderColor: "rgba(239,68,68,.25)", backgroundColor: "#15151e", padding: 20, gap: 13 }, deleteBadge: { width: 48, height: 48, borderRadius: 15, backgroundColor: "rgba(239,68,68,.1)", alignItems: "center", justifyContent: "center" }, deleteTitle: { color: palette.white, fontFamily: displayFont, fontSize: 27, fontWeight: "700" }, deleteCopy: { color: palette.muted, fontSize: 11, lineHeight: 17 }, modalActions: { flexDirection: "row", gap: 9, marginTop: 2 }, cancelButton: { minHeight: 45, flex: 1, borderRadius: 13, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }, deleteButton: { minHeight: 45, flex: 1.45, borderRadius: 13, backgroundColor: palette.red, alignItems: "center", justifyContent: "center" }, deleteButtonText: { color: palette.white, fontSize: 10, fontWeight: "900" },
  scanner: { flex: 1, backgroundColor: palette.night }, scannerHeader: { height: 76, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, scannerTitle: { color: palette.white, fontFamily: displayFont, fontSize: 25, fontWeight: "700", marginTop: 3 }, close: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }, permission: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center" }, cameraWrap: { flex: 1, alignItems: "center", justifyContent: "center" }, scanFrame: { width: 250, height: 250, borderRadius: 24, borderWidth: 3, borderColor: palette.gold, backgroundColor: "transparent" }, scanHelp: { position: "absolute", bottom: 45, color: palette.white, backgroundColor: "rgba(9,9,14,.8)", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, fontSize: 11, fontWeight: "800" },
});
