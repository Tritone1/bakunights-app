import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ComponentProps } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/AuthContext";
import { api, ApiError } from "@/src/api";

export default function MobileLoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ accountType?: string }>();
  const type = params.accountType === "merchant" ? "MERCHANT" : "CONSUMER";
  const label = type === "MERCHANT" ? "Merchant" : "Customer";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();

  async function submit() {
    setBusy(true); setError(""); setUnverified(false);
    try { await login(email.trim(), password, type); router.replace("/(tabs)" as never); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not log in"); setUnverified(reason instanceof ApiError && reason.code === "EMAIL_NOT_VERIFIED"); }
    finally { setBusy(false); }
  }

  async function resend() {
    setBusy(true); setError("");
    try { const result = await api<{ message: string }>("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }); setError(result.message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not resend email"); }
    finally { setBusy(false); }
  }

  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.top}><Pressable onPress={() => router.back()} style={styles.close}><Ionicons name="close" color="#fff" size={22} /></Pressable><View style={styles.logo}><Ionicons name="moon" color="#09090e" size={22} /></View></View><Text style={styles.eyebrow}>{label.toUpperCase()} LOGIN</Text><Text style={styles.title}>Welcome back</Text><Text style={styles.body}>{type === "MERCHANT" ? "Manage your venue and offers." : "Save deals and receive QR codes."}</Text><Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /><View><Text style={styles.label}>PASSWORD</Text><View style={styles.passwordRow}><TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" style={styles.passwordInput} /><Pressable onPress={() => setShowPassword((value) => !value)}><Ionicons name={showPassword ? "eye-off" : "eye"} color="#9999a7" size={20} /></Pressable></View></View>{error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text>{unverified && <Pressable onPress={resend}><Text style={styles.resend}>Resend verification email</Text></Pressable>}</View> : null}<Pressable disabled={busy || !email || password.length < 8} onPress={submit} style={[styles.primary, (busy || !email || password.length < 8) && styles.disabled]}><Text style={styles.primaryText}>{busy ? "Working…" : "Log in"}</Text><Ionicons name="arrow-forward" color="#09090e" size={18} /></Pressable><Pressable onPress={() => router.replace(`/register/${type === "MERCHANT" ? "merchant" : "customer"}` as never)}><Text style={styles.link}>{type === "MERCHANT" ? "New partner? Register your venue" : "New here? Register as a customer"}</Text></Pressable><Pressable onPress={() => router.replace(`/login/${type === "MERCHANT" ? "customer" : "merchant"}` as never)}><Text style={styles.switchLink}>{type === "MERCHANT" ? "Customer login" : "Merchant login"}</Text></Pressable></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) { return <View><Text style={styles.label}>{label.toUpperCase()}</Text><TextInput {...props} style={styles.input} placeholderTextColor="#5f5f6c" /></View>; }

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:"#09090e"},flex:{flex:1},content:{padding:24,paddingBottom:48,gap:16},top:{flexDirection:"row",justifyContent:"space-between",marginBottom:25},close:{width:42,height:42,borderRadius:21,borderWidth:1,borderColor:"rgba(255,255,255,.12)",alignItems:"center",justifyContent:"center"},logo:{width:44,height:44,borderRadius:14,backgroundColor:"#f59e0b",alignItems:"center",justifyContent:"center"},eyebrow:{color:"#67e8f9",fontSize:10,fontWeight:"800",letterSpacing:2},title:{color:"#fff",fontSize:38,fontWeight:"900",letterSpacing:-1},body:{color:"#8f8f9d",fontSize:14,marginBottom:10},label:{color:"#777785",fontSize:10,fontWeight:"800",letterSpacing:1.5,marginBottom:7},input:{height:52,borderRadius:14,borderWidth:1,borderColor:"rgba(255,255,255,.12)",backgroundColor:"#15151e",color:"#fff",paddingHorizontal:15},passwordRow:{height:52,borderRadius:14,borderWidth:1,borderColor:"rgba(255,255,255,.12)",backgroundColor:"#15151e",paddingHorizontal:15,flexDirection:"row",alignItems:"center"},passwordInput:{flex:1,color:"#fff",height:"100%"},error:{borderRadius:14,borderWidth:1,borderColor:"rgba(248,113,113,.35)",backgroundColor:"rgba(239,68,68,.1)",padding:13},errorText:{color:"#fecaca",fontSize:12,lineHeight:18},resend:{color:"#67e8f9",fontSize:12,fontWeight:"800",textDecorationLine:"underline",marginTop:8},primary:{height:52,borderRadius:14,backgroundColor:"#f59e0b",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,marginTop:4},disabled:{opacity:.45},primaryText:{color:"#09090e",fontSize:14,fontWeight:"900"},link:{color:"#67e8f9",textAlign:"center",fontWeight:"800",fontSize:13,textDecorationLine:"underline",marginTop:5},switchLink:{color:"#777785",textAlign:"center",fontWeight:"700",fontSize:12}});
