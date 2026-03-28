// Re-export all types from the API client for backward compatibility
export type {
  AuthUser,
  Session,
  Player,
  Pun,
  ChatMessage,
  PunComment,
  AppNotification,
} from './api/client';

export interface DailyChallenge {
  topic: string;
  focus: string;
}
