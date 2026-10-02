import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bot, ChevronRight, MapPin, MessageCircle, RotateCcw, Send, Sparkles, Star, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { api } from "../lib/api";
import { SafeImage } from "./SafeImage";

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
    phone: string | null;
    isVerifiedTrusted: boolean;
    distanceKm: number | null;
    liveDeal: { id: string; title: string } | null;
  };
};

type ConciergeResponse = {
  reply: string;
  followUp: string;
  recommendations: Recommendation[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  recommendations?: Recommendation[];
};

type Copy = {
  title: string;
  subtitle: string;
  greeting: string;
  placeholder: string;
  send: string;
  thinking: string;
  error: string;
  open: string;
  newChat: string;
  prompts: string[];
};

const STORAGE_KEY = "wheretogo-ai-conversation-v1";
const MAX_SAVED_MESSAGES = 30;

const COPY: Record<"az" | "en" | "ru", Copy> = {
  az: {
    title: "Hara AI",
    subtitle: "Bakıda hara gedək?",
    greeting: "Salam! ✨ Necə bir məkan axtarırsınız? Məsələn, şişalı sakit lounge, VIP otaqlı restoran və ya bu axşam endirimli bir yer deyə bilərsiniz.",
    placeholder: "Məsələn: qelyan ve VIP otaq olan yer...",
    send: "Göndər",
    thinking: "Uyğun məkanları yoxlayıram...",
    error: "Hazırda cavab verə bilmədim. Bir az sonra yenidən cəhd edin.",
    open: "AI-dan soruş",
    newChat: "Yeni söhbət",
    prompts: ["Şişa olan sakit yer", "VIP otaqlı restoran", "Bu axşam endirim harada var?"],
  },
  en: {
    title: "Hara AI",
    subtitle: "Where should we go in Baku?",
    greeting: "Hi! ✨ Tell me what kind of place you want—perhaps a quiet shisha lounge, a restaurant with a VIP room, or somewhere with a live deal tonight.",
    placeholder: "Ask about a venue, mood, budget...",
    send: "Send",
    thinking: "Checking the best matches...",
    error: "I could not answer just now. Please try again shortly.",
    open: "Ask the AI",
    newChat: "New chat",
    prompts: ["Quiet place with shisha", "Restaurant with a VIP room", "Deals available tonight"],
  },
  ru: {
    title: "Hara AI",
    subtitle: "Куда пойти в Баку?",
    greeting: "Привет! ✨ Расскажите, какое место вы ищете: тихий лаунж с кальяном, ресторан с VIP-комнатой или заведение с акцией сегодня вечером.",
    placeholder: "Спросите о месте, атмосфере, бюджете...",
    send: "Отправить",
    thinking: "Ищу подходящие места...",
    error: "Сейчас не удалось ответить. Попробуйте ещё раз немного позже.",
    open: "Спросить AI",
    newChat: "Новый чат",
    prompts: ["Тихое место с кальяном", "Ресторан с VIP-комнатой", "Акции на сегодня"],
  },
};

function loadMessages(language: "az" | "en" | "ru") {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as unknown;
    if (!Array.isArray(stored)) throw new Error("No saved conversation");
    const valid = stored.filter((item): item is ChatMessage => Boolean(item && typeof item === "object"
      && "id" in item && typeof item.id === "string"
      && "role" in item && (item.role === "user" || item.role === "assistant")
      && "content" in item && typeof item.content === "string"));
    if (valid.length) return valid.slice(-MAX_SAVED_MESSAGES);
  } catch { /* Start clean if browser storage is unavailable or malformed. */ }
  return [{ id: "welcome", role: "assistant" as const, content: COPY[language].greeting }];
}

