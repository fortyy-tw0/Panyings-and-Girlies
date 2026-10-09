// Demo "Today" screen: shows the cycle prediction and lets the user log a period.
// Uses the Python backend through src/api.ts. Put this file in src/app/today.tsx.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import { Link } from 'expo-router';
import * as api from '../api';

const todayISO = () => new Date().toISOString().slice(0, 10);

function niceDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function TodayScreen() {
  const [prediction, setPrediction] = useState<api.Prediction | null>(null);
  const [periods, setPeriods] = useState<api.Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, list] = await Promise.all([api.getPrediction(), api.listPeriods()]);
      setPrediction(p);
      setPeriods([...list].sort((a, b) => b.start_date.localeCompare(a.start_date)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function logPeriodToday() {
    setMessage(null);
    try {
      await api.addPeriod({ start_date: todayISO(), end_date: null, flow_level: 'medium' });
      setMessage('Period start logged for today.');
      await load();
    } catch (e: any) {
      // e.g. 409 overlap: a period already covers today
      setMessage(e.message);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /><Text style={styles.muted}>Loading…</Text></View>;
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Can't reach the backend</Text>
        <Text style={styles.muted}>{error}</Text>
        <Pressable style={styles.button} onPress={() => { setLoading(true); load(); }}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const p = prediction;
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      <Text style={styles.title}>Today</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Next period</Text>
        {p && p.estimate ? (
          <>
            <Text style={styles.big}>{niceDate(p.estimate)}</Text>
            {p.window && (
              <Text style={styles.muted}>Likely between {niceDate(p.window[0])} and {niceDate(p.window[1])}</Text>
            )}
            {p.confidence && <Text style={styles.muted}>Confidence: {p.confidence}</Text>}
          </>
        ) : (
          <Text style={styles.muted}>Log a few periods to see a prediction.</Text>
        )}
        {p?.status === 'need_more_history' && (
          <Text style={styles.note}>Rough estimate — gets better as you log more periods.</Text>
        )}
        {p?.flags?.includes('high_variability') && (
          <Text style={styles.note}>
            Your recorded cycle lengths have varied a lot. A healthcare professional can help if you're concerned.
          </Text>
        )}
        <Text style={styles.small}>Predictions are estimates, not contraception.</Text>
      </View>

      <Pressable style={styles.button} onPress={logPeriodToday}>
        <Text style={styles.buttonText}>My period started today</Text>
      </Pressable>
      {message && <Text style={styles.muted}>{message}</Text>}

      <Link href="/chat" style={styles.link}>Open AI companion →</Link>

      <Text style={[styles.label, { marginTop: 24 }]}>Recent periods</Text>
      {periods.length === 0 && <Text style={styles.muted}>None logged yet.</Text>}
      {periods.slice(0, 6).map(per => (
        <View key={per.id} style={styles.row}>
          <Text>{niceDate(per.start_date)}</Text>
          <Text style={styles.muted}>{per.end_date ? `to ${niceDate(per.end_date)}` : 'ongoing'}</Text>
        </View>
      ))}

      <Text style={[styles.small, { marginTop: 24 }]}>Your data stays on this device. No cloud.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 12, paddingTop: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  card: { backgroundColor: '#fff3f7', borderRadius: 16, padding: 18, gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#c2185b', textTransform: 'uppercase' },
  big: { fontSize: 34, fontWeight: '700' },
  muted: { color: '#666' },
  note: { color: '#8a4b5f', marginTop: 4 },
  small: { fontSize: 11, color: '#888', marginTop: 6 },
  button: { backgroundColor: '#c2185b', padding: 14, borderRadius: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  link: { color: '#c2185b', fontSize: 16, paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' },
});
