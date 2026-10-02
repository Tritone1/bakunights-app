import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useLanguage } from "@/src/LanguageContext";
import { useUserLocation } from "@/src/LocationContext";
import { displayFont, palette } from "@/src/theme";

type Recommendation = {
  reason: string;
  venue: {
    id: string;
    name: string;
    cuisine: string;
    address: string;
    rating: number;
    priceLevel: number;
    amenities: string[];
    photoUrl: string | null;
    distanceKm: number | null;
    liveDeal: { id: string; title: string } | null;
  };
};

type ConciergeResponse = { reply: string; followUp: string; recommendations: Recommendation[] };
type Message = { id: string; role: "user" | "assistant"; content: string; recommendations?: Recommendation[] };

const COPY = {
  az: {
    subtitle: "Bakıda hara gedək?",
    greeting: "Salam! ✨ Necə bir məkan axtarırsınız? Şişalı sakit lounge, VIP otaqlı restoran və ya bu axşam endirimli bir yer yaza bilərsiniz.",
    placeholder: "Məsələn: qelyan ve VIP otaq olan yer...",
    thinking: "Uyğun məkanları yoxlayıram...",
    error: "Hazırda cavab verə bilmədim. Bir az sonra yenidən cəhd edin.",
    prompts: ["Şişa olan sakit yer", "VIP otaqlı restoran", "Bu axşam endirim harada var?"],
  },
  en: {
    subtitle: "Where should we go in Baku?",
    greeting: "Hi! ✨ Tell me what kind of place you want—a quiet shisha lounge, a restaurant with a VIP room, or somewhere with a live deal tonight.",
    placeholder: "Ask about a venue, mood, budget...",
    thinking: "Checking the best matches...",
    error: "I could not answer just now. Please try again shortly.",
    prompts: ["Quiet place with shisha", "Restaurant with a VIP room", "Deals available tonight"],
  },
  ru: {
    subtitle: "Куда пойти в Баку?",
    greeting: "Привет! ✨ Расскажите, какое место вы ищете: тихий лаунж с кальяном, ресторан с VIP-комнатой или заведение с акцией сегодня вечером.",
    placeholder: "Спросите о месте, атмосфере, бюджете...",
    thinking: "Ищу подходящие места...",
    error: "Сейчас не удалось ответить. Попробуйте ещё раз немного позже.",
    prompts: ["Тихое место с кальяном", "Ресторан с VIP-комнатой", "Акции на сегодня"],
  },
};

