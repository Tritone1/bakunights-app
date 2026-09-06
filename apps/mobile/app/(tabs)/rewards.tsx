import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";

import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { displayFont, palette } from "@/src/theme";
import type { PointReward, PointsStatus } from "@/src/types";

const POINT_VALUES = [10, 25, 15, 30, 10, 15, 25, 50, 30, 15, 10, 25, 15, 10, 10, 30, 25, 15, 10, 60, 25, 15, 30, 10] as const;
const SLICE = 360 / POINT_VALUES.length;
const WHEEL_SIZE = 300;
const WHEEL_CENTER = WHEEL_SIZE / 2;
type SpinResult = { wheelIndex: number; pointsEarned: number; rewardUnlocked: PointReward | null; status: PointsStatus };

function polar(radius: number, angle: number) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: WHEEL_CENTER + radius * Math.cos(radians), y: WHEEL_CENTER + radius * Math.sin(radians) };
}

function sectorPath(index: number) {
  const start = polar(136, index * SLICE);
  const end = polar(136, (index + 1) * SLICE);
  return `M ${WHEEL_CENTER} ${WHEEL_CENTER} L ${start.x} ${start.y} A 136 136 0 0 1 ${end.x} ${end.y} Z`;
}

function WheelFace() {
  return <Svg width={WHEEL_SIZE} height={WHEEL_SIZE} viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}>
    <Circle cx={WHEEL_CENTER} cy={WHEEL_CENTER} r={146} fill="#0b0c0e" stroke="#d4af37" strokeWidth={7} />
    {POINT_VALUES.map((points, index) => {
      const fill = points === 60 ? "#d4af37" : points === 50 ? "#087a56" : index % 2 ? "#141719" : "#ae1d34";
      return <Path key={`slice-${index}`} d={sectorPath(index)} fill={fill} stroke="rgba(212,175,55,.58)" strokeWidth={1} />;
    })}
    <Circle cx={WHEEL_CENTER} cy={WHEEL_CENTER} r={136} fill="none" stroke="#f0c84d" strokeWidth={2} />
    {POINT_VALUES.map((points, index) => {
      const label = polar(104, index * SLICE + SLICE / 2);
      const color = points === 60 ? "#17120a" : "#fff5d9";
      return <SvgText key={`label-${index}`} x={label.x} y={label.y + 4} fill={color} fontSize={points >= 50 ? 13 : 11} fontWeight="900" textAnchor="middle">{points}</SvgText>;
    })}
    {POINT_VALUES.map((_, index) => {
      const light = polar(141, index * SLICE);
      return <Circle key={`light-${index}`} cx={light.x} cy={light.y} r={2.7} fill="#fff5d9" />;
    })}
    <Circle cx={WHEEL_CENTER} cy={WHEEL_CENTER} r={50} fill="#101214" stroke="#d4af37" strokeWidth={6} />
    <Circle cx={WHEEL_CENTER} cy={WHEEL_CENTER} r={42} fill="#f1d98e" stroke="#8d6c16" strokeWidth={1.5} />
  </Svg>;
}

