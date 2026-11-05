import { TranslationMessage } from '@/types/translation';

export interface SavedSession {
  id: string;
  title: string;
  createdAt: number;
  messages: TranslationMessage[];
}

const STORAGE_KEY = 'langfirst_saved_sessions_v1';

export function getSavedSessions(): SavedSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read saved sessions:', err);
    return [];
  }
}

export function saveSession(messages: TranslationMessage[]): SavedSession | null {
  if (typeof window === 'undefined' || messages.length === 0) return null;

  try {
    const existing = getSavedSessions();
    const firstMsg = messages.find((m) => m.translation) || messages[0];
    const preview = firstMsg.translation.slice(0, 40) || 'Voice Translation Session';

    const newSession: SavedSession = {
      id: `session-${Date.now()}`,
      title: preview.length === 40 ? `${preview}...` : preview,
      createdAt: Date.now(),
      messages,
    };

    const updated = [newSession, ...existing].slice(0, 50); // keep up to 50 sessions
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newSession;
  } catch (err) {
    console.error('Failed to save session:', err);
    return null;
  }
}

export function deleteSession(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getSavedSessions();
    const filtered = existing.filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to delete session:', err);
  }
}

export function searchSessions(query: string): SavedSession[] {
  const sessions = getSavedSessions();
  if (!query.trim()) return sessions;

  const q = query.toLowerCase();
  return sessions.filter((s) => {
    if (s.title.toLowerCase().includes(q)) return true;
    return s.messages.some(
      (m) =>
        m.translation.toLowerCase().includes(q) ||
        m.transcription.toLowerCase().includes(q)
    );
  });
}