const STORAGE_KEY = "wheretogo-ai-conversation-v1";
const MAX_SAVED_MESSAGES = 30;

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AssistantScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const { coords } = useUserLocation();
  const copy = COPY[language];
  const [messages, setMessages] = useState<Message[]>(() => [{ id: "welcome", role: "assistant", content: COPY[language].greeting }]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const listRef = useRef<FlatList<Message> | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!active || !stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter((item): item is Message => Boolean(item && typeof item === "object"
        && "id" in item && typeof item.id === "string"
        && "role" in item && (item.role === "user" || item.role === "assistant")
        && "content" in item && typeof item.content === "string"));
      if (valid.length) setMessages(valid.slice(-MAX_SAVED_MESSAGES));
    }).catch(() => undefined).finally(() => { if (active) setHistoryLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_SAVED_MESSAGES)));
  }, [historyLoaded, messages]);

  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [loading, messages]);

  async function send(value = draft) {
    const content = value.trim();
    if (!content || loading) return;
    const userMessage: Message = { id: messageId(), role: "user", content };
    const history = [...messages.slice(-9).map(({ role, content: messageContent }) => ({ role, content: messageContent })), { role: "user" as const, content }].slice(-10);
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setLoading(true);
    try {
      const result = await api<ConciergeResponse>("/concierge", {
        method: "POST",
        body: JSON.stringify({
          messages: history,
          language,
          ...(coords ? { location: { lat: coords.latitude, lng: coords.longitude } } : {}),
        }),
      });
      setMessages((current) => [...current, {
        id: messageId(),
        role: "assistant",
        content: result.followUp ? `${result.reply}\n\n${result.followUp}` : result.reply,
        recommendations: result.recommendations,
      }]);
    } catch (reason) {
      const content = reason instanceof Error && reason.message !== "AI concierge is not configured yet." ? reason.message : copy.error;
      setMessages((current) => [...current, { id: messageId(), role: "assistant", content }]);
    } finally { setLoading(false); }
  }

  function openRecommendation(item: Recommendation) {
    if (item.venue.liveDeal) router.push({ pathname: "/deals/[id]", params: { id: item.venue.liveDeal.id } } as never);
    else router.push({ pathname: "/(tabs)/explore", params: { venue: item.venue.id } } as never);
  }

  function newChat() {
    setMessages([{ id: "welcome", role: "assistant", content: copy.greeting }]);
    void AsyncStorage.removeItem(STORAGE_KEY);
  }

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={82}>
      <View style={styles.header}><View style={styles.bot}><Ionicons name="sparkles" size={22} color={palette.night} /></View><View style={styles.headerCopy}><View style={styles.titleRow}><Text style={styles.title}>Hara AI</Text><Text style={styles.gpt}>GPT</Text></View><Text style={styles.subtitle}>{copy.subtitle}</Text></View><View style={styles.online} /><Pressable onPress={newChat} style={styles.reset} accessibilityLabel="New chat"><Ionicons name="refresh" size={17} color={palette.muted} /></Pressable></View>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.messages}
        renderItem={({ item }) => <View style={[styles.messageWrap, item.role === "user" ? styles.userWrap : styles.assistantWrap]}>
          <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}><Text style={[styles.messageText, item.role === "user" && styles.userText]}>{item.content}</Text></View>
          {item.recommendations?.map((recommendation) => <Pressable key={recommendation.venue.id} onPress={() => openRecommendation(recommendation)} style={styles.venueCard}>
            {recommendation.venue.photoUrl ? <Image source={{ uri: recommendation.venue.photoUrl }} style={styles.venueImage} /> : <View style={[styles.venueImage, styles.imageFallback]}><Ionicons name="storefront" size={27} color={palette.gold} /></View>}
            <View style={styles.venueCopy}><View style={styles.venueTop}><Text numberOfLines={1} style={styles.venueName}>{recommendation.venue.name}</Text><View style={styles.rating}><Ionicons name="star" size={11} color={palette.gold} /><Text style={styles.ratingText}>{recommendation.venue.rating.toFixed(1)}</Text></View></View><Text style={styles.venueMeta}>{recommendation.venue.cuisine.toUpperCase()} · {"₼".repeat(recommendation.venue.priceLevel)}</Text><Text numberOfLines={2} style={styles.reason}>{recommendation.reason}</Text><View style={styles.locationRow}><Ionicons name="location" size={11} color={palette.muted} /><Text numberOfLines={1} style={styles.location}>{recommendation.venue.distanceKm != null ? `${recommendation.venue.distanceKm} km · ` : ""}{recommendation.venue.address}</Text></View>{recommendation.venue.liveDeal && <Text numberOfLines={1} style={styles.offer}><Ionicons name="sparkles" size={10} color={palette.gold} /> {recommendation.venue.liveDeal.title}</Text>}</View>
            <Ionicons name="chevron-forward" size={18} color="#555568" />
          </Pressable>)}
        </View>}
        ListFooterComponent={loading ? <View style={[styles.bubble, styles.assistantBubble, styles.loadingBubble]}><View style={styles.dots}><View style={styles.dot} /><View style={styles.dot} /><View style={styles.dot} /></View><Text style={styles.thinking}>{copy.thinking}</Text></View> : null}
      />
      {messages.length === 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.prompts}>{copy.prompts.map((prompt) => <Pressable key={prompt} onPress={() => void send(prompt)} style={styles.prompt}><Text style={styles.promptText}>{prompt}</Text></Pressable>)}</ScrollView>}
      <View style={styles.composer}><TextInput value={draft} onChangeText={setDraft} editable={!loading} maxLength={1600} multiline placeholder={copy.placeholder} placeholderTextColor="#626276" style={styles.input} /><Pressable onPress={() => void send()} disabled={!draft.trim() || loading} style={[styles.send, (!draft.trim() || loading) && styles.sendDisabled]} accessibilityLabel="Send"><Ionicons name="send" size={19} color={palette.night} /></Pressable></View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.night },
  flex: { flex: 1 },
  header: { height: 72, borderBottomWidth: 1, borderBottomColor: palette.line, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: palette.card },
  bot: { width: 43, height: 43, borderRadius: 15, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 }, titleRow: { flexDirection: "row", alignItems: "center", gap: 7 }, title: { color: palette.white, fontFamily: displayFont, fontSize: 22, fontWeight: "700" }, gpt: { color: palette.cyan, fontSize: 8, fontWeight: "900", letterSpacing: 1, borderRadius: 8, backgroundColor: "rgba(103,232,249,.09)", paddingHorizontal: 6, paddingVertical: 3 }, subtitle: { color: palette.muted, fontSize: 10, marginTop: 2 }, online: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.green, shadowColor: palette.green, shadowOpacity: .8, shadowRadius: 5 }, reset: { width: 35, height: 35, borderRadius: 18, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" },
  messages: { padding: 15, paddingBottom: 20, flexGrow: 1, justifyContent: "flex-end" },
  messageWrap: { marginBottom: 14 }, userWrap: { marginLeft: 48, alignItems: "flex-end" }, assistantWrap: { marginRight: 24, alignItems: "flex-start" },
  bubble: { borderRadius: 19, paddingHorizontal: 14, paddingVertical: 11, maxWidth: "100%" }, userBubble: { backgroundColor: palette.gold, borderBottomRightRadius: 5 }, assistantBubble: { backgroundColor: palette.cardRaised, borderWidth: 1, borderColor: palette.line, borderBottomLeftRadius: 5 }, messageText: { color: "#e8e8ef", fontSize: 13, lineHeight: 20 }, userText: { color: palette.night, fontWeight: "600" },
  venueCard: { width: "100%", minHeight: 116, marginTop: 9, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, flexDirection: "row", alignItems: "center", paddingRight: 8 }, venueImage: { width: 98, alignSelf: "stretch" }, imageFallback: { minHeight: 116, alignItems: "center", justifyContent: "center", backgroundColor: palette.cardRaised }, venueCopy: { flex: 1, padding: 11 }, venueTop: { flexDirection: "row", alignItems: "center", gap: 6 }, venueName: { color: palette.white, flex: 1, fontFamily: displayFont, fontSize: 18, fontWeight: "700" }, rating: { flexDirection: "row", alignItems: "center", gap: 3 }, ratingText: { color: palette.goldSoft, fontSize: 9, fontWeight: "900" }, venueMeta: { color: palette.cyan, fontSize: 7, fontWeight: "900", letterSpacing: 1, marginTop: 2 }, reason: { color: "#aaaabc", fontSize: 9, lineHeight: 13, marginTop: 6 }, locationRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 }, location: { color: "#6f6f82", flex: 1, fontSize: 8 }, offer: { color: palette.gold, fontSize: 8, fontWeight: "800", marginTop: 5 },
  loadingBubble: { marginLeft: 15, marginBottom: 12, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 9 }, dots: { flexDirection: "row", gap: 3 }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.gold }, thinking: { color: palette.muted, fontSize: 10 },
  prompts: { paddingHorizontal: 13, paddingVertical: 10, gap: 7, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,.04)" }, prompt: { borderRadius: 17, borderWidth: 1, borderColor: "rgba(245,158,11,.25)", backgroundColor: "rgba(245,158,11,.06)", paddingHorizontal: 12, paddingVertical: 8 }, promptText: { color: palette.goldSoft, fontSize: 10, fontWeight: "700" },
  composer: { borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.card, padding: 11, flexDirection: "row", alignItems: "flex-end", gap: 8 }, input: { flex: 1, minHeight: 46, maxHeight: 105, borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,.035)", color: palette.white, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 11, fontSize: 13 }, send: { width: 46, height: 46, borderRadius: 16, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" }, sendDisabled: { opacity: .4 },
});
