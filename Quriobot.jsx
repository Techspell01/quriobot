import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  ScrollView,
  StyleSheet, Text,
  TextInput, TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

// --- Configuration ---
const getSystemPrompt = (lang) => {
  const languageNames = { "en-IN": "English", "hi-IN": "Hindi", "ml-IN": "Malayalam" };
  return `You are Qurio Bot, a friendly AI Education Companion. ALWAYS respond in ${languageNames[lang]}. Be concise and avoid symbols like **.`;
};

// --- Byte Mascot Component ---
const ByteRobot = ({ mood }) => {
  const [isBlinking, setIsBlinking] = useState(false);
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    }, 4000); 
    return () => clearInterval(blinkInterval);
  }, []);
  const eyeColor = mood === "thinking" ? "#fbbf24" : "#4ade80";
  return (
    <Svg width="40" height="50" viewBox="0 0 54 76">
      <Rect x="7" y="12" width="40" height="28" rx="9" fill="#1a0a3e" stroke="#7c3aed" strokeWidth="1.5"/>
      {isBlinking ? (
        <><Path d="M12 24 L18 24" stroke={eyeColor} strokeWidth="2"/><Path d="M36 24 L42 24" stroke={eyeColor} strokeWidth="2"/></>
      ) : (
        <><Circle cx="15" cy="24" r="4" fill={eyeColor}/><Circle cx="39" cy="24" r="4" fill={eyeColor}/></>
      )}
      <Path d="M19 33 Q27 39 35 33" stroke={eyeColor} strokeWidth="2" fill="none"/>
      <Rect x="9" y="45" width="36" height="24" rx="8" fill="#0f0527" stroke="#6d28d9" strokeWidth="1.5"/>
    </Svg>
  );
};

