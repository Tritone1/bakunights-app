import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "./api";
import { useAuth } from "./AuthContext";
import { LocalizedText as Text, LocalizedTextInput as TextInput } from "./LocalizedText";
import { displayFont, palette } from "./theme";
import { amenityLabel, VENUE_AMENITIES } from "./venueAmenities";

type MerchantDeal = {
  id: string;
  title: string;
  description: string;
  offerType: "discount" | "combo" | "set_menu" | "perk" | "event" | "bundle" | "other";
  discountPct?: number | null;
  tag: string;
  startsAt: string;
  endsAt: string;
  isFlash: boolean;
  isActive: boolean;
  status: "draft" | "pending_review" | "approved" | "rejected" | "expired";
  _count: { views: number; savedBy: number; redemptions: number };
};

type ManagedVenue = {
  id: string;
  name: string;
  address: string;
  cuisine: string;
  phone?: string | null;
  lat: number;
  lng: number;
  photoUrl?: string | null;
  hoursJson?: { open?: string | null; close?: string | null } | null;
  amenities: string[];
  priceLevel: number;
  deals: MerchantDeal[];
  _count: { followers: number };
};

function dealState(deal: MerchantDeal) {
  const now = Date.now();
  const starts = new Date(deal.startsAt).getTime();
  const ends = new Date(deal.endsAt).getTime();
  if (deal.status === "approved" && deal.isActive && starts <= now && ends > now) return { label: "LIVE", color: palette.green };
  if (deal.status === "approved" && deal.isActive && starts > now) return { label: "SCHEDULED", color: palette.gold };
  return { label: "ENDED", color: palette.muted };
}

