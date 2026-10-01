import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { LocalizedText as Text, LocalizedTextInput as TextInput } from "@/src/LocalizedText";
import { displayFont, palette } from "@/src/theme";

type Venue = { id: string; name: string };
type Category = { id: string; name: string; sortOrder: number; isGlobal: boolean };
type CategorySelection = { categoryId: string; sortOrder: number; category: Category };
type CategoryOptions = { selected: CategorySelection[]; available: Category[] };
type MenuItem = { id: string; venueId: string; categoryId: string; name: string; priceAzn: number; description?: string | null; photoUrl?: string | null; isActive: boolean; category: Category };

export default function MerchantMenuScreen() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState("");
  const [categories, setCategories] = useState<CategoryOptions>({ selected: [], available: [] });
  const [items, setItems] = useState<MenuItem[]>([]);
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [customSection, setCustomSection] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadMenu = useCallback(async (targetVenueId: string, refresh = false) => {
    if (!targetVenueId) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const [categoryResult, itemResult] = await Promise.all([
        api<CategoryOptions>(`/merchant/menu-categories?venueId=${encodeURIComponent(targetVenueId)}`),
        api<{ items: MenuItem[] }>(`/merchant/venues/${targetVenueId}/menu`),
      ]);
      setCategories(categoryResult);
      setItems(itemResult.items);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load this venue menu."); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    let active = true;
    api<{ restaurants: Venue[] }>("/merchant/dashboard").then(({ restaurants }) => {
      if (!active) return;
      setVenues(restaurants);
      const first = restaurants[0]?.id ?? "";
      setVenueId(first);
      if (first) void loadMenu(first); else setLoading(false);
    }).catch((reason) => { if (active) { setError(reason instanceof Error ? reason.message : "Could not load your venues."); setLoading(false); } });
    return () => { active = false; };
  }, [loadMenu]);

  const grouped = useMemo(() => categories.selected.map(({ category }) => ({ category, items: items.filter((item) => item.categoryId === category.id) })), [categories.selected, items]);

  async function updateSections(categoryIds: string[], success: string) {
    setBusy("sections"); setError("");
    try {
      const result = await api<CategoryOptions>("/merchant/menu-categories", { method: "PUT", body: JSON.stringify({ venueId, categoryIds }) });
      setCategories(result); setMessage(success);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update menu sections."); }
    finally { setBusy(""); }
  }

  async function createSection() {
    if (customSection.trim().length < 2) return;
    setBusy("sections"); setError("");
    try {
      const result = await api<CategoryOptions & { category: Category }>("/merchant/menu-categories/custom", { method: "POST", body: JSON.stringify({ venueId, name: customSection.trim() }) });
      setCategories({ selected: result.selected, available: result.available }); setCustomSection(""); setMessage("Custom menu section created.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create this section."); }
    finally { setBusy(""); }
  }

  async function toggleItem(item: MenuItem) {
    setBusy(item.id); setError("");
    try {
      await api(`/merchant/menu/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !item.isActive }) });
      await loadMenu(venueId);
      setMessage(`${item.name} is now ${item.isActive ? "hidden" : "active"}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update this item."); }
    finally { setBusy(""); }
  }

  function switchVenue(nextVenueId: string) { setVenueId(nextVenueId); setEditing(null); setMessage(""); setError(""); void loadMenu(nextVenueId); }

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadMenu(venueId, true)} tintColor={palette.gold} />} contentContainerStyle={styles.content}>
    <View style={styles.heading}><View style={styles.flex}><Text style={styles.eyebrow}>VENUE MENU</Text><Text style={styles.title}>Menu items</Text><Text style={styles.subtitle}>Keep your items, prices and availability up to date.</Text></View><Pressable onPress={() => categories.selected.length ? setEditing("new") : setSectionsOpen(true)} style={styles.addButton}><Ionicons name="add" size={24} color={palette.night} /></Pressable></View>

    {venues.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.venueTabs}>{venues.map((venue) => <Pressable key={venue.id} onPress={() => switchVenue(venue.id)} style={[styles.venueTab, venue.id === venueId && styles.venueTabActive]}><Text style={[styles.venueTabText, venue.id === venueId && styles.venueTabTextActive]}>{venue.name}</Text></Pressable>)}</ScrollView> : null}

    {(message || error) ? <Pressable onPress={() => { setMessage(""); setError(""); }} style={[styles.notice, error ? styles.noticeError : styles.noticeSuccess]}><Ionicons name={error ? "alert-circle" : "checkmark-circle"} size={18} color={error ? "#fca5a5" : "#6ee7b7"} /><Text style={[styles.noticeText, { color: error ? "#fecaca" : "#a7f3d0" }]}>{error || message}</Text><Ionicons name="close" size={16} color={palette.muted} /></Pressable> : null}

    <View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>MENU STRUCTURE</Text><Text style={styles.sectionTitle}>Sections</Text></View><Pressable onPress={() => setSectionsOpen((open) => !open)} style={styles.manageButton}><Ionicons name="options-outline" size={15} color={palette.cyan} /><Text style={styles.manageText}>{sectionsOpen ? "Done" : "Manage"}</Text></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionPills}>{categories.selected.map(({ category }) => <View key={category.id} style={styles.sectionPill}><Text style={styles.sectionPillText}>{category.name}</Text></View>)}{!categories.selected.length ? <Text style={styles.noSections}>Add a section before creating menu items.</Text> : null}</ScrollView>

    {sectionsOpen ? <View style={styles.sectionManager}>
      <Text style={styles.label}>AVAILABLE SECTIONS</Text><View style={styles.availableWrap}>{categories.available.map((category) => <Pressable key={category.id} disabled={busy === "sections"} onPress={() => void updateSections([...categories.selected.map((row) => row.categoryId), category.id], `${category.name} added.`)} style={styles.availablePill}><Ionicons name="add-circle-outline" size={15} color={palette.gold} /><Text style={styles.availableText}>{category.name}</Text></Pressable>)}</View>
      <Text style={styles.label}>CUSTOM SECTION</Text><View style={styles.inline}><TextInput value={customSection} onChangeText={setCustomSection} placeholder="e.g. Chef specials" placeholderTextColor="#5f5f73" style={[styles.input, styles.flex]} /><Pressable onPress={() => void createSection()} disabled={busy === "sections" || customSection.trim().length < 2} style={[styles.inlineButton, (busy === "sections" || customSection.trim().length < 2) && styles.disabled]}><Text style={styles.inlineButtonText}>Add</Text></Pressable></View>
    </View> : null}

    {loading ? <ActivityIndicator color={palette.gold} style={styles.loader} /> : grouped.some((group) => group.items.length) ? grouped.map(({ category, items: categoryItems }) => categoryItems.length ? <View key={category.id} style={styles.group}><View style={styles.groupHead}><Text style={styles.groupName}>{category.name.toUpperCase()}</Text><Text style={styles.groupCount}>{categoryItems.length}</Text></View>{categoryItems.map((item) => <View key={item.id} style={[styles.item, !item.isActive && styles.itemInactive]}><View style={styles.itemIcon}><Ionicons name="restaurant-outline" size={20} color={item.isActive ? palette.gold : palette.muted} /></View><View style={styles.itemCopy}><Text style={styles.itemName}>{item.name}</Text><Text style={styles.itemPrice}>{Number(item.priceAzn).toFixed(2)} AZN</Text>{item.description ? <Text style={styles.itemDescription} numberOfLines={1}>{item.description}</Text> : null}</View><View style={styles.itemActions}><Pressable onPress={() => setEditing(item)} style={styles.iconButton}><Ionicons name="pencil" size={17} color={palette.cyan} /></Pressable><Switch value={item.isActive} onValueChange={() => void toggleItem(item)} disabled={busy === item.id} trackColor={{ false: "#343441", true: "#805306" }} thumbColor={item.isActive ? palette.gold : "#88889a"} /></View></View>)}</View> : null) : <View style={styles.empty}><Ionicons name="restaurant-outline" size={31} color={palette.gold} /><Text style={styles.emptyTitle}>No menu items yet</Text><Text style={styles.emptyCopy}>{categories.selected.length ? "Add your first item with its price and menu section." : "Start by adding at least one menu section."}</Text><Pressable onPress={() => categories.selected.length ? setEditing("new") : setSectionsOpen(true)} style={styles.primary}><Text style={styles.primaryText}>{categories.selected.length ? "Add menu item" : "Set up sections"}</Text></Pressable></View>}
  </ScrollView>
  <MenuItemEditor key={editing === "new" ? "new" : editing?.id ?? "closed"} visible={editing !== null} venueId={venueId} categories={categories.selected.map((row) => row.category)} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); setMessage(editing === "new" ? "Menu item added." : "Menu item updated."); await loadMenu(venueId); }} />
  </SafeAreaView>;
}

