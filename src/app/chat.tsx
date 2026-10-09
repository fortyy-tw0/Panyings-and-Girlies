// Chat screen that uses the team's Python backend (companion pipeline + Ollama on the laptop).
// Put this in src/app/chat.tsx. Keep the on-phone version saved elsewhere for later.
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as api from '../api';

type Msg = { role: 'user' | 'assistant'; text: string; sources?: { title: string }[] };

const MODES: { key: api.ChatMode; label: string }[] = [
  { key: 'learn', label: 'Ask a question' },
  { key: 'listen', label: 'Just listen' },
  { key: 'records', label: 'About my cycle' },
];

export default function ChatScreen() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<api.ChatMode>('learn');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [askConsent, setAskConsent] = useState(false);
  const listRef = useRef<FlatList>(null);

  // Start a chat session when the screen opens; end it when the screen closes.
  useEffect(() => {
    let id: string | null = null;
    api.startChat(mode)
      .then(r => { id = r.session_id; setSessionId(r.session_id); })
      .catch(e => setError(e.message));
    return () => { if (id) api.endChat(id).catch(() => {}); };
  }, []);

  async function send(text = input.trim()) {
    if (!text || !sessionId || busy) return;
    setInput('');
    setBusy(true);
    setMessages(m => [...m, { role: 'user', text }]);
    try {
      const r = await api.sendChat(sessionId, text, mode);
      setMessages(m => [...m, { role: 'assistant', text: r.reply, sources: r.sources }]);
      setAskConsent(r.needs_consent);
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', text: `⚠️ ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function allowRecords() {
    if (!sessionId) return;
    await api.giveRecordsConsent(sessionId);
    setAskConsent(false);
    setMessages(m => [...m, { role: 'assistant', text: 'Thanks. I can now look at your cycle summary for this chat only.' }]);
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Can't reach the backend</Text>
        <Text style={styles.note}>{error}</Text>
        <Text style={styles.note}>Check that the Python backend is running on the laptop, then reopen this screen.</Text>
      </View>
    );
  }
  if (!sessionId) {
    return <View style={styles.center}><ActivityIndicator /><Text style={styles.note}>Connecting…</Text></View>;
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.modes}>
        {MODES.map(m => (
          <Pressable key={m.key} onPress={() => setMode(m.key)} style={[styles.modeBtn, mode === m.key && styles.modeActive]}>
            <Text style={mode === m.key ? styles.modeTextActive : undefined}>{m.label}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        onContentSizeChange={() => listRef.current?.scrollToEnd()}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.user : styles.bot]}>
            <Text>{item.text}</Text>
            {item.sources?.map((s, i) => (
              <Text key={i} style={styles.source}>Source: {s.title}</Text>
            ))}
          </View>
        )}
      />

      {askConsent && (
        <View style={styles.consent}>
          <Text>Can I look at your cycle summary to answer this? Only for this chat.</Text>
          <View style={styles.row}>
            <Pressable style={styles.button} onPress={allowRecords}><Text style={styles.buttonText}>Allow</Text></Pressable>
            <Pressable style={styles.buttonGhost} onPress={() => setAskConsent(false)}><Text>Not now</Text></Pressable>
          </View>
        </View>
      )}

      <Text style={styles.disclaimer}>Not medical advice. Chats are not saved.</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={mode === 'listen' ? "What's on your mind?" : 'Type a message…'}
          multiline
        />
        <Pressable style={styles.button} onPress={() => send()} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  note: { textAlign: 'center', color: '#666' },
modes: { flexDirection: 'row', gap: 8, padding: 12, paddingTop: 50, flexWrap: 'wrap', justifyContent: 'center' },  modeActive: { backgroundColor: '#c2185b' },
  modeTextActive: { color: '#fff' },
  bubble: { padding: 12, borderRadius: 14, marginBottom: 8, maxWidth: '85%' },
  user: { alignSelf: 'flex-end', backgroundColor: '#f8d7e3' },
  bot: { alignSelf: 'flex-start', backgroundColor: '#f1f1f1' },
  source: { fontSize: 11, color: '#888', marginTop: 6 },
  consent: { margin: 12, padding: 12, borderRadius: 12, backgroundColor: '#fff3f7', gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  disclaimer: { fontSize: 11, color: '#888', textAlign: 'center' },
  inputRow: { flexDirection: 'row', padding: 12, gap: 8, alignItems: 'flex-end' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 10, maxHeight: 120 },
  button: { backgroundColor: '#c2185b', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  buttonGhost: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
