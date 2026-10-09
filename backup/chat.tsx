// Minimal chat screen: model download/loading, health vs companion mode, streaming replies.
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { ask, stopAnswer, ChatMessage, Mode } from '../ai/chat';
import { isModelDownloaded, downloadModel, loadModel, pickModel } from '../ai/modelManager';
import { CRISIS_MESSAGE, CRISIS_RESOURCES } from '../ai/safety';
import { getDb } from '../db';               // your encrypted op-sqlite connection
import { getCycleSummary } from '../cycle';  // your prediction logic

export default function ChatScreen() {
  const [status, setStatus] = useState<'checking' | 'needs-download' | 'downloading' | 'loading' | 'ready'>('checking');
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<Mode>('health');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    (async () => {
      if (!(await isModelDownloaded())) return setStatus('needs-download');
      setStatus('loading');
      await loadModel();
      setStatus('ready');
    })();
  }, []);

  async function startDownload() {
    setStatus('downloading');
    await downloadModel(setProgress);
    setStatus('loading');
    await loadModel();
    setStatus('ready');
  }

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    setInput('');
    setBusy(true);

    const history = messages;
    setMessages([...history, { role: 'user', content: question }, { role: 'assistant', content: '' }]);

    const appendToLast = (t: string) =>
      setMessages(m => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', content: copy[copy.length - 1].content + t };
        return copy;
      });

    try {
      const res = await ask({
        db: getDb(), mode, question, history,
        summary: await getCycleSummary(),
        onToken: appendToLast,
      });
      if (res.type === 'crisis') {
        const lines = CRISIS_RESOURCES.map(r => `• ${r.name} (${r.country}): ${r.contact}`).join('\n');
        appendToLast(`${CRISIS_MESSAGE}\n\n${lines}`);
      }
    } catch (e) {
      appendToLast("Sorry, something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (status !== 'ready') {
    return (
      <View style={styles.center}>
        {status === 'needs-download' ? (
          <>
            <Text style={styles.title}>Set up your private AI</Text>
            <Text style={styles.note}>
              {pickModel().name} downloads once (about 2–3 GB, Wi-Fi recommended). After that, it runs fully offline on your phone.
            </Text>
            <Pressable style={styles.button} onPress={startDownload}>
              <Text style={styles.buttonText}>Download</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator />
            <Text style={styles.note}>
              {status === 'downloading' ? `Downloading… ${Math.round(progress * 100)}%` : 'Loading AI…'}
            </Text>
          </>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.modes}>
        {(['health', 'companion'] as Mode[]).map(m => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.modeBtn, mode === m && styles.modeActive]}>
            <Text style={mode === m ? styles.modeTextActive : undefined}>
              {m === 'health' ? 'Ask a question' : 'Just listen'}
            </Text>
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
            <Text>{item.content || '…'}</Text>
          </View>
        )}
      />

      <Text style={styles.disclaimer}>Not medical advice. Everything stays on your phone.</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={mode === 'health' ? 'Ask about your cycle…' : "What's on your mind?"}
          multiline
        />
        <Pressable style={styles.button} onPress={busy ? stopAnswer : send}>
          <Text style={styles.buttonText}>{busy ? 'Stop' : 'Send'}</Text>
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
  modes: { flexDirection: 'row', gap: 8, padding: 12 },
  modeBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#eee' },
  modeActive: { backgroundColor: '#c2185b' },
  modeTextActive: { color: '#fff' },
  bubble: { padding: 12, borderRadius: 14, marginBottom: 8, maxWidth: '85%' },
  user: { alignSelf: 'flex-end', backgroundColor: '#f8d7e3' },
  bot: { alignSelf: 'flex-start', backgroundColor: '#f1f1f1' },
  disclaimer: { fontSize: 11, color: '#888', textAlign: 'center' },
  inputRow: { flexDirection: 'row', padding: 12, gap: 8, alignItems: 'flex-end' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 10, maxHeight: 120 },
  button: { backgroundColor: '#c2185b', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
