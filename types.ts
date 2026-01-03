
export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  uniqueId?: string; // 4-digit alphanumeric ID
  bio?: string;
  followers?: string[];
  following?: string[];
  walletBalance: number; // User's coin balance for spending
  commissionBalance?: number; // Earnings from calls (separate withdrawal balance)
  isAuthorizedListener?: boolean; // Admin controlled permission to go online
  isBanned?: boolean; // Admin controlled ban status
  createdAt?: number; // Timestamp of account creation
  blockedUsers?: string[]; // List of UIDs blocked by this user
}

export interface Room {
  id: string;
  name: string;
  topic?: string;
  createdBy: string;
  creatorName: string;
  createdAt: number; // timestamp
  participants: Participant[];
  lockedSeats: number[]; // Array of seat indices (0-7) that are locked
  active: boolean; // TRUE if Host/Admin is present
  admins?: string[]; // List of UIDs who are admins
  password?: string; // 4-digit numeric password (if locked)
  backgroundImage?: string; // Custom room theme
  kickedUsers?: Record<string, number>; // { uid: timestampOfKick }
  isPaidCall?: boolean; // If true, deducts coins from guest
}

export interface Participant {
  uid: string;
  displayName: string;
  photoURL: string | null;
  isMuted: boolean;
  isHostMuted?: boolean; // New field for host-enforced mute
  seatIndex: number; // 999 = Host, 0-7 = Grid, -1 = Audience (Listener)
  joinedAt: number;
  lastSeen?: number; // Timestamp for heartbeat/auto-disconnect
  reaction?: {
    url: string;
    expiresAt: number;
  };
}

export interface Sticker {
  id: string;
  url: string;
  name: string;
  createdAt: number;
}

export interface RoomBackground {
  id: string;
  url: string;
  name: string;
  createdAt: number;
}

export interface GiftItem {
  id: string;
  name: string;
  price: number;
  iconUrl: string; // Static image for the grid
  animationUrl?: string; // SVGA/WebP url for full screen animation
  createdAt: number;
}

export interface ChatMetadata {
  id: string; // combined uid1_uid2
  participants: string[]; // [uid1, uid2]
  participantDetails: {
    uid: string;
    displayName: string;
    photoURL: string | null;
  }[];
  lastMessage: string;
  lastMessageTime: number;
  updatedAt: number;
  unreadCounts?: Record<string, number>; // { uid: count }
  typing?: Record<string, boolean>;
}

export interface PrivateMessage {
  id: string;
  text: string; // Encrypted string or Room Name if type is invite
  senderId: string;
  createdAt: number;
  read: boolean;
  type?: 'text' | 'invite';
  roomId?: string; // For invite
  roomPassword?: string; // Encrypted password for invite
}

export interface ActiveListener {
  uid: string;
  displayName: string;
  photoURL: string | null;
  bio: string;
  lastActive: number;
  isBusy: boolean;
}

export interface CallRequest {
  id: string;
  callerId: string;
  callerName: string;
  callerPhoto: string | null;
  listenerId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'timeout';
  createdAt: number;
  roomId?: string; // The room ID generated upon acceptance
}

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  targetId: string;
  targetName: string;
  type: 'user' | 'room';
  reason: string;
  timestamp: number;
  status: 'pending' | 'resolved';
}

export type ViewState = 'rooms' | 'chats' | 'listeners' | 'me';
