const BASE = "";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (res.status === 401) {
    window.location.href = "/auth/google";
    throw new Error("Not authenticated");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }

  return res.json();
}

// Auth
export const authApi = {
  getUser: () => request<{ user: AuthUser | null }>("/auth/user"),
  logout: () =>
    request<{ success: boolean }>("/auth/logout", { method: "POST" }),
};

// Sessions
export const sessionsApi = {
  list: () => request<Session[]>("/api/sessions"),
  create: (name: string) =>
    request<Session>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  join: (id: string) =>
    request<Session>(`/api/sessions/${id}/join`, { method: "POST" }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/sessions/${id}`, { method: "DELETE" }),
  refreshChallenge: (id: string, localDateId: string, force = false) =>
    request<Session>(`/api/sessions/${id}/refresh-challenge`, {
      method: "POST",
      body: JSON.stringify({ localDateId, force }),
    }),
  history: (id: string) =>
    request<ChallengeHistoryEntry[]>(`/api/sessions/${id}/history`),
};

// Puns
export const punsApi = {
  list: (sessionId: string, challengeId: string) =>
    request<Pun[]>(
      `/api/sessions/${sessionId}/puns?challengeId=${challengeId}`,
    ),
  submit: (sessionId: string, text: string, responseTimeMs: number | null) =>
    request<{ id: string }>(`/api/sessions/${sessionId}/puns`, {
      method: "POST",
      body: JSON.stringify({ text, responseTimeMs }),
    }),
  edit: (id: string, text: string) =>
    request<{ success: boolean }>(`/api/puns/${id}`, {
      method: "PUT",
      body: JSON.stringify({ text }),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/puns/${id}`, { method: "DELETE" }),
  react: (id: string, reaction: PunReaction | null) =>
    request<{ reaction: PunReaction | null }>(`/api/puns/${id}/reaction`, {
      method: "POST",
      body: JSON.stringify({ reaction }),
    }),
};

// Messages
export const messagesApi = {
  list: (sessionId: string) =>
    request<ChatMessage[]>(`/api/sessions/${sessionId}/messages`),
  send: (sessionId: string, text: string) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
};

// Comments
export const commentsApi = {
  list: (punId: string) => request<PunComment[]>(`/api/puns/${punId}/comments`),
  add: (punId: string, sessionId: string, text: string) =>
    request<{ success: boolean }>(`/api/puns/${punId}/comments`, {
      method: "POST",
      body: JSON.stringify({ text, sessionId }),
    }),
};

// Notifications
export const notificationsApi = {
  list: () => request<AppNotification[]>("/api/notifications"),
  markRead: (id: string) =>
    request<{ success: boolean }>(`/api/notifications/${id}/read`, {
      method: "PUT",
    }),
};

// Profile
export const profileApi = {
  getPuns: () => request<Pun[]>("/api/profile/puns"),
};

// Gauntlet
export interface GauntletRoundPrompt {
  topic: string;
  focus: string;
}

export interface GauntletRunRound {
  pun_text: string;
  ai_score: number | null;
  ai_feedback: string | null;
  seconds_remaining: number;
  round_score: number | null;
}

export interface GauntletRun {
  id: string;
  gauntletId: string;
  playerId: number;
  rounds: GauntletRunRound[];
  status: "in_progress" | "scoring" | "complete";
  totalScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface GauntletStartResponse {
  gauntletId: string;
  runId: string;
  rounds: GauntletRoundPrompt[];
}

export const gauntletApi = {
  generate: () =>
    request<GauntletStartResponse>("/api/gauntlet/generate", {
      method: "POST",
    }),
  start: (gauntletId: string) =>
    request<GauntletStartResponse>(`/api/gauntlet/${gauntletId}`),
  submitRound: (
    gauntletId: string,
    runId: string,
    roundIndex: number,
    punText: string,
    secondsRemaining: number,
  ) =>
    request<{ success: boolean }>(`/api/gauntlet/${gauntletId}/submit-round`, {
      method: "POST",
      body: JSON.stringify({ runId, roundIndex, punText, secondsRemaining }),
    }),
  getRun: (gauntletId: string, runId: string) =>
    request<GauntletRun>(`/api/gauntlet/${gauntletId}/run/${runId}`),
};

// Types used by the API client
export interface AuthUser {
  uid: number;
  displayName: string;
  photoURL: string;
  email: string;
}

export interface Session {
  id: string;
  name: string;
  ownerId: number;
  players: Player[];
  challenge: { topic: string; focus: string } | null;
  challengeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Player {
  uid: number;
  name: string;
  photoURL: string;
}

export interface Pun {
  id: string;
  sessionId: string;
  challengeId: string;
  authorId: number;
  authorName: string;
  authorPhoto: string;
  text: string;
  aiScore: number | null;
  aiFeedback: string | null;
  reactions: Record<PunReaction, number>;
  reactionTotal: number;
  myReaction: PunReaction | null;
  responseTimeMs: number | null;
  viewed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PunReaction = "clever" | "laugh" | "groan" | "fire" | "wild";

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: number;
  userName: string;
  userPhoto: string;
  text: string;
  createdAt: string;
}

export interface PunComment {
  id: string;
  punId: string;
  sessionId: string;
  userId: number;
  userName: string;
  userPhoto: string;
  text: string;
  createdAt: string;
}

export interface ChallengeHistoryEntry {
  challengeId: string;
  topic: string;
  focus: string;
  punCount: number;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: number;
  type: "reaction" | "vote" | "system";
  message: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}