export default function RewardsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [status, setStatus] = useState<PointsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [earned, setEarned] = useState<number | null>(null);
  const [unlocked, setUnlocked] = useState<PointReward | null>(null);
  const [error, setError] = useState("");
  const [rotation] = useState(() => new Animated.Value(0));
  const rotationDegrees = useRef(0);

  useEffect(() => {
    if (!user || user.role !== "CONSUMER") return;
    let active = true;
    const timer = setTimeout(() => { setLoading(true); api<{ status: PointsStatus }>("/users/me/points").then(({ status: value }) => { if (active) { setStatus(value); setError(""); } }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Could not load your points."))
      .finally(() => active && setLoading(false)); }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [user]);

  async function spin() {
    if (!status?.canSpin || spinning) return;
    setSpinning(true); setEarned(null); setUnlocked(null); setError("");
    try {
      const result = await api<SpinResult>("/users/me/points/spin", { method: "POST" });
      const index = result.wheelIndex >= 0 && result.wheelIndex < POINT_VALUES.length ? result.wheelIndex : 0;
      const target = 360 - (index * SLICE + SLICE / 2);
      const next = rotationDegrees.current + 1440 + ((target - (rotationDegrees.current % 360) + 360) % 360);
      rotationDegrees.current = next;
      setStatus(result.status);
      Animated.timing(rotation, { toValue: next, duration: 2600, easing: Easing.bezier(0.12, 0.72, 0.12, 1), useNativeDriver: true }).start(() => {
        setEarned(result.pointsEarned); setUnlocked(result.rewardUnlocked); setSpinning(false);
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The spin could not be completed."); setSpinning(false); }
  }

  const rotate = rotation.interpolate({ inputRange: [0, 10000], outputRange: ["0deg", "10000deg"] });
  const progress = status ? Math.min(100, status.pointsBalance / status.rewardThreshold * 100) : 0;

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.heading}><Text style={styles.eyebrow}>VERIFIED VISIT REWARDS</Text><Text style={styles.title}>Spin. Earn. Save.</Text><Text style={styles.body}>Visit a participating venue and show your offer QR. After the merchant verifies it, one spin unlocks.</Text></View>
    <View style={styles.steps}><Step number="1" text="Visit venue" color={palette.cyan} /><Step number="2" text="Show QR" color="#fb923c" /><Step number="3" text="Get verified" color={palette.gold} /><Step number="4" text="Spin" color={palette.green} /></View>

    <View style={styles.wheelStage}><View style={styles.pointer} /><Animated.View style={[styles.wheel, { transform: [{ rotate }] }]}><WheelFace /></Animated.View>
      <Pressable onPress={() => void spin()} disabled={!status?.canSpin || spinning || loading} style={[styles.spinButton, (!status?.canSpin || loading) && styles.disabled]}><Ionicons name={status?.canSpin ? "sparkles" : "lock-closed"} size={21} color="#5b4310" /><Text style={styles.spinText}>{spinning ? "SPINNING" : status?.canSpin ? "SPIN" : "LOCKED"}</Text></Pressable>
    </View>

    {!user ? <View style={styles.loginCard}><Ionicons name="lock-closed" size={20} color={palette.gold} /><Text style={styles.cardTitle}>Log in to collect points</Text><Text style={styles.cardBody}>Your verified visits, spins, balance, and rewards stay with your customer account.</Text><Pressable onPress={() => router.push("/login/customer" as never)} style={styles.primary}><Text style={styles.primaryText}>Customer login</Text></Pressable></View>
      : loading ? <ActivityIndicator color={palette.gold} /> : <View style={styles.balanceCard}><View style={styles.balanceTop}><View><Text style={styles.label}>CURRENT BALANCE</Text><Text style={styles.balance}>{status?.pointsBalance ?? 0} <Text style={styles.points}>points</Text></Text></View><Text style={styles.toReward}>{status?.pointsToReward ?? 500}{"\n"}to reward</Text></View><View style={styles.progress}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View><Text style={styles.lifetime}>{status?.lifetimePoints ?? 0} lifetime points · {status?.pendingSpins ?? 0} spins ready</Text></View>}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {earned != null && <View style={styles.success}><Ionicons name="trophy" size={22} color={palette.cyan} /><View><Text style={styles.successTitle}>You earned {earned} points!</Text><Text style={styles.cardBody}>Your new balance is {status?.pointsBalance ?? 0} points.</Text></View></View>}
    {unlocked && <RewardCard reward={unlocked} title="New reward unlocked" />}
    {status?.activeRewards.map((reward) => <RewardCard key={reward.id} reward={reward} title="Ready to use" />)}
  </ScrollView></SafeAreaView>;
}

function Step({ number, text, color }: { number: string; text: string; color: string }) { return <View style={[styles.step, { borderColor: `${color}55`, backgroundColor: `${color}14` }]}><Text style={[styles.stepNumber, { color }]}>{number}</Text><Text style={styles.stepText}>{text}</Text></View>; }
function RewardCard({ reward, title }: { reward: PointReward; title: string }) { return <View style={styles.reward}><Text style={styles.label}>{title.toUpperCase()}</Text><Text style={styles.cardTitle}>{reward.discountPct}% off bills up to {reward.maxBillAzn} AZN</Text><Text selectable style={styles.code}>{reward.rewardCode}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.night }, content: { paddingHorizontal: 18, paddingBottom: 35 }, heading: { paddingTop: 24 }, eyebrow: { color: palette.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.9 }, title: { color: palette.white, fontFamily: displayFont, fontWeight: "700", fontSize: 39, marginTop: 6 }, body: { color: palette.muted, fontSize: 13, lineHeight: 20, marginTop: 10 }, steps: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 18 }, step: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 }, stepNumber: { fontSize: 10, fontWeight: "900" }, stepText: { color: "#c5c5d2", fontSize: 9, fontWeight: "800" },
  wheelStage: { width: 312, height: 326, alignSelf: "center", marginTop: 25, alignItems: "center", justifyContent: "flex-end" }, pointer: { position: "absolute", top: 0, zIndex: 10, width: 0, height: 0, borderLeftWidth: 14, borderRightWidth: 14, borderTopWidth: 29, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#f0c84d" }, wheel: { width: WHEEL_SIZE, height: WHEEL_SIZE, borderRadius: WHEEL_CENTER, shadowColor: "#000", shadowOpacity: 0.62, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 18 }, spinButton: { position: "absolute", bottom: 109, width: 82, height: 82, borderRadius: 41, backgroundColor: "transparent", alignItems: "center", justifyContent: "center", zIndex: 12 }, spinText: { color: "#312406", fontSize: 10, fontWeight: "900", marginTop: 2 }, disabled: { opacity: 0.82 },
  loginCard: { borderRadius: 20, borderWidth: 1, borderColor: "rgba(245,158,11,.25)", backgroundColor: "rgba(245,158,11,.08)", padding: 18, alignItems: "flex-start" }, balanceCard: { borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 18 }, balanceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }, label: { color: palette.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 }, balance: { color: palette.gold, fontSize: 31, fontWeight: "900", marginTop: 4 }, points: { fontSize: 15 }, toReward: { color: palette.muted, textAlign: "right", fontSize: 10, lineHeight: 15 }, progress: { height: 9, borderRadius: 5, backgroundColor: "rgba(255,255,255,.09)", overflow: "hidden", marginTop: 15 }, progressFill: { height: "100%", borderRadius: 5, backgroundColor: palette.cyan }, lifetime: { color: palette.muted, fontSize: 9, marginTop: 8 }, cardTitle: { color: palette.white, fontFamily: displayFont, fontWeight: "700", fontSize: 21, marginTop: 8 }, cardBody: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 5 }, primary: { alignSelf: "stretch", height: 44, borderRadius: 14, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center", marginTop: 15 }, primaryText: { color: palette.night, fontWeight: "900", fontSize: 12 }, error: { color: "#fecaca", backgroundColor: "rgba(239,68,68,.1)", borderWidth: 1, borderColor: "rgba(239,68,68,.3)", borderRadius: 14, padding: 12, marginTop: 13, fontSize: 11 }, success: { flexDirection: "row", gap: 11, alignItems: "center", borderRadius: 18, borderWidth: 1, borderColor: "rgba(103,232,249,.25)", backgroundColor: "rgba(103,232,249,.08)", padding: 15, marginTop: 13 }, successTitle: { color: "#cffafe", fontWeight: "900", fontSize: 15 }, reward: { borderRadius: 18, borderWidth: 1, borderColor: "rgba(245,158,11,.28)", backgroundColor: "rgba(245,158,11,.08)", padding: 16, marginTop: 13 }, code: { color: palette.goldSoft, backgroundColor: "rgba(0,0,0,.25)", borderRadius: 11, padding: 12, fontWeight: "900", letterSpacing: 2, marginTop: 12, textAlign: "center" },
});