function MenuItemEditor({ visible, venueId, categories, item, onClose, onSaved }: { visible: boolean; venueId: string; categories: Category[]; item: MenuItem | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? String(item.priceAzn) : "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (name.trim().length < 2 || !categoryId || !Number.isFinite(Number(price)) || Number(price) <= 0) { setError("Enter an item name, section and valid price."); return; }
    setSaving(true); setError("");
    try {
      await api(item ? `/merchant/menu/items/${item.id}` : `/merchant/venues/${venueId}/menu`, { method: item ? "PATCH" : "POST", body: JSON.stringify({ name: name.trim(), categoryId, priceAzn: Number(price), description: description.trim() || null, isActive: item?.isActive ?? true }) });
      await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this menu item."); }
    finally { setSaving(false); }
  }

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.modal}><View style={styles.modalHead}><View><Text style={styles.eyebrow}>VENUE MENU</Text><Text style={styles.modalTitle}>{item ? "Edit item" : "Add item"}</Text></View><Pressable onPress={onClose} style={styles.close}><Ionicons name="close" size={21} color={palette.white} /></Pressable></View><ScrollView keyboardShouldPersistTaps="handled"><Text style={styles.label}>ITEM NAME</Text><TextInput value={name} onChangeText={setName} placeholder="Item name" placeholderTextColor="#5f5f73" style={styles.input} /><Text style={styles.label}>MENU SECTION</Text><View style={styles.categoryChoices}>{categories.map((category) => <Pressable key={category.id} onPress={() => setCategoryId(category.id)} style={[styles.categoryChoice, category.id === categoryId && styles.categoryChoiceActive]}><Text style={[styles.categoryChoiceText, category.id === categoryId && styles.categoryChoiceTextActive]}>{category.name}</Text></Pressable>)}</View><Text style={styles.label}>PRICE (AZN)</Text><TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#5f5f73" style={styles.input} /><Text style={styles.label}>DESCRIPTION (OPTIONAL)</Text><TextInput value={description} onChangeText={setDescription} multiline textAlignVertical="top" placeholder="Ingredients or serving details" placeholderTextColor="#5f5f73" style={[styles.input, styles.textarea]} />{error ? <Text style={styles.formError}>{error}</Text> : null}<Pressable onPress={() => void save()} disabled={saving} style={[styles.primary, saving && styles.disabled]}><Text style={styles.primaryText}>{saving ? "Saving…" : "Save item"}</Text></Pressable></ScrollView></View></KeyboardAvoidingView></Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.night }, content: { padding: 18, paddingBottom: 42 }, flex: { flex: 1 }, heading: { minHeight: 112, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, eyebrow: { color: palette.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 }, title: { color: palette.white, fontFamily: displayFont, fontSize: 37, fontWeight: "700", marginTop: 4 }, subtitle: { color: palette.muted, fontSize: 11, marginTop: 5 }, addButton: { width: 49, height: 49, borderRadius: 17, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" }, venueTabs: { gap: 8, paddingBottom: 15 }, venueTab: { borderRadius: 18, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 13, paddingVertical: 9 }, venueTabActive: { borderColor: "rgba(245,158,11,.5)", backgroundColor: "rgba(245,158,11,.1)" }, venueTabText: { color: palette.muted, fontSize: 10, fontWeight: "800" }, venueTabTextActive: { color: palette.gold }, notice: { borderRadius: 15, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 15 }, noticeError: { borderColor: "rgba(239,68,68,.3)", backgroundColor: "rgba(239,68,68,.08)" }, noticeSuccess: { borderColor: "rgba(16,185,129,.3)", backgroundColor: "rgba(16,185,129,.08)" }, noticeText: { flex: 1, fontSize: 10, fontWeight: "700" }, sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8 }, sectionTitle: { color: palette.white, fontFamily: displayFont, fontSize: 25, fontWeight: "700", marginTop: 3 }, manageButton: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 10, paddingVertical: 8 }, manageText: { color: palette.cyan, fontSize: 10, fontWeight: "900" }, sectionPills: { gap: 7, paddingVertical: 12 }, sectionPill: { borderRadius: 16, backgroundColor: "rgba(103,232,249,.08)", borderWidth: 1, borderColor: "rgba(103,232,249,.2)", paddingHorizontal: 11, paddingVertical: 8 }, sectionPillText: { color: "#cffafe", fontSize: 9, fontWeight: "800" }, noSections: { color: palette.muted, fontSize: 10, paddingVertical: 8 }, sectionManager: { borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 14, marginBottom: 18 }, label: { color: palette.muted, fontSize: 8, letterSpacing: 1.25, fontWeight: "900", marginTop: 12, marginBottom: 6 }, availableWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, availablePill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 16, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 10, paddingVertical: 8 }, availableText: { color: palette.white, fontSize: 9, fontWeight: "700" }, inline: { flexDirection: "row", gap: 8 }, inlineButton: { minWidth: 62, borderRadius: 13, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" }, inlineButtonText: { color: palette.night, fontWeight: "900", fontSize: 10 }, input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,.04)", color: palette.white, paddingHorizontal: 13, fontSize: 12 }, textarea: { minHeight: 93, paddingTop: 12 }, loader: { marginTop: 70 }, group: { marginTop: 20 }, groupHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }, groupName: { color: palette.muted, fontSize: 9, letterSpacing: 1.6, fontWeight: "900" }, groupCount: { color: palette.gold, fontSize: 10, fontWeight: "900" }, item: { minHeight: 79, borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 8 }, itemInactive: { opacity: .55 }, itemIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(245,158,11,.08)", alignItems: "center", justifyContent: "center" }, itemCopy: { flex: 1 }, itemName: { color: palette.white, fontSize: 13, fontWeight: "800" }, itemPrice: { color: palette.gold, fontSize: 11, fontWeight: "900", marginTop: 3 }, itemDescription: { color: palette.muted, fontSize: 9, marginTop: 3 }, itemActions: { flexDirection: "row", alignItems: "center", gap: 7 }, iconButton: { width: 35, height: 35, borderRadius: 11, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }, empty: { borderRadius: 21, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, alignItems: "center", padding: 27, marginTop: 22 }, emptyTitle: { color: palette.white, fontFamily: displayFont, fontSize: 24, fontWeight: "700", marginTop: 11 }, emptyCopy: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 6 }, primary: { minHeight: 47, borderRadius: 14, backgroundColor: palette.gold, alignSelf: "stretch", alignItems: "center", justifyContent: "center", marginTop: 16 }, primaryText: { color: palette.night, fontSize: 11, fontWeight: "900" }, disabled: { opacity: .4 }, modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.82)", justifyContent: "flex-end" }, modal: { maxHeight: "92%", borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: palette.line, backgroundColor: "#14141d", padding: 19, paddingBottom: 30 }, modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 10 }, modalTitle: { color: palette.white, fontFamily: displayFont, fontSize: 29, fontWeight: "700", marginTop: 3 }, close: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }, categoryChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, categoryChoice: { borderRadius: 16, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 10, paddingVertical: 8 }, categoryChoiceActive: { borderColor: "rgba(245,158,11,.5)", backgroundColor: "rgba(245,158,11,.1)" }, categoryChoiceText: { color: palette.muted, fontSize: 9, fontWeight: "800" }, categoryChoiceTextActive: { color: palette.gold }, formError: { color: "#fecaca", backgroundColor: "rgba(239,68,68,.08)", borderRadius: 12, padding: 10, marginTop: 12, fontSize: 10 },
});