export function MerchantDashboard() {
  const { user } = useAuth();
  const [venues, setVenues] = useState<ManagedVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyDealId, setBusyDealId] = useState("");
  const [editing, setEditing] = useState<MerchantDeal | null>(null);
  const [editingVenue, setEditingVenue] = useState<ManagedVenue | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const result = await api<{ restaurants: ManagedVenue[] }>("/merchant/dashboard");
      setVenues(result.restaurants);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load your dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const deals = useMemo(() => venues.flatMap((venue) => venue.deals.map((deal) => ({ ...deal, venueName: venue.name }))), [venues]);
  const metrics = deals.reduce((total, deal) => ({ views: total.views + deal._count.views, saves: total.saves + deal._count.savedBy, visits: total.visits + deal._count.redemptions }), { views: 0, saves: 0, visits: 0 });
  const live = deals.filter((deal) => dealState(deal).label === "LIVE").length;

  async function goLive(deal: MerchantDeal) {
    setBusyDealId(deal.id); setError(""); setNotice("");
    try {
      const result = await api<{ deal: MerchantDeal; visibility: "live" | "scheduled" }>(`/merchant/deals/${deal.id}/go-live`, { method: "POST" });
      setNotice(result.visibility === "live" ? `“${deal.title}” is live again.` : `“${deal.title}” is scheduled again for ${formatDateTime(result.deal.startsAt)}.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not publish this offer again."); }
    finally { setBusyDealId(""); }
  }

  function confirmGoLive(deal: MerchantDeal) {
    Alert.alert("Offer again?", `Keep the original duration and publish “${deal.title}” again?`, [{ text: "Cancel", style: "cancel" }, { text: "Go live again", onPress: () => void goLive(deal) }]);
  }

  async function expire(deal: MerchantDeal) {
    setBusyDealId(deal.id); setError(""); setNotice("");
    try { await api(`/merchant/deals/${deal.id}/expire`, { method: "POST" }); setNotice(`“${deal.title}” has ended.`); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not end this offer."); }
    finally { setBusyDealId(""); }
  }

  function confirmExpire(deal: MerchantDeal) {
    Alert.alert("End this offer?", `“${deal.title}” will disappear from the customer feed.`, [{ text: "Cancel", style: "cancel" }, { text: "End now", style: "destructive", onPress: () => void expire(deal) }]);
  }

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.gold} />} contentContainerStyle={styles.content}>
      <View style={styles.heading}><View><Text style={styles.eyebrow}>MERCHANT DASHBOARD</Text><Text style={styles.title}>Hello, {user?.name?.split(" ")[0]}</Text><Text style={styles.subtitle}>{venues.map((venue) => venue.name).join(" · ") || "Your venue workspace"}</Text></View><View style={styles.brandIcon}><Ionicons name="storefront" size={23} color={palette.night} /></View></View>

      {loading ? <ActivityIndicator color={palette.gold} style={styles.loader} /> : error ? <Pressable onPress={() => void load()} style={styles.error}><Ionicons name="alert-circle" size={20} color="#fca5a5" /><View style={styles.flex}><Text style={styles.errorTitle}>Dashboard unavailable</Text><Text style={styles.errorCopy}>{error} Tap to retry.</Text></View></Pressable> : <>
        {notice ? <Pressable onPress={() => setNotice("")} style={styles.notice}><Ionicons name="checkmark-circle" size={19} color="#6ee7b7" /><Text style={styles.noticeText}>{notice}</Text><Ionicons name="close" size={16} color={palette.muted} /></Pressable> : null}
        {venues.map((venue) => <View key={venue.id} style={styles.venueSettingsCard}><View style={styles.venueSettingsCopy}><Text style={styles.eyebrow}>PUBLIC VENUE PROFILE</Text><Text style={styles.venueSettingsName}>{venue.name}</Text><Text style={styles.venueSettingsMeta}>{venue.cuisine} · {"₼".repeat(venue.priceLevel ?? 2)}{venue.amenities?.length ? ` · ${venue.amenities.slice(0, 2).map(amenityLabel).join(" · ")}` : ""}</Text></View><Pressable onPress={() => setEditingVenue(venue)} style={styles.venueSettingsButton}><Ionicons name="options-outline" size={17} color={palette.cyan} /><Text style={styles.venueSettingsButtonText}>Venue</Text></Pressable></View>)}
        <View style={styles.metrics}>
          <Metric icon="radio" label="Live offers" value={live} accent />
          <Metric icon="eye-outline" label="Views" value={metrics.views} />
          <Metric icon="bookmark-outline" label="Saves" value={metrics.saves} />
          <Metric icon="checkmark-circle-outline" label="Visits" value={metrics.visits} />
        </View>

        <View style={styles.sectionHead}><View><Text style={styles.eyebrow}>PERFORMANCE</Text><Text style={styles.sectionTitle}>Your offers</Text></View><Text style={styles.offerCount}>{deals.length}</Text></View>
        {deals.length ? deals.map((deal) => {
          const state = dealState(deal);
          return <View key={deal.id} style={styles.offer}>
            <View style={styles.offerTop}><View style={styles.flex}><Text style={styles.venue}>{deal.venueName.toUpperCase()}</Text><Text style={styles.offerTitle}>{deal.title}</Text></View><View style={[styles.status, { borderColor: `${state.color}55`, backgroundColor: `${state.color}16` }]}><View style={[styles.dot, { backgroundColor: state.color }]} /><Text style={[styles.statusText, { color: state.color }]}>{state.label}</Text></View></View>
            <View style={styles.offerStats}><SmallStat label="Views" value={deal._count.views} /><SmallStat label="Saves" value={deal._count.savedBy} /><SmallStat label="Verified" value={deal._count.redemptions} /><Text style={styles.ends}>{new Date(deal.endsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text></View>
            <View style={styles.offerActions}><Pressable onPress={() => setEditing(deal)} disabled={busyDealId === deal.id} style={styles.editButton}><Ionicons name="pencil" size={15} color={palette.cyan} /><Text style={styles.editText}>Edit</Text></Pressable>{state.label !== "LIVE" ? <Pressable onPress={() => confirmGoLive(deal)} disabled={busyDealId === deal.id} style={styles.liveButton}><Ionicons name="play" size={15} color={palette.night} /><Text style={styles.liveText}>{busyDealId === deal.id ? "Publishing…" : "Go live again"}</Text></Pressable> : <Pressable onPress={() => confirmExpire(deal)} disabled={busyDealId === deal.id} style={styles.endButton}><Ionicons name="stop-circle-outline" size={15} color="#fca5a5" /><Text style={styles.endText}>{busyDealId === deal.id ? "Ending…" : "End now"}</Text></Pressable>}</View>
          </View>;
        }) : <View style={styles.empty}><Ionicons name="ticket-outline" size={30} color={palette.gold} /><Text style={styles.emptyTitle}>No offers yet</Text><Text style={styles.emptyCopy}>Create and manage offers from the web merchant workspace. They will appear here with live performance.</Text></View>}
      </>}
    </ScrollView>
    <OfferEditor key={editing?.id ?? "closed"} deal={editing} onClose={() => setEditing(null)} onSaved={async (title) => { setEditing(null); setNotice(`“${title}” was updated and published.`); await load(); }} />
    <VenueEditor key={editingVenue?.id ?? "closed"} venue={editingVenue} onClose={() => setEditingVenue(null)} onSaved={async (name) => { setEditingVenue(null); setNotice(`${name} venue profile was updated.`); await load(); }} />
  </SafeAreaView>;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function editableDate(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16).replace("T", " ");
}

function OfferEditor({ deal, onClose, onSaved }: { deal: MerchantDeal | null; onClose: () => void; onSaved: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState(deal?.title ?? "");
  const [description, setDescription] = useState(deal?.description ?? "");
  const [discount, setDiscount] = useState(deal?.discountPct == null ? "" : String(deal.discountPct));
  const [tag, setTag] = useState(deal?.tag ?? "all day");
  const [startsAt, setStartsAt] = useState(deal ? editableDate(deal.startsAt) : "");
  const [endsAt, setEndsAt] = useState(deal ? editableDate(deal.endsAt) : "");
  const [isFlash, setIsFlash] = useState(deal?.isFlash ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!deal) return;
    const start = new Date(startsAt.replace(" ", "T"));
    const end = new Date(endsAt.replace(" ", "T"));
    if (title.trim().length < 3 || description.trim().length < 10) { setError("Title needs 3 characters and details need at least 10."); return; }
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) { setError("Use YYYY-MM-DD HH:mm and make the end later than the start."); return; }
    if (deal.offerType === "discount" && (!Number.isInteger(Number(discount)) || Number(discount) < 1 || Number(discount) > 100)) { setError("Enter a discount from 1 to 100%."); return; }
    setSaving(true); setError("");
    try {
      await api(`/merchant/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify({ title: title.trim(), description: description.trim(), tag, startsAt: start.toISOString(), endsAt: end.toISOString(), isFlash, ...(deal.offerType === "discount" ? { discountPct: Number(discount) } : {}) }) });
      await onSaved(title.trim());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update this offer."); }
    finally { setSaving(false); }
  }

  return <Modal visible={Boolean(deal)} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.modal}><View style={styles.modalHead}><View><Text style={styles.eyebrow}>MANAGE OFFER</Text><Text style={styles.modalTitle}>Edit offer</Text></View><Pressable onPress={onClose} style={styles.close}><Ionicons name="close" size={21} color={palette.white} /></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><Field label="OFFER TITLE" value={title} onChangeText={setTitle} /><Field label="DETAILS" value={description} onChangeText={setDescription} multiline />{deal?.offerType === "discount" ? <Field label="DISCOUNT %" value={discount} onChangeText={setDiscount} keyboardType="number-pad" /> : null}<Text style={styles.fieldLabel}>DAYPART</Text><View style={styles.tagChoices}>{["breakfast", "lunch", "dinner", "happy hour", "all day"].map((value) => <Pressable key={value} onPress={() => setTag(value)} style={[styles.tagChoice, tag === value && styles.tagChoiceActive]}><Text style={[styles.tagText, tag === value && styles.tagTextActive]}>{value}</Text></Pressable>)}</View><Field label="STARTS — YYYY-MM-DD HH:mm" value={startsAt} onChangeText={setStartsAt} autoCapitalize="none" /><Field label="ENDS — YYYY-MM-DD HH:mm" value={endsAt} onChangeText={setEndsAt} autoCapitalize="none" /><Pressable onPress={() => setIsFlash((value) => !value)} style={[styles.flashRow, isFlash && styles.flashRowActive]}><View style={styles.flex}><Text style={styles.flashTitle}>Flash deal</Text><Text style={styles.flashCopy}>25%+ discount and maximum 6-hour duration</Text></View><Ionicons name={isFlash ? "checkbox" : "square-outline"} size={23} color={isFlash ? palette.gold : palette.muted} /></Pressable>{error ? <Text style={styles.formError}>{error}</Text> : null}<Pressable onPress={() => void save()} disabled={saving} style={[styles.saveButton, saving && styles.disabled]}><Ionicons name="checkmark-circle" size={18} color={palette.night} /><Text style={styles.saveText}>{saving ? "Saving…" : "Save and publish"}</Text></Pressable></ScrollView></View></KeyboardAvoidingView></Modal>;
}

