import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech'; // Ensure this is installed!
import React, { memo, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet, Text,
  TextInput, TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const getSystemPrompt = (lang) => {
  const languageNames = { "en-IN": "English", "hi-IN": "Hindi", "ml-IN": "Malayalam" };
  return `You are Qurio Bot, a friendly AI Education Companion. ALWAYS respond in ${languageNames[lang]}.`;
};

const TypeWriter = memo(({ text, speed = 20 }) => {
  const [displayedText, setDisplayedText] = useState("");
  useEffect(() => {
    let i = 0;
    setDisplayedText(""); 
    const timer = setInterval(() => {
      setDisplayedText((prev) => prev + text.charAt(i));
      i++;
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text]);
  return <Text style={{ color: 'white', lineHeight: 20 }}>{displayedText}</Text>;
});

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
  const [isVisionHealthy, setIsVisionHealthy] = useState(null);
  const [language, setLanguage] = useState("en-IN"); 
  const [isSpeaking, setIsSpeaking] = useState(false); 
  
  const scrollViewRef = useRef();
  const API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY; 

  useEffect(() => {
    loadHistory();
    checkVisionHealthy();
  }, []);

  const checkVisionHealthy = async () => {
    setIsVisionHealthy(null);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
      });
      const data = await response.json();
      setIsVisionHealthy(!!data.choices);
    } catch (err) { setIsVisionHealthy(false); }
  };

  const loadHistory = async () => {
    const saved = await AsyncStorage.getItem("qurio_history");
    if (saved) setMessages(JSON.parse(saved));
  };

  // UPDATED: More robust speak logic
  const speak = async (text) => {
    const speaking = await Speech.isSpeakingAsync();
    if (speaking) {
      await Speech.stop();
    }
    setIsSpeaking(true);
    Speech.speak(text, { 
      language: language, 
      pitch: 1.0, 
      rate: 1.0,
      onDone: () => setIsSpeaking(false),
      onError: (e) => {
        console.log("Speech Error:", e);
        setIsSpeaking(false);
      }
    });
  };

  const stopSpeech = () => {
    Speech.stop();
    setIsSpeaking(false);
  };

  const startNewChat = () => {
    Alert.alert("New Chat", "Clear history?", [
      { text: "Cancel", style: "cancel" },
      { text: "Yes", onPress: () => { 
        setMessages([]); 
        AsyncStorage.removeItem("qurio_history"); 
        stopSpeech();
      }}
    ]);
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.5,
    });
    if (!result.canceled) {
      setImagePreview(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const sendMessage = async () => {
    if ((!input.trim() && !imagePreview) || loading) return;
    const userMsg = { role: "user", content: input, image: imagePreview };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setImagePreview(null);
    setLoading(true);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
        body: JSON.stringify({ 
          model: "llama-3.1-8b-instant", 
          messages: [{ role: "system", content: getSystemPrompt(language) }, ...newMessages.map(m => ({ role: m.role, content: m.content }))],
          temperature: 0.5 
        }),
      });
      const data = await response.json();
      const reply = data.choices[0].message.content;
      const finalMessages = [...newMessages, { role: "assistant", content: reply, isNew: true }];
      setMessages(finalMessages);
      await AsyncStorage.setItem("qurio_history", JSON.stringify(finalMessages));
      speak(reply); // Automatically trigger speech
    } catch (err) { Alert.alert("Error", "Check connection."); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <ByteRobot mood={loading ? "thinking" : isSpeaking ? "listening" : "idle"} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.title}>Qurio Bot</Text>
            <View style={[styles.statusDot, { backgroundColor: isVisionHealthy ? '#4ade80' : isVisionHealthy === false ? '#ef4444' : '#fbbf24' }]} />
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
          {isSpeaking && (
            <TouchableOpacity onPress={stopSpeech} style={[styles.headerBtn, { marginRight: 8, borderColor: '#ef4444', backgroundColor: '#450a0a' }]}>
              <Text style={{ color: '#ef4444', fontSize: 10 }}>STOP 🔇</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={startNewChat} style={styles.headerBtn}>
            <Text style={{ color: 'white', fontSize: 12 }}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView ref={scrollViewRef} onContentSizeChange={() => scrollViewRef.current.scrollToEnd({ animated: true })} style={styles.chatArea}>
        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.botBubble]}>
            {m.image && <Image source={{ uri: m.image }} style={styles.messageImage} />}
            {m.role === 'assistant' && m.isNew ? <TypeWriter text={m.content} /> : <Text style={{ color: 'white' }}>{m.content}</Text>}
            
            {/* Added a small re-play button just in case auto-play fails */}
            {m.role === 'assistant' && (
              <TouchableOpacity onPress={() => speak(m.content)} style={styles.miniPlayBtn}>
                <Text style={{ color: '#a78bfa', fontSize: 10 }}>🔊 Re-play</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {loading && <ActivityIndicator color="#7c3aed" style={{ margin: 10 }} />}
      </ScrollView>

      <View style={styles.inputContainer}>
        {imagePreview && <Image source={{ uri: imagePreview }} style={styles.previewThumb} />}
        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={pickImage}><Text style={{ color: '#a78bfa', fontSize: 24 }}>+</Text></TouchableOpacity>
          <TextInput 
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask Byte..."
            placeholderTextColor="#666"
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}><Text style={{ color: 'white', fontWeight: 'bold' }}>Send</Text></TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050010' },
  header: { padding: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1e1b4b' },
  title: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 10 },
  chatArea: { flex: 1, padding: 15 },
  bubble: { padding: 14, borderRadius: 18, marginBottom: 12, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#007bff', borderBottomRightRadius: 4 },
  botBubble: { alignSelf: 'flex-start', backgroundColor: '#1e1b4b', borderBottomLeftRadius: 4 },
  messageImage: { width: 200, height: 150, borderRadius: 10, marginBottom: 8 },
  inputContainer: { padding: 15, backgroundColor: '#0a051a' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#1a1a2e', color: 'white', padding: 12, borderRadius: 12, marginHorizontal: 10 },
  iconBtn: { width: 45, height: 45, backgroundColor: '#1e1b4b', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sendBtn: { backgroundColor: '#007bff', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  headerBtn: { backgroundColor: '#1e1b4b', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#7c3aed' },
  langBtn: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 5, backgroundColor: '#1e1b4b', borderWidth: 1, borderColor: '#312e81' },
  langBtnActive: { backgroundColor: '#7c3aed', borderColor: '#a78bfa' },
  previewThumb: { width: 50, height: 50, borderRadius: 8, marginBottom: 10 },
  miniPlayBtn: { alignSelf: 'flex-end', marginTop: 5, padding: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 5 }
});