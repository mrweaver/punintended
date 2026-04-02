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

// Groups (Tier 2: social layer)
export const groupsApi = {
  list: () => request<Group[]>("/api/groups"),
  create: (name: string) =>
    request<Group>("/api/groups", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  join: (id: string) =>
    request<Group>(`/api/groups/${id}/join`, { method: "POST" }),
  rename: (id: string, name: string) =>
    request<Group>(`/api/groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/groups/${id}`, { method: "DELETE" }),
  kickPlayer: (id: string, uid: number) =>
    request<{ success: boolean }>(`/api/groups/${id}/players/${uid}`, {
      method: "DELETE",
    }),
  reportTyping: (id: string, status: "typing" | "idle" | "submitted") =>
    request<{ success: boolean }>(`/api/groups/${id}/typing`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
};

// Daily Challenge (Tier 1: global)
export const dailyApi = {
  getChallenge: (localDateId?: string) =>
    request<DailyChallenge>(
      `/api/daily/challenge${localDateId ? `?localDateId=${localDateId}` : ""}`,
    ),
};

// Puns (Tier 1: global, optionally filtered by group)
export const punsApi = {
  list: (challengeId: string, groupId?: string) =>
    request<Pun[]>(
      `/api/daily/puns?challengeId=${challengeId}${groupId ? `&groupId=${groupId}` : ""}`,
    ),
  submit: (text: string, responseTimeMs: number | null) =>
    request<{ id: string }>(`/api/daily/puns`, {
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

// Messages (group-scoped)
export const messagesApi = {
  list: (groupId: string) =>
    request<ChatMessage[]>(`/api/groups/${groupId}/messages`),
  send: (groupId: string, text: string) =>
    request<{ success: boolean }>(`/api/groups/${groupId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  react: (messageId: string, reaction: string | null) =>
    request<{ reaction: string | null }>(
      `/api/messages/${messageId}/reaction`,
      {
        method: "POST",
        body: JSON.stringify({ reaction }),
      },
    ),
};

// Comments (global, no group scope)
export const commentsApi = {
  list: (punId: string) => request<PunComment[]>(`/api/puns/${punId}/comments`),
  add: (punId: string, text: string) =>
    request<{ success: boolean }>(`/api/puns/${punId}/comments`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  react: (commentId: string, reaction: string | null) =>
    request<{ reaction: string | null }>(
      `/api/comments/${commentId}/reaction`,
      {
        method: "POST",
        body: JSON.stringify({ reaction }),
      },
    ),
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
  updateDisplayName: (displayName: string) =>
    request<{ user: AuthUser }>("/api/profile/display-name", {
      method: "PUT",
      body: JSON.stringify({ displayName }),
    }),
  updatePrivacy: (anonymous: boolean) =>
    request<{ user: AuthUser }>("/api/profile/privacy", {
      method: "PUT",
      body: JSON.stringify({ anonymous }),
    }),
};

// Leaderboards
export const leaderboardApi = {
  weekly: (groupId: string, weekStart: string, weekEnd: string) =>
    request<WeeklyScore[]>(
      `/api/groups/${groupId}/weekly-scores?weekStart=${weekStart}&weekEnd=${weekEnd}`,
    ),
  daily: (date?: string) =>
    request<DailyLeaderboard>(
      `/api/leaderboard/daily${date ? `?date=${date}` : ""}`,
    ),
  allTime: () => request<LeaderboardEntry[]>("/api/leaderboard/alltime"),
  gauntlet: () => request<GauntletHistoryEntry[]>("/api/leaderboard/gauntlet"),
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

export interface GauntletComparisonRun {
  id: string;
  playerId: number;
  playerName: string;
  playerPhoto: string;
  rounds: GauntletRunRound[];
  totalScore: number | null;
  createdAt: string;
}

export interface GauntletComparison {
  id: string;
  createdBy: number;
  rounds: GauntletRoundPrompt[];
  createdAt: string;
  runs: GauntletComparisonRun[];
}

export interface GauntletHistoryParticipant {
  playerId: number;
  playerName: string;
  playerPhoto: string;
  totalScore: number | null;
}

export interface GauntletHistoryEntry {
  gauntletId: string;
  myRunId: string;
  myScore: number | null;
  createdAt: string;
  participants: GauntletHistoryParticipant[];
}

export interface GauntletComment {
  id: string;
  gauntletId: string;
  runId: string;
  roundIndex: number;
  authorId: number;
  authorName: string;
  authorPhoto: string;
  text: string;
  createdAt: string;
}

export interface GauntletMessage {
  id: string;
  gauntletId: string;
  userId: number;
  userName: string;
  userPhoto: string;
  text: string;
  createdAt: string;
  reactions?: Record<string, number>;
  myReaction?: string | null;
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
  history: () => request<GauntletHistoryEntry[]>("/api/gauntlet/history"),
  comparison: (gauntletId: string) =>
    request<GauntletComparison>(`/api/gauntlet/${gauntletId}/comparison`),
  getComments: (gauntletId: string) =>
    request<GauntletComment[]>(`/api/gauntlet/${gauntletId}/comments`),
  addComment: (
    gauntletId: string,
    runId: string,
    roundIndex: number,
    text: string,
  ) =>
    request<GauntletComment>(`/api/gauntlet/${gauntletId}/comments`, {
      method: "POST",
      body: JSON.stringify({ runId, roundIndex, text }),
    }),
  getMessages: (gauntletId: string) =>
    request<GauntletMessage[]>(`/api/gauntlet/${gauntletId}/messages`),
  sendMessage: (gauntletId: string, text: string) =>
    request<GauntletMessage>(`/api/gauntlet/${gauntletId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  reactToMessage: (messageId: string, reaction: string | null) =>
    request<{ reaction: string | null }>(
      `/api/gauntlet/messages/${messageId}/reaction`,
      {
        method: "POST",
        body: JSON.stringify({ reaction }),
      },
    ),
};

// Types used by the API client
export interface AuthUser {
  uid: number;
  displayName: string;
  customDisplayName: string | null;
  googleDisplayName: string | null;
  photoURL: string;
  email: string;
  anonymousInLeaderboards: boolean;
}

export interface Group {
  id: string;
  name: string;
  ownerId: number;
  players: Player[];
  createdAt: string;
  updatedAt: string;
}

export interface DailyChallenge {
  challengeId: string;
  topic: string;
  focus: string;
}

/** @deprecated Use Group instead */
export type Session = Group;

export interface Player {
  uid: number;
  name: string;
  photoURL: string;
}

export interface Groaner {
  uid: number;
  name: string;
}

export interface Pun {
  id: string;
  challengeId: string;
  authorId: number;
  authorName: string;
  authorPhoto: string;
  text: string;
  aiScore: number | null;
  aiFeedback: string | null;
  responseTimeMs: number | null;
  groanCount: number;
  groaners?: Groaner[];
  myReaction: "groan" | null;
  viewed?: boolean;
  challengeTopic?: string | null;
  challengeFocus?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PunReaction = "groan";

export interface WeeklyScore {
  authorId: number;
  authorName: string;
  authorPhoto: string;
  dailyScores: Record<string, number>;
  weekTotal: number;
}

export interface LeaderboardEntry {
  id: string;
  text: string;
  aiScore: number;
  challengeId: string | null;
  challengeTopic: string | null;
  challengeFocus: string | null;
  authorName: string;
  authorPhoto: string;
  groanCount: number;
  groaners?: Groaner[];
  createdAt: string;
}

export interface DailyLeaderboard {
  date: string;
  puns: LeaderboardEntry[];
}

export interface ChatMessage {
  id: string;
  groupId: string;
  userId: number;
  userName: string;
  userPhoto: string;
  text: string;
  createdAt: string;
  reactions?: Record<string, number>;
  myReaction?: string | null;
}

export interface PunComment {
  id: string;
  punId: string;
  userId: number;
  userName: string;
  userPhoto: string;
  text: string;
  createdAt: string;
  reactions?: Record<string, number>;
  myReaction?: string | null;
}

export interface TypingPlayer {
  uid: number;
  name: string;
  photoURL: string;
  status: "typing" | "submitted";
  updatedAt: number;
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
