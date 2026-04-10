
export interface User {
  id: string;           // Supabase auth UID
  displayName: string;
  photoURL: string;
  email: string;
  lastSeen?: string;
  blockedUserIds?: string[];
  // Kept for backward compat in components
  uid: string;          // alias for id
}

export interface Chat {
  id: string;
  name: string;
  avatarUrl: string;
  lastMessage: string;
  lastMessageTime: any;
  unreadCount: number;
  isPinned: boolean;
  messageType: 'text' | 'video' | 'sticker' | 'gif' | 'image' | 'audio' | 'file';
  status?: 'sent' | 'delivered' | 'read';
  isGroup?: boolean;
  participants: string[];
  memberCount?: number;
  createdBy?: string;
  createdAt?: any;
  messages?: Message[];
  description?: string;
  admins?: string[];
  pinnedMessageIds?: string[];
  isMuted?: boolean;
  isLocked?: boolean;
  typingStatus?: { [userId: string]: boolean };
}

export type Group = Chat;

export interface Contact {
  id: string;
  name: string;
  avatarUrl: string;
  email?: string;
  phone?: string;
}

export interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: any;
  type?: 'text' | 'video' | 'sticker' | 'gif' | 'image' | 'audio' | 'file';
  isPinned?: boolean;
  isRead?: boolean; // true = blue double tick, false/undefined = grey single tick
  reactions?: { [emoji: string]: string[] };
}

export interface Call {
  id: string;
  callerId: string;
  receiverId: string;
  type: 'incoming' | 'outgoing' | 'missed';
  timestamp: any;
  isVideo: boolean;
  contact?: Contact;
  duration?: number;
}

export interface Status {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string;
  contentUrl?: string;
  text?: string;
  backgroundColor?: string;
  timestamp: any;
  viewed?: boolean;
  isMine?: boolean;
  time?: string;
}

export interface FriendRequest {
  id: string;
  fromId: string;
  fromName: string;
  fromAvatarUrl: string;
  toId: string;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: any;
}

export interface Seat {
  id: number;             // seat number 1-10
  userId: string | null;
  displayName: string | null; // was userName
  photoURL: string | null;    // was userAvatar
  isMuted: boolean;
  isClosed?: boolean;
  isLocked?: boolean;
  offeredToId?: string | null;
  isVideoOn?: boolean;
  // Legacy aliases (backward compat)
  userName?: string | null;
  userAvatar?: string | null;
}

export interface Room {
  id: string;
  numericId: number;
  name: string;
  ownerId: string;
  admins: string[];
  seats: Seat[];
  createdAt: any;
  participantCount: number;
  description?: string;
  avatarUrl?: string;
  isLocked: boolean;
  bannedUserIds: string[];
  typingStatus?: { [userId: string]: boolean };
}

export interface RoomParticipant {
  roomId: string;
  userId: string;
  displayName: string;
  photoUrl: string;
  joinedAt: string;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  timestamp: any;
  mentions?: string[];
}

export type Tab = 'Chats' | 'Updates' | 'Communities' | 'Calls' | 'Rooms';
