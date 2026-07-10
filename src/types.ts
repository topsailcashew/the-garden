export interface Room {
  id: string;
  boyName: string;
  girlName: string;
  passcode: string;
  createdAt: any; // Firestore Timestamp or ISO string
  boyAvatar?: string; // Emoji avatar chosen by the boy
  girlAvatar?: string; // Emoji avatar chosen by the girl
  lastHug?: { sender: "boy" | "girl"; sentAt: string; nonce: string }; // Most recent virtual hug
}

export interface Note {
  id: string;
  sender: "boy" | "girl";
  content: string;
  createdAt: any;
  read: boolean;
  paperType: "letter" | "sticky" | "parchment" | "rose" | "indigo";
  emoji?: string; // Original wax seal chosen by the sender, set at creation
  reactionEmoji?: string; // Recipient's reaction seal, stacked alongside the original
  imageUrl?: string; // Attached photo, if any
}

export interface Question {
  id: string; // e.g., "q_1", "q_2", etc.
  questionText: string;
  boyAnswer?: string;
  girlAnswer?: string;
  boyAnsweredAt?: any;
  girlAnsweredAt?: any;
  boyAnswerReaction?: string; // Emoji reaction left on the boy's answer (by the girl)
  girlAnswerReaction?: string; // Emoji reaction left on the girl's answer (by the boy)
}

export interface DatePlan {
  id: string;
  title: string;
  description: string;
  date: string; // Format: e.g., "2026-07-14 19:00"
  cost: string; // e.g., "Free", "$20", "$$"
  prepare: string; // What to prepare / bring
  status: "proposed" | "confirmed" | "completed" | "declined";
  proposedBy: "boy" | "girl";
  acceptedBy?: "boy" | "girl" | null;
  createdAt: any;
}

export interface MoodEntry {
  id: string; // `${role}_${YYYY-MM-DD}`
  role: "boy" | "girl";
  date: string; // YYYY-MM-DD
  emoji: string;
  updatedAt: any;
}

export interface UserSession {
  role: "boy" | "girl";
  name: string;
  partnerName: string;
  roomId: string;
}
