// Connects the app (frontend) to the team's Python FastAPI backend on the laptop.
// Endpoints follow "Pu-shy: Backend Plan v2.1", Section 4. Rename anything that
// differs from what the backend team actually built.

import { Platform } from 'react-native';

// ---------- Where the backend is ----------
// Web browser and iPhone Simulator: the backend on this same computer (127.0.0.1).
// Android emulator: 10.0.2.2 means "the laptop this emulator runs on".
// Real phone on the same Wi-Fi: replace with the computer's IP, e.g. 'http://192.168.1.20:8000'
export const API_BASE =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';

// Must match the token the backend expects (see the notes for the backend team).
export const API_TOKEN = 'dev-token-change-me';

// ---------- Low-level helper ----------
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'unreachable', 'Cannot reach the backend. Is it running on the laptop?');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Backend error format: {"error": {"code": "...", "message": "..."}}
    const err = (data as any)?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `HTTP ${res.status}`);
  }
  return data as T;
}

// ---------- Types (match the backend's JSON) ----------
export type Period = { id: number; start_date: string; end_date: string | null; flow_level?: string };
export type Prediction = {
  status: 'ok' | 'need_more_history';
  estimate?: string;
  window?: [string, string];
  confidence?: 'high' | 'medium' | 'low' | 'rough';
  expected_duration?: number;
  flags: string[];
};
export type ChatMode = 'listen' | 'records' | 'learn';
export type ChatReply = {
  reply: string;
  intent: ChatMode;
  sources: { title: string; source?: string }[];
  needs_consent: boolean;
};

// ---------- System ----------
export const health = () => request<{ model_loaded: boolean; offline: boolean }>('GET', '/health');

// ---------- Records ----------
export const listPeriods = () => request<Period[]>('GET', '/periods');
export const addPeriod = (p: { start_date: string; end_date?: string | null; flow_level?: string }) =>
  request<Period>('POST', '/periods', p);
export const updatePeriod = (id: number, p: Partial<Period>) => request<Period>('PUT', `/periods/${id}`, p);
export const deletePeriod = (id: number) => request<void>('DELETE', `/periods/${id}`);

export const getLogs = (date: string) => request<any[]>('GET', `/logs?date=${encodeURIComponent(date)}`);
export const saveLog = (date: string, log: { category: string; value: string; note?: string }) =>
  request<any>('POST', `/logs?date=${encodeURIComponent(date)}`, log);

export const listNotes = () => request<any[]>('GET', '/notes');
export const addNote = (n: { date: string; text: string }) => request<any>('POST', '/notes', n);
export const deleteNote = (id: number) => request<void>('DELETE', `/notes/${id}`);

// ---------- Predictions & insights ----------
export const getPrediction = () => request<Prediction>('GET', '/predictions/next');
export const explainPrediction = () => request<any>('GET', '/predictions/explain');
export const getInsights = () => request<any>('GET', '/insights');

// ---------- Companion chat (sessions live in the backend's RAM) ----------
export const startChat = (mode?: ChatMode) =>
  request<{ session_id: string }>('POST', '/chat/sessions', { mode });
export const sendChat = (sessionId: string, text: string, mode?: ChatMode) =>
  request<ChatReply>('POST', `/chat/sessions/${sessionId}/messages`, { text, mode });
export const getChatMessages = (sessionId: string) =>
  request<{ role: 'user' | 'assistant'; text: string; sources?: any[] }[]>(
    'GET', `/chat/sessions/${sessionId}/messages`);
export const giveRecordsConsent = (sessionId: string) =>
  request<{ records_consent: boolean }>('POST', `/chat/sessions/${sessionId}/consent`);
export const endChat = (sessionId: string) => request<void>('DELETE', `/chat/sessions/${sessionId}`);

// ---------- Reminders ----------
export const getDueReminders = () => request<{ event_id: number; type: string; text: string }[]>('GET', '/reminders/due');
export const respondReminder = (eventId: number, status: 'taken' | 'skipped') =>
  request<any>('POST', `/reminders/events/${eventId}/respond`, { status });

// ---------- Privacy ----------
export const getStorage = () => request<any>('GET', '/storage');
export const exportData = () => request<any>('GET', '/export');
export const deleteAllData = () => request<void>('DELETE', '/all');
