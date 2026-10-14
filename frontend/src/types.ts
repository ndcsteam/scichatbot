import type { Timestamp } from "firebase/firestore";

export type Role = "pending" | "admin" | "teacher" | "student";

export type UserProfile = {
  email: string;
  displayName: string;
  photoURL: string;
  role: Role;
  disabled: boolean;
  createdAt?: Timestamp;
};

export type Chatbot = {
  ownerId: string;
  ownerEmail: string;
  name: string;
  model: string;
  systemPrompt: string;
  welcomeMessage: string;
  ragEnabled: boolean;
  disabled: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type BotDocument = {
  fileName: string;
  storagePath: string;
  status: "processing" | "ready" | "error";
  errorMessage?: string;
  chunkCount?: number;
  createdAt?: Timestamp;
};

export type Member = {
  studentUid: string;
  email: string;
  invitedAt?: Timestamp;
};

export type ConversationMeta = {
  studentUid: string;
  email: string;
  lastMessage?: string;
  updatedAt?: Timestamp;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  seq: number;
  createdAt?: Timestamp;
};