export function AiConcierge({ location }: { location?: { lat: number; lng: number } | null }) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(language));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const requestMessages = useMemo(() => messages.slice(-9).map(({ role, content }) => ({ role, content })), [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [loading, messages]);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_SAVED_MESSAGES))); }
    catch { /* Chat still works when browser storage is unavailable. */ }
  }, [messages]);

  function newChat() {
    const welcome: ChatMessage = { id: "welcome", role: "assistant", content: copy.greeting };
    setMessages([welcome]);
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* Ignore unavailable storage. */ }
  }

  async function sendMessage(value = draft) {
    const content = value.trim();
    if (!content || loading) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const history = [...requestMessages, { role: "user" as const, content }].slice(-10);
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setLoading(true);
    try {
      const result = await api<ConciergeResponse>("/concierge", {
        method: "POST",
        body: JSON.stringify({ messages: history, language, ...(location ? { location } : {}) }),
      });
      const assistantContent = result.followUp ? `${result.reply}\n\n${result.followUp}` : result.reply;
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: assistantContent, recommendations: result.recommendations }]);
    } catch (reason) {
      const message = reason instanceof Error && reason.message !== "AI concierge is not configured yet." ? reason.message : copy.error;
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: message }]);
    } finally { setLoading(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 right-4 z-[125] flex items-center gap-2 rounded-full bg-gold px-4 py-3 text-sm font-black text-[#09090e] shadow-[0_16px_45px_rgba(245,158,11,.3)] transition hover:-translate-y-0.5 hover:bg-[#ffb21c] sm:bottom-7 sm:right-7" aria-label={copy.open}>
      <MessageCircle size={20} /><span>{copy.open}</span>
    </button>
    {open && <div className="fixed inset-0 z-[150] flex items-end justify-end bg-black/60 p-0 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-label={copy.title}>
      <section className="flex h-[min(760px,100dvh)] w-full flex-col overflow-hidden border border-white/10 bg-[#0d0d15] shadow-2xl sm:h-[min(720px,calc(100dvh-40px))] sm:max-w-[470px] sm:rounded-[28px]">
        <header className="flex items-center gap-3 border-b border-white/10 bg-[#13131e] px-4 py-4">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gold text-[#09090e]"><Bot size={23} /></span>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-display text-xl font-bold text-white">{copy.title}</h2><span className="rounded-full bg-cyan/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-cyan">GPT</span></div><p className="text-xs text-white/45">{copy.subtitle}</p></div>
          <button type="button" onClick={newChat} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label={copy.newChat} title={copy.newChat}><RotateCcw size={17} /></button>
          <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Close"><X size={19} /></button>
        </header>
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
          {messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-10" : "mr-5"}>
            <div data-no-translate className={message.role === "user" ? "whitespace-pre-wrap rounded-2xl rounded-br-md bg-gold px-4 py-3 text-sm font-medium leading-6 text-[#09090e]" : "whitespace-pre-wrap rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-6 text-white/85"}>{message.content}</div>
            {message.recommendations?.map(({ venue, reason }) => <Link to={`/venues/${venue.id}`} onClick={() => setOpen(false)} key={venue.id} className="mt-3 flex overflow-hidden rounded-2xl border border-white/10 bg-[#171720] transition hover:border-gold/40">
              <SafeImage src={venue.photoUrl || undefined} alt={venue.name} className="h-[104px] w-[105px] shrink-0 object-cover" />
              <span className="min-w-0 flex-1 p-3"><span className="flex items-start justify-between gap-2"><span className="truncate font-display text-lg font-bold text-white">{venue.name}</span><span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-gold"><Star size={11} fill="currentColor" />{venue.rating.toFixed(1)}</span></span><span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-cyan">{venue.cuisine} · {"₼".repeat(venue.priceLevel)}</span><span data-no-translate className="mt-1.5 line-clamp-2 block text-[11px] leading-4 text-white/55">{reason}</span><span className="mt-2 flex items-center gap-1 text-[10px] text-white/40"><MapPin size={11} />{venue.distanceKm != null ? `${venue.distanceKm} km · ` : ""}{venue.address}</span>{venue.liveDeal && <span className="mt-2 block truncate text-[10px] font-bold text-gold"><Sparkles size={11} className="mr-1 inline" />{venue.liveDeal.title}</span>}</span>
              <ChevronRight size={18} className="mr-2 self-center text-white/25" />
            </Link>)}
          </div>)}
          {loading && <div className="mr-16 flex items-center gap-2 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.045] px-4 py-3 text-xs text-white/55"><span className="flex gap-1"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold [animation-delay:300ms]" /></span>{copy.thinking}</div>}
        </div>
        {messages.length === 1 && <div className="flex gap-2 overflow-x-auto border-t border-white/5 px-4 py-3">{copy.prompts.map((prompt) => <button type="button" key={prompt} onClick={() => void sendMessage(prompt)} className="shrink-0 rounded-full border border-gold/25 bg-gold/[0.07] px-3 py-2 text-[11px] font-semibold text-gold transition hover:bg-gold/15">{prompt}</button>)}</div>}
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-white/10 bg-[#13131e] p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} maxLength={1600} rows={1} placeholder={copy.placeholder} className="max-h-28 min-h-12 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-gold/45" />
          <button type="submit" disabled={!draft.trim() || loading} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gold text-[#09090e] transition hover:bg-[#ffb21c] disabled:cursor-not-allowed disabled:opacity-40" aria-label={copy.send}><Send size={19} /></button>
        </form>
      </section>
    </div>}
  </>;
}