export default function Quriobot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [language, setLanguage] = useState("en-IN"); 
  const [isSpeaking, setIsSpeaking] = useState(false); 
  const [isHealthy, setIsHealthy] = useState(null);
  const [showGreeting, setShowGreeting] = useState(true); 
  
  const scrollViewRef = useRef();
  const abortControllerRef = useRef(null); 
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY; 

  useEffect(() => { 
    loadHistory(); 
    checkHealth();
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 1000, useNativeDriver: true }).start(() => setShowGreeting(false));
    }, 3000); 
    return () => clearTimeout(timer);
  }, []);

  const checkHealth = async () => {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
      });
      setIsHealthy(res.ok);
    } catch { setIsHealthy(false); }
  };

  const loadHistory = async () => {
    const saved = await AsyncStorage.getItem("qurio_history");
    if (saved) setMessages(JSON.parse(saved));
  };

  const stopEverything = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null; // Reset the controller so the NEXT message can work
    }
    Speech.stop();
    setIsSpeaking(false);
    setLoading(false);
  };

  const speak = (text) => {
    const cleanText = text.replace(/\*/g, '');
    Speech.stop();
    setIsSpeaking(true);
    Speech.speak(cleanText, { language: language, onDone: () => setIsSpeaking(false) });
  };

  const sendMessage = async () => {
    if ((!input.trim() && !imagePreview) || loading) return;
    
    // 1. Clear any active session before starting
    stopEverything(); 
    abortControllerRef.current = new AbortController();

    const userMsg = { role: "user", content: input, image: imagePreview };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setImagePreview(null);
    setLoading(true);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: abortControllerRef.current.signal,
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": `Bearer ${API_KEY}` 
        },
        body: JSON.stringify({ 
          model: "llama-3.1-8b-instant", 
          messages: [
            { role: "system", content: getSystemPrompt(language) }, 
            ...newMessages.map(m => ({ role: m.role, content: m.content }))
          ],
        }),
      });

      if (!response.ok) throw new Error("API Limit or Key Issue");

      const data = await response.json();
      const reply = data.choices[0].message.content;
      const finalMessages = [...newMessages, { role: "assistant", content: reply }];
      
      setMessages(finalMessages);
      await AsyncStorage.setItem("qurio_history", JSON.stringify(finalMessages));
      speak(reply);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log("Stopped by user");
      } else {
        Alert.alert("Connection Error", "Byte couldn't reach the brain. Check your internet or API key.");
      }
    } finally { 
      setLoading(false); 
      abortControllerRef.current = null; // Clear controller after finishing
    }
  };

  const exportPDF = async () => {
    const html = `<html><body style="background:#050010;color:white;padding:20px;"><h1>Qurio Bot Notes</h1>${messages.map(m => `<div style="margin-bottom:15px;"><b>${m.role.toUpperCase()}:</b><br/>${m.content}</div>`).join('')}</body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <ByteRobot mood={loading ? "thinking" : "idle"} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.title}>Qurio Bot</Text>
            <View style={[styles.statusDot, { backgroundColor: isHealthy === null ? '#fbbf24' : isHealthy ? '#4ade80' : '#ef4444' }]} />
          </View>
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            {['en-IN', 'hi-IN', 'ml-IN'].map((l) => (
              <TouchableOpacity key={l} onPress={() => setLanguage(l)} style={[styles.langBtn, language === l && styles.langBtnActive]}>
                <Text style={{ color: 'white', fontSize: 10 }}>{l.split('-')[0].toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={exportPDF} style={[styles.headerBtn, { marginRight: 8 }]}><Text style={{ color: '#a78bfa', fontSize: 10 }}>📄 PDF</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => { stopEverything(); setMessages([]); AsyncStorage.removeItem("qurio_history"); }} style={styles.headerBtn}><Text style={{ color: 'white', fontSize: 10 }}>+ New</Text></TouchableOpacity>
        </View>
      </View>

      <ScrollView ref={scrollViewRef} onContentSizeChange={() => scrollViewRef.current.scrollToEnd({ animated: true })} style={styles.chatArea}>
        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.botBubble]}>
            <Text style={{ color: 'white' }}>{m.content}</Text>
          </View>
        ))}
        {loading && <ActivityIndicator color="#7c3aed" style={{ margin: 10 }} />}
      </ScrollView>

      {showGreeting && (
        <Animated.View style={[styles.floatingBot, { opacity: fadeAnim }]}>
           <ByteRobot mood="idle" />
           <View style={styles.greetingBubble}><Text style={{ color: 'white' }}>Hi! 👋</Text></View>
        </Animated.View>
      )}

      <View style={styles.inputContainer}>
        {imagePreview && <Image source={{ uri: imagePreview }} style={styles.previewThumb} />}
        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={async () => {
            let res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5 });
            if (!res.canceled) setImagePreview(`data:image/jpeg;base64,${res.assets[0].base64}`);
          }}><Text style={{ color: '#a78bfa', fontSize: 24 }}>+</Text></TouchableOpacity>
          <TextInput 
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask Byte..."
            placeholderTextColor="#666"
            editable={!loading} // Prevents double-sending
          />
          <TouchableOpacity 
            style={loading || isSpeaking ? styles.stopSendBtn : styles.sendBtn} 
            onPress={loading || isSpeaking ? stopEverything : sendMessage}
          >
            <Text style={{ color: 'white', fontWeight: 'bold' }}>{loading || isSpeaking ? "Stop" : "Send"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050010' },
  header: { padding: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1e1b4b' },
  title: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  chatArea: { flex: 1, padding: 15 },
  bubble: { padding: 14, borderRadius: 18, marginBottom: 12, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#007bff', borderBottomRightRadius: 4 },
  botBubble: { alignSelf: 'flex-start', backgroundColor: '#1e1b4b', borderBottomLeftRadius: 4 },
  inputContainer: { padding: 15, backgroundColor: '#0a051a' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#1a1a2e', color: 'white', padding: 12, borderRadius: 12, marginLeft: 10, marginRight: 10 },
  iconBtn: { width: 45, height: 45, backgroundColor: '#1e1b4b', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sendBtn: { backgroundColor: '#007bff', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  stopSendBtn: { backgroundColor: '#ef4444', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  headerBtn: { padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#7c3aed' },
  langBtn: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 5, backgroundColor: '#1e1b4b' },
  langBtnActive: { backgroundColor: '#7c3aed' },
  previewThumb: { width: 50, height: 50, borderRadius: 8, marginBottom: 10 },
  floatingBot: { position: 'absolute', top: '40%', left: '40%', alignItems: 'center' },
  greetingBubble: { backgroundColor: '#7c3aed', padding: 10, borderRadius: 15, marginTop: 5 }
});