function VenueEditor({ venue, onClose, onSaved }: { venue: ManagedVenue | null; onClose: () => void; onSaved: (name: string) => Promise<void> }) {
  const [name, setName] = useState(venue?.name ?? "");
  const [cuisine, setCuisine] = useState(venue?.cuisine ?? "Restaurant");
  const [address, setAddress] = useState(venue?.address ?? "");
  const [phone, setPhone] = useState(venue?.phone ?? "");
  const [openTime, setOpenTime] = useState(venue?.hoursJson?.open ?? "");
  const [closeTime, setCloseTime] = useState(venue?.hoursJson?.close ?? "");
  const [amenities, setAmenities] = useState<string[]>(venue?.amenities ?? []);
  const [priceLevel, setPriceLevel] = useState(venue?.priceLevel ?? 2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleAmenity(value: string) {
    setAmenities((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function save() {
    if (!venue) return;
    if (name.trim().length < 2 || address.trim().length < 5) { setError("Add a valid venue name and full address."); return; }
    if ((openTime && !closeTime) || (!openTime && closeTime)) { setError("Set both opening and closing time, or leave both empty."); return; }
    setSaving(true); setError("");
    try {
      await api(`/merchant/venues/${venue.id}/profile`, { method: "PATCH", body: JSON.stringify({ name: name.trim(), cuisine, address: address.trim(), phone: phone.trim() || null, lat: venue.lat, lng: venue.lng, photoUrl: venue.photoUrl ?? null, hoursJson: openTime && closeTime ? { open: openTime, close: closeTime } : null, amenities, priceLevel }) });
      await onSaved(name.trim());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the venue profile."); }
    finally { setSaving(false); }
  }

  return <Modal visible={Boolean(venue)} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.modal}><View style={styles.modalHead}><View><Text style={styles.eyebrow}>PUBLIC PROFILE</Text><Text style={styles.modalTitle}>Venue settings</Text></View><Pressable onPress={onClose} style={styles.close}><Ionicons name="close" size={21} color={palette.white} /></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><Field label="VENUE NAME" value={name} onChangeText={setName} /><Text style={styles.fieldLabel}>VENUE TYPE</Text><View style={styles.tagChoices}>{["Restaurant", "Cafe", "Bar", "Pub", "Lounge"].map((value) => <Pressable key={value} onPress={() => setCuisine(value)} style={[styles.tagChoice, cuisine === value && styles.tagChoiceActive]}><Text style={[styles.tagText, cuisine === value && styles.tagTextActive]}>{value}</Text></Pressable>)}</View><Field label="FULL ADDRESS" value={address} onChangeText={setAddress} multiline /><Field label="PUBLIC PHONE" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><View style={styles.twoFields}><View style={styles.halfField}><Field label="OPENS · HH:mm" value={openTime} onChangeText={setOpenTime} autoCapitalize="none" /></View><View style={styles.halfField}><Field label="CLOSES · HH:mm" value={closeTime} onChangeText={setCloseTime} autoCapitalize="none" /></View></View><Text style={styles.fieldLabel}>PRICE LEVEL</Text><View style={styles.tagChoices}>{[1, 2, 3].map((value) => <Pressable key={value} onPress={() => setPriceLevel(value)} style={[styles.tagChoice, priceLevel === value && styles.tagChoiceActive]}><Text style={[styles.tagText, priceLevel === value && styles.tagTextActive]}>{"₼".repeat(value)}</Text></Pressable>)}</View><Text style={styles.fieldLabel}>FACILITIES AND EXPERIENCES</Text><View style={styles.tagChoices}>{VENUE_AMENITIES.map((amenity) => <Pressable key={amenity.value} onPress={() => toggleAmenity(amenity.value)} style={[styles.tagChoice, amenities.includes(amenity.value) && styles.tagChoiceActive]}><Text style={[styles.tagText, amenities.includes(amenity.value) && styles.tagTextActive]}>{amenity.label}</Text></Pressable>)}</View>{error ? <Text style={styles.formError}>{error}</Text> : null}<Pressable onPress={() => void save()} disabled={saving} style={[styles.saveButton, saving && styles.disabled]}><Ionicons name="checkmark-circle" size={18} color={palette.night} /><Text style={styles.saveText}>{saving ? "Saving…" : "Save venue profile"}</Text></Pressable></ScrollView></View></KeyboardAvoidingView></Modal>;
}

function Field({ label, multiline, ...props }: { label: string; multiline?: boolean } & React.ComponentProps<typeof TextInput>) {
  return <View><Text style={styles.fieldLabel}>{label}</Text><TextInput placeholderTextColor="#5f5f73" style={[styles.input, multiline && styles.textarea]} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} {...props} /></View>;
}

function Metric({ icon, label, value, accent = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; accent?: boolean }) {
  return <View style={[styles.metric, accent && styles.metricAccent]}><View style={styles.metricTop}><Ionicons name={icon} size={17} color={accent ? palette.gold : palette.cyan} /><Text style={styles.metricLabel}>{label.toUpperCase()}</Text></View><Text style={[styles.metricValue, accent && styles.gold]}>{value}</Text></View>;
}

function SmallStat({ label, value }: { label: string; value: number }) { return <View><Text style={styles.smallValue}>{value}</Text><Text style={styles.smallLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.night }, content: { padding: 18, paddingBottom: 38 }, flex: { flex: 1 }, heading: { minHeight: 104, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, eyebrow: { color: palette.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 }, title: { color: palette.white, fontFamily: displayFont, fontSize: 34, fontWeight: "700", marginTop: 5 }, subtitle: { color: palette.muted, fontSize: 11, marginTop: 4 }, brandIcon: { width: 49, height: 49, borderRadius: 17, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" }, loader: { marginTop: 80 },
  venueSettingsCard: { borderRadius: 18, borderWidth: 1, borderColor: "rgba(103,232,249,.18)", backgroundColor: "rgba(103,232,249,.05)", padding: 14, marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10 }, venueSettingsCopy: { flex: 1 }, venueSettingsName: { color: palette.white, fontSize: 17, fontWeight: "900", marginTop: 4 }, venueSettingsMeta: { color: palette.muted, fontSize: 9, marginTop: 4 }, venueSettingsButton: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 13, borderWidth: 1, borderColor: "rgba(103,232,249,.25)", paddingHorizontal: 11, paddingVertical: 9 }, venueSettingsButtonText: { color: palette.cyan, fontSize: 9, fontWeight: "900" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }, metric: { width: "48.5%", minHeight: 111, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 15, justifyContent: "space-between" }, metricAccent: { borderColor: "rgba(245,158,11,.28)", backgroundColor: "rgba(245,158,11,.08)" }, metricTop: { flexDirection: "row", alignItems: "center", gap: 7 }, metricLabel: { color: palette.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 }, metricValue: { color: palette.white, fontSize: 29, fontWeight: "900" }, gold: { color: palette.gold },
  sectionHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 31, marginBottom: 12 }, sectionTitle: { color: palette.white, fontFamily: displayFont, fontSize: 27, fontWeight: "700", marginTop: 4 }, offerCount: { color: palette.gold, fontWeight: "900", fontSize: 18 }, offer: { borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 16, marginBottom: 10 }, offerTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 }, venue: { color: palette.cyan, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 }, offerTitle: { color: palette.white, fontSize: 16, lineHeight: 21, fontWeight: "800", marginTop: 4 }, status: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 5 }, dot: { width: 6, height: 6, borderRadius: 3 }, statusText: { fontSize: 7, fontWeight: "900", letterSpacing: .7 }, offerStats: { borderTopWidth: 1, borderTopColor: palette.line, marginTop: 14, paddingTop: 13, flexDirection: "row", alignItems: "center", gap: 23 }, smallValue: { color: palette.white, fontSize: 15, fontWeight: "900" }, smallLabel: { color: palette.muted, fontSize: 8, marginTop: 2 }, ends: { color: palette.muted, fontSize: 9, marginLeft: "auto" },
  offerActions: { borderTopWidth: 1, borderTopColor: palette.line, marginTop: 13, paddingTop: 12, flexDirection: "row", gap: 8 }, editButton: { minHeight: 39, flex: 1, borderRadius: 12, borderWidth: 1, borderColor: "rgba(103,232,249,.22)", backgroundColor: "rgba(103,232,249,.06)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, editText: { color: palette.cyan, fontSize: 10, fontWeight: "900" }, liveButton: { minHeight: 39, flex: 1.3, borderRadius: 12, backgroundColor: palette.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, liveText: { color: palette.night, fontSize: 10, fontWeight: "900" }, endButton: { minHeight: 39, flex: 1, borderRadius: 12, borderWidth: 1, borderColor: "rgba(239,68,68,.25)", backgroundColor: "rgba(239,68,68,.07)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, endText: { color: "#fca5a5", fontSize: 10, fontWeight: "900" },
  notice: { borderRadius: 16, borderWidth: 1, borderColor: "rgba(16,185,129,.3)", backgroundColor: "rgba(16,185,129,.08)", padding: 13, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 8 }, noticeText: { color: "#a7f3d0", flex: 1, fontSize: 10, fontWeight: "700" }, error: { borderRadius: 18, borderWidth: 1, borderColor: "rgba(239,68,68,.3)", backgroundColor: "rgba(239,68,68,.08)", padding: 15, flexDirection: "row", gap: 11, alignItems: "center", marginTop: 25 }, errorTitle: { color: "#fecaca", fontWeight: "900" }, errorCopy: { color: "#fca5a5", fontSize: 10, marginTop: 3 }, empty: { borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, alignItems: "center", padding: 28 }, emptyTitle: { color: palette.white, fontWeight: "900", fontSize: 16, marginTop: 10 }, emptyCopy: { color: palette.muted, textAlign: "center", lineHeight: 18, fontSize: 11, marginTop: 6 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.84)", justifyContent: "flex-end" }, modal: { maxHeight: "94%", borderTopLeftRadius: 27, borderTopRightRadius: 27, borderWidth: 1, borderColor: palette.line, backgroundColor: "#14141d", padding: 19, paddingBottom: 30 }, modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }, modalTitle: { color: palette.white, fontFamily: displayFont, fontSize: 30, fontWeight: "700", marginTop: 3 }, close: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }, fieldLabel: { color: palette.muted, fontSize: 8, letterSpacing: 1.2, fontWeight: "900", marginTop: 13, marginBottom: 6 }, input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,.04)", color: palette.white, paddingHorizontal: 13, fontSize: 12 }, textarea: { minHeight: 100, paddingTop: 12, lineHeight: 18 }, twoFields: { flexDirection: "row", gap: 8 }, halfField: { flex: 1 }, tagChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, tagChoice: { borderRadius: 16, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 10, paddingVertical: 8 }, tagChoiceActive: { borderColor: "rgba(245,158,11,.5)", backgroundColor: "rgba(245,158,11,.1)" }, tagText: { color: palette.muted, fontSize: 9, fontWeight: "800", textTransform: "capitalize" }, tagTextActive: { color: palette.gold }, flashRow: { minHeight: 67, borderRadius: 15, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,.03)", flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginTop: 14 }, flashRowActive: { borderColor: "rgba(245,158,11,.35)", backgroundColor: "rgba(245,158,11,.07)" }, flashTitle: { color: palette.white, fontSize: 11, fontWeight: "900" }, flashCopy: { color: palette.muted, fontSize: 9, marginTop: 3 }, formError: { color: "#fecaca", backgroundColor: "rgba(239,68,68,.08)", borderRadius: 12, padding: 10, marginTop: 12, fontSize: 10 }, saveButton: { minHeight: 48, borderRadius: 14, backgroundColor: palette.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 }, saveText: { color: palette.night, fontSize: 11, fontWeight: "900" }, disabled: { opacity: .45 },
});
