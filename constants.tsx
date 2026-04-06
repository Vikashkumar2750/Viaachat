import { Chat, Contact, Call, Group } from './types';

export const MOCK_CONTACTS: Contact[] = [
  { id: '1', name: 'Alice Smith', avatarUrl: 'https://picsum.photos/seed/alice/200' },
  { id: '2', name: 'Bob Johnson', avatarUrl: 'https://picsum.photos/seed/bob/200' },
  { id: '3', name: 'Charlie Brown', avatarUrl: 'https://picsum.photos/seed/charlie/200' },
  { id: '4', name: 'Diana Prince', avatarUrl: 'https://picsum.photos/seed/diana/200' },
];

export const MOCK_CHATS: Chat[] = [
  {
    id: '1',
    name: 'Alice Smith',
    avatarUrl: 'https://picsum.photos/seed/alice/200',
    lastMessage: 'Hey, how are you?',
    lastMessageTime: '10:30 AM',
    unreadCount: 2,
    isPinned: true,
    messageType: 'text',
    participants: ['1', 'you'],
  },
  {
    id: '2',
    name: 'Project Team',
    avatarUrl: 'https://picsum.photos/seed/team/200',
    lastMessage: 'Bob: I finished the report.',
    lastMessageTime: 'Yesterday',
    unreadCount: 0,
    isPinned: false,
    messageType: 'text',
    isGroup: true,
    participants: ['1', '2', '3', 'you'],
  },
];

export const MOCK_CALLS: Call[] = [
  {
    id: '1',
    callerId: '1',
    receiverId: 'you',
    type: 'incoming',
    timestamp: '10:45 AM',
    isVideo: false,
  },
];

export const MOCK_STATUSES = [
  {
    id: '1',
    name: 'My Status',
    avatarUrl: 'https://picsum.photos/seed/you/200',
    time: 'Just now',
    isMine: true,
    viewed: false,
  },
  {
    id: '2',
    name: 'Alice Smith',
    avatarUrl: 'https://picsum.photos/seed/alice/200',
    time: '2:30 PM',
    isMine: false,
    viewed: false,
  },
  {
    id: '3',
    name: 'Bob Johnson',
    avatarUrl: 'https://picsum.photos/seed/bob/200',
    time: '11:15 AM',
    isMine: false,
    viewed: true,
  },
  {
    id: '4',
    name: 'Charlie Brown',
    avatarUrl: 'https://picsum.photos/seed/charlie/200',
    time: 'Yesterday',
    isMine: false,
    viewed: true,
  },
];
