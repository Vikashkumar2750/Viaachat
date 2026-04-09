
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { SearchBar } from './components/SearchBar';
import { FilterPills } from './components/FilterPills';
import { ChatList } from './components/ChatList';
import { BottomNav } from './components/BottomNav';
import { Fab } from './components/Fab';
import { UpdatesScreen } from './components/UpdatesScreen';
import { GroupsScreen } from './components/GroupsScreen';
import { CallsScreen } from './components/CallsScreen';
import { ProfileDashboard } from './components/ProfileDashboard';
import { CreateGroupModal } from './components/CreateGroupModal';
import { GroupDetailScreen } from './components/GroupDetailScreen';
import { CreateContactModal } from './components/CreateContactModal';
import { ChatDetailScreen } from './components/ChatDetailScreen';
import { DeleteConfirmationModal } from './components/DeleteConfirmationModal';
import { CallScreen } from './components/CallScreen';
import { IncomingCallModal } from './components/IncomingCallModal';
import { RoomsScreen } from './components/RoomsScreen';
import { RoomDetailScreen } from './components/RoomDetailScreen';
import { Login } from './components/Login';
import { PostCallModal } from './components/PostCallModal';
import { AdBanner } from './components/AdBanner';
import { PhoneCall, UserPlus } from 'lucide-react';
import type { Tab, Group, Contact, Message, Chat, Call, User, FriendRequest, Room } from './types';
import {
  supabase,
  syncUser,
  updateUserPresence,
  markChatAsRead,
  handleSupabaseError,
  isSupabaseConfigured,
} from './supabase';

const dbToUser = (row: any): User => ({
  id: row.id,
  uid: row.id,
  displayName: row.display_name,
  photoURL: row.photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.id}`,
  email: row.email || '',
  lastSeen: row.last_seen,
  blockedUserIds: row.blocked_user_ids || [],
});

const dbToChat = (row: any): Chat => ({
  id: row.id,
  name: row.name || '',
  avatarUrl: row.avatar_url || '',
  lastMessage: row.last_message || '',
  lastMessageTime: row.last_message_time,
  unreadCount: row.unread_count || 0,
  isPinned: row.is_pinned || false,
  messageType: row.message_type || 'text',
  isGroup: row.is_group || false,
  participants: row.participants || [],
  memberCount: row.member_count,
  createdBy: row.created_by,
  createdAt: row.created_at,
  description: row.description,
  admins: row.admins || [],
  pinnedMessageIds: row.pinned_message_ids || [],
  isMuted: row.is_muted || false,
  typingStatus: row.typing_status || {},
});

const dbToCall = (row: any): Call => ({
  id: row.id,
  callerId: row.caller_id,
  receiverId: row.receiver_id,
  type: row.type,
  timestamp: row.timestamp,
  isVideo: row.is_video,
  duration: row.duration,
});

const dbToFriendRequest = (row: any): FriendRequest => ({
  id: row.id,
  fromId: row.from_id,
  fromName: row.from_name,
  fromAvatarUrl: row.from_avatar_url,
  toId: row.to_id,
  status: row.status,
  timestamp: row.timestamp,
});

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('Chats');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateContactOpen, setIsCreateContactOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [communities, setCommunities] = useState<any[]>([]);
  const [activeCall, setActiveCall] = useState<{ contact: Contact; isVideo: boolean; callId: string; isCaller: boolean } | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [lastCalledUser, setLastCalledUser] = useState<Contact | null>(null);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isSearchingRandomCall, setIsSearchingRandomCall] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showPostCallModal, setShowPostCallModal] = useState(false);
  const queueChannelRef = useRef<any>(null); // holds active matchmaking subscription
  const lastRandomPartnerRef = useRef<{ contact: import('./types').Contact; callId: string } | null>(null);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // ─── Auth: listen to Supabase auth changes ─────────────────────────────────
  useEffect(() => {
    // Hard timeout safety net: never stay loading > 8s
    const loadingTimeout = setTimeout(() => setLoading(false), 8000);

    // ── Helper: build user object directly from JWT claims (zero network calls) ──
    // This is the FAST PATH — user sees the app instantly.
    // The profile is then enriched from the DB in the background.
    const userFromSession = (u: any) => ({
      id: u.id,
      displayName:
        u.user_metadata?.full_name ||
        u.user_metadata?.name ||
        u.email?.split('@')[0] ||
        (u.is_anonymous ? `Guest_${u.id.slice(0, 6)}` : `User_${u.id.slice(0, 6)}`),
      photoURL:
        u.user_metadata?.avatar_url ||
        u.user_metadata?.picture ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`,
      email: u.email || '',
      lastSeen: new Date().toISOString(),
      blockedUserIds: [],
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Clear loading IMMEDIATELY — don't await anything
      clearTimeout(loadingTimeout);
      setLoading(false);

      if (!session?.user) {
        setUser(null);
        return;
      }

      const u = session.user;

      // ── INSTANT: set user from JWT claims right now ───────────────────────
      setUser(userFromSession(u));

      // ── BACKGROUND: sync to DB + enrich profile (non-blocking) ───────────
      // Do NOT await this — runs after the UI has already rendered
      const syncAndEnrich = async () => {
        try {
          // Write to DB on sign-in/update events
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            await syncUser(u); // fire-and-forget safe — errors are caught below
          }

          // Fetch enriched profile (display_name, photo from DB, blocked list, etc.)
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', u.id)
            .single();

          if (profile) {
            // Update user with richer DB data
            setUser(dbToUser(profile));
          } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            // Profile row didn't exist yet (first login race) — it was just created above
            // Retry once after a short delay
            await new Promise(r => setTimeout(r, 800));
            const { data: retryProfile } = await supabase
              .from('users')
              .select('*')
              .eq('id', u.id)
              .single();
            if (retryProfile) setUser(dbToUser(retryProfile));
          }
        } catch (err: any) {
          // DB errors don't affect login — user is already set from JWT claims
          if (!err?.message?.includes('Lock')) {
            console.warn('Background sync error (non-critical):', err?.message);
          }
        }
      };

      syncAndEnrich(); // intentionally not awaited
    });

    return () => {
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);


  // ─── Presence: update lastSeen immediately + every 60 seconds ───────────────
  useEffect(() => {
    if (!user?.id) return;
    updateUserPresence(user.id); // immediate on login
    const interval = setInterval(() => updateUserPresence(user.id), 60000);
    // Also update on tab focus
    const onFocus = () => updateUserPresence(user.id);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id]);

  // ─── Live user profile (blocked users, etc.) ───────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`user-profile-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${user.id}`,
      }, (payload) => {
        const updated = payload.new as any;
        setUser(prev => prev ? {
          ...prev,
          blockedUserIds: updated.blocked_user_ids || [],
          displayName: updated.display_name,
          photoURL: updated.photo_url,
        } : null);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ─── Chats: real-time subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    const fetchChats = async () => {
      const { data, error } = await supabase
        .from('chats')
        .select('*')
        .contains('participants', [user.id])
        .order('last_message_time', { ascending: false });

      if (error) { handleSupabaseError(error, 'chats/fetch'); return; }
      setChats((data || []).map(dbToChat));
    };

    fetchChats();

    const channel = supabase
      .channel(`chats-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chats',
      }, () => fetchChats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ─── Calls: real-time ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    const fetchCalls = async () => {
      const { data } = await supabase
        .from('calls')
        .select('*')
        .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('timestamp', { ascending: false })
        .limit(50);

      setCalls((data || []).map(dbToCall));
    };

    fetchCalls();

    // Detect incoming calls
    const channel = supabase
      .channel(`calls-incoming-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'calls',
        filter: `receiver_id=eq.${user.id}`,
      }, async (payload) => {
        const row = payload.new as any;
        const now = Date.now();
        const callTime = new Date(row.timestamp).getTime();
        // Only show if call is within 45 seconds (generous window for slow networks)
        if (now - callTime < 45000) {
          if (user.blockedUserIds?.includes(row.caller_id)) return;
          // Try contacts first, then fetch from DB for fresh info
          let callerContact = contacts.find(c => c.id === row.caller_id);
          if (!callerContact) {
            try {
              const { data: callerData } = await supabase
                .from('users')
                .select('id, display_name, photo_url')
                .eq('id', row.caller_id)
                .single();
              if (callerData) {
                callerContact = {
                  id: callerData.id,
                  name: callerData.display_name || 'Unknown Caller',
                  avatarUrl: callerData.photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${callerData.id}`,
                };
              }
            } catch {}
          }
          setIncomingCall({
            ...dbToCall(row),
            contact: callerContact || {
              id: row.caller_id,
              name: 'Unknown Caller',
              avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.caller_id}`,
            },
          });
        }
        fetchCalls();
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'calls',
        filter: `caller_id=eq.${user.id}`,
      }, () => fetchCalls())
      // Also watch for updates (missed calls when signal ends)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'call_signals',
        filter: `receiver_id=eq.${user.id}`,
      }, async (payload) => {
        const sig = payload.new as any;
        if (sig.status === 'ended' || sig.status === 'rejected') {
          setIncomingCall(null);
        }
        fetchCalls();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, contacts]);

  // ─── Contacts: fetch all users (no real-time needed) ───────────────────────
  useEffect(() => {
    if (!user?.id) return;

    const fetchContacts = async () => {
      const { data } = await supabase
        .from('users')
        .select('id, display_name, photo_url, email')
        .neq('id', user.id)
        .limit(200);

      const contactsData: Contact[] = (data || []).map(u => ({
        id: u.id,
        name: u.display_name,
        avatarUrl: u.photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`,
        email: u.email,
      }));
      setContacts(contactsData);
    };

    fetchContacts();
    const interval = setInterval(fetchContacts, 600000); // refresh every 10 min
    return () => clearInterval(interval);
  }, [user?.id]);

  // ─── Statuses & Communities ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    const mapStatus = (s: any) => ({
      ...s,
      userId: s.user_id,
      avatarUrl: s.avatar_url,
      backgroundColor: s.background_color,
      contentUrl: s.content_url,
      isMine: s.user_id === user.id,
      time: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    const fetchData = async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();

      const [statusRes, communityRes] = await Promise.all([
        supabase.from('statuses').select('*').gt('timestamp', yesterday).order('timestamp', { ascending: false }).limit(50),
        supabase.from('communities').select('*').order('created_at', { ascending: false }).limit(20),
      ]);

      if (statusRes.data) setStatuses(statusRes.data.map(mapStatus));
      if (communityRes.data) {
        setCommunities(communityRes.data.map(c => ({
          ...c,
          avatarUrl: c.avatar_url,
          groupsCount: c.groups_count,
          createdBy: c.created_by,
          createdAt: c.created_at,
        })));
      }
    };

    fetchData();

    // Real-time: new status posted → add to top of list
    const statusChannel = supabase
      .channel(`statuses-live-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'statuses',
      }, (payload) => {
        const s = payload.new as any;
        setStatuses(prev => [mapStatus(s), ...prev.filter(x => x.id !== s.id)]);
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'statuses',
      }, (payload) => {
        setStatuses(prev => prev.filter(x => x.id !== (payload.old as any).id));
      })
      .subscribe();

    return () => { supabase.removeChannel(statusChannel); };
  }, [user?.id]);

  // ─── Friend Requests: real-time ─────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    const fetchRequests = async () => {
      const { data } = await supabase
        .from('friend_requests')
        .select('*')
        .or(`from_id.eq.${user.id},to_id.eq.${user.id}`)
        .eq('status', 'pending')
        .limit(30);
      setFriendRequests((data || []).map(dbToFriendRequest));
    };

    fetchRequests();

    const channel = supabase
      .channel(`friend-requests-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'friend_requests',
      }, () => fetchRequests())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ─── Enriched calls with contact info ──────────────────────────────────────
  const enrichedCalls = useMemo(() => {
    return calls.map(call => {
      if (call.contact) return call;
      const otherId = call.callerId === user?.id ? call.receiverId : call.callerId;
      const contact = contacts.find(c => c.id === otherId);
      return { ...call, contact };
    });
  }, [calls, contacts, user]);

  // ─── Friend user IDs: users we share a chat with (accepted friends) ──────────
  // A user is a "friend" if we have an existing 1-1 chat with them.
  // This is the gate for re-calling: only friends can be called directly.
  const friendUserIds = useMemo(() => {
    if (!user?.id) return new Set<string>();
    const ids = new Set<string>();
    chats.forEach(chat => {
      if (!chat.isGroup && chat.participants) {
        chat.participants.forEach((pid: string) => {
          if (pid !== user.id) ids.add(pid);
        });
      }
    });
    return ids;
  }, [chats, user?.id]);

  // ─── HANDLERS ──────────────────────────────────────────────────────────────

  const handleRoomSelect = (room: Room | null) => {
    setSelectedRoom(room);
  };

  const handleCreateGroup = async (groupData: { name: string; avatarUrl: string; members: Contact[] }) => {
    if (!user) return;
    const participants = [user.id, ...groupData.members.map(m => m.id)];
    const { error } = await supabase.from('chats').insert({
      name: groupData.name,
      avatar_url: groupData.avatarUrl,
      is_group: true,
      participants,
      created_by: user.id,
      last_message: 'Group created',
      last_message_time: new Date().toISOString(),
      unread_count: 0,
      is_pinned: false,
      message_type: 'text',
    });
    if (error) { handleSupabaseError(error, 'create-group'); return; }
    setIsCreateGroupOpen(false);
  };

  const handleCreateContact = async (contactData: { name: string; phone?: string; avatarUrl: string; id?: string }) => {
    if (!user) return;
    const contact: Contact = {
      id: contactData.id || `contact_${Date.now()}`,
      name: contactData.name,
      avatarUrl: contactData.avatarUrl,
      phone: contactData.phone,
    };
    handleInitiateChat(contact);
    setIsCreateContactOpen(false);
  };

  const handleSendMessage = async (chatId: string, messageText: string) => {
    if (!user) return;
    const { error: msgError } = await supabase.from('chat_messages').insert({
      chat_id: chatId,
      text: messageText,
      sender_id: user.id,
      sender_name: user.displayName,
      timestamp: new Date().toISOString(),
      type: 'text',
    });
    if (msgError) { handleSupabaseError(msgError, 'send-message'); return; }

    await supabase.from('chats').update({
      last_message: messageText,
      last_message_time: new Date().toISOString(),
    }).eq('id', chatId);
  };

  const handleDeleteChat = async (chatId: string) => {
    await supabase.from('chats').delete().eq('id', chatId);
    setChatToDelete(null);
  };

  const handleToggleBlock = async (contactId: string) => {
    if (!user) return;
    const isBlocked = user.blockedUserIds?.includes(contactId);
    const newBlocked = isBlocked
      ? (user.blockedUserIds || []).filter(id => id !== contactId)
      : [...(user.blockedUserIds || []), contactId];

    await supabase.from('users').update({ blocked_user_ids: newBlocked }).eq('id', user.id);
    setUser(prev => prev ? { ...prev, blockedUserIds: newBlocked } : null);
  };

  const handleInitiateCall = async (contact: Contact, isVideo: boolean) => {
    if (!user) return;
    if (user.blockedUserIds?.includes(contact.id)) {
      setToastMessage(`🚫 You've blocked ${contact.name}. Unblock them to call.`);
      return;
    }

    setIsProfileOpen(false);
    setSelectedChat(null);
    setSelectedGroup(null);
    setActiveTab('Calls');
    setLastCalledUser(contact);

    // Insert call record and use its UUID as the signal ID too
    const { data, error } = await supabase.from('calls').insert({
      caller_id: user.id,
      receiver_id: contact.id,
      type: 'outgoing',
      timestamp: new Date().toISOString(),
      is_video: isVideo,
      duration: 0,
    }).select().single();

    if (error) { handleSupabaseError(error, 'initiate-call'); return; }

    // Pre-create call_signals row so receiver can find it immediately
    await supabase.from('call_signals').upsert({
      id: data.id, // Same UUID — links perfectly
      caller_id: user.id,
      receiver_id: contact.id,
      is_video: isVideo,
      status: 'calling',
    }, { onConflict: 'id' });

    setActiveCall({ contact, isVideo, callId: data.id, isCaller: true });
  };

  const handleInitiateChat = async (contact: Contact) => {
    if (!user) return;

    const existing = chats.find(c =>
      !c.isGroup &&
      c.participants.includes(user.id) &&
      c.participants.includes(contact.id)
    );

    if (existing) {
      setSelectedChat(existing);
    } else {
      const { data, error } = await supabase.from('chats').insert({
        name: contact.name,
        avatar_url: contact.avatarUrl,
        is_group: false,
        participants: [user.id, contact.id],
        last_message: 'Say hi! 👋',
        last_message_time: new Date().toISOString(),
      }).select().single();

      if (error) { handleSupabaseError(error, 'create-chat'); return; }
      setSelectedChat(dbToChat(data));
    }
    setSelectedGroup(null);
  };

  const handleUpdateGroup = async (groupId: string, updates: Partial<Group>) => {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.avatarUrl !== undefined) dbUpdates.avatar_url = updates.avatarUrl;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.admins !== undefined) dbUpdates.admins = updates.admins;
    await supabase.from('chats').update(dbUpdates).eq('id', groupId);
  };

  const handleSendFriendRequest = async (toId: string, toName: string, toAvatarUrl: string) => {
    if (!user) return;
    const { error } = await supabase.from('friend_requests').upsert({
      from_id: user.id,
      from_name: user.displayName,
      from_avatar_url: user.photoURL,
      to_id: toId,
      status: 'pending',
      timestamp: new Date().toISOString(),
    }, { onConflict: 'from_id,to_id' });
    if (error) { handleSupabaseError(error, 'send-friend-request'); return; }
    // Show non-blocking toast instead of alert
    setToastMessage(`Friend request sent to ${toName}! 🤝`);
  };

  const handleAcceptFriendRequest = async (request: FriendRequest) => {
    if (!user) return;
    await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', request.id);
    const contact: Contact = {
      id: request.fromId,
      name: request.fromName,
      avatarUrl: request.fromAvatarUrl,
    };
    handleInitiateChat(contact);
    await supabase.from('friend_requests').delete().eq('id', request.id);
  };

  // ─── Remove self from queue and cancel subscription ─────────────────────────
  const leaveQueue = useCallback(async () => {
    if (queueChannelRef.current) {
      await supabase.removeChannel(queueChannelRef.current);
      queueChannelRef.current = null;
    }
    if (user) {
      await supabase.from('call_queue').delete().eq('user_id', user.id);
    }
  }, [user]);

  // ─── Auto-start a matched call (no accept dialog) ────────────────────────────
  const startMatchedCall = useCallback(async (partnerId: string, partnerName: string, partnerAvatar: string, callId: string, isVideo: boolean, myId: string) => {
    setIsSearchingRandomCall(false);
    setSearchProgress(100);
    const isCaller = myId < partnerId;
    const partnerContact = {
      id: partnerId,
      name: partnerName,
      avatarUrl: partnerAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerId}`,
    };

    // Remember this random call partner so we can show the post-call modal
    lastRandomPartnerRef.current = { contact: partnerContact, callId };
    setLastCalledUser(partnerContact);

    // Insert a calls row so WebRTC signaling works and history is populated
    try {
      await supabase.from('calls').upsert({
        id: callId,
        caller_id: isCaller ? myId : partnerId,
        receiver_id: isCaller ? partnerId : myId,
        type: 'outgoing',
        timestamp: new Date().toISOString(),
        is_video: isVideo,
        duration: 0,
      }, { onConflict: 'id' });
    } catch {
      // non-fatal
    }

    setActiveCall({ contact: partnerContact, isVideo, callId, isCaller });
  }, []);


  const handleRandomCall = async (isVideo: boolean) => {
    if (!user) return;

    // Cancel any previous search first
    await leaveQueue();

    setIsSearchingRandomCall(true);
    setSearchProgress(0);
    setSearchError(null);

    // Animate progress bar smoothly while searching
    const progressInterval = setInterval(() => {
      setSearchProgress(prev => prev >= 90 ? prev : prev + Math.random() * 3);
    }, 300);

    try {
      // ── Step 1: Add self to the matchmaking queue ────────────────────────────
      const { error: upsertErr } = await supabase.from('call_queue').upsert({
        user_id: user.id,
        user_name: user.displayName,
        user_avatar: user.photoURL,
        is_video: isVideo,
        searching_since: new Date().toISOString(),
        matched_with: null,
        matched_name: null,
        matched_avatar: null,
        call_id: null,
      }, { onConflict: 'user_id' });

      if (upsertErr) {
        // call_queue table may not exist yet — show migration hint
        setSearchError('Queue table not found. Run the updated schema.sql in Supabase first.');
        clearInterval(progressInterval);
        setIsSearchingRandomCall(false);
        return;
      }

      // ── Step 2: Look for another user already waiting ────────────────────────
      const { data: waiting } = await supabase
        .from('call_queue')
        .select('user_id, user_name, user_avatar, is_video')
        .neq('user_id', user.id)
        .is('matched_with', null)
        .order('searching_since', { ascending: true })
        .limit(1)
        .single();

      if (waiting) {
        // ── Found a match! Create the call and update both queue rows ──────────
        const callId = crypto.randomUUID();

        // Mark both users as matched simultaneously
        await Promise.all([
          supabase.from('call_queue').update({
            matched_with: waiting.user_id,
            matched_name: waiting.user_name,
            matched_avatar: waiting.user_avatar,
            call_id: callId,
          }).eq('user_id', user.id),
          supabase.from('call_queue').update({
            matched_with: user.id,
            matched_name: user.displayName,
            matched_avatar: user.photoURL,
            call_id: callId,
          }).eq('user_id', waiting.user_id),
        ]);

        clearInterval(progressInterval);
        await leaveQueue();

        // Auto-start call instantly — no accept modal
        startMatchedCall(waiting.user_id, waiting.user_name, waiting.user_avatar, callId, isVideo, user.id);
        return;
      }

      // ── Step 3: No one waiting — subscribe and wait for a match ─────────────
      clearInterval(progressInterval);

      const queueCh = supabase
        .channel(`queue-match-${user.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_queue',
          filter: `user_id=eq.${user.id}`,
        }, async (payload) => {
          const row = payload.new as any;
          if (row.matched_with && row.call_id) {
            // Got matched by someone else — auto-start call
            await leaveQueue();
            startMatchedCall(row.matched_with, row.matched_name || 'User', row.matched_avatar, row.call_id, isVideo, user.id);
          }
        })
        .subscribe();

      queueChannelRef.current = queueCh;

      // Auto-cancel after 60 seconds with a friendly message
      setTimeout(async () => {
        if (queueChannelRef.current === queueCh) {
          await leaveQueue();
          setIsSearchingRandomCall(false);
          setSearchProgress(0);
          setSearchError('No one found nearby. Try again in a moment!');
        }
      }, 60000);

    } catch (err) {
      clearInterval(progressInterval);
      setSearchError('Something went wrong. Please try again.');
      setIsSearchingRandomCall(false);
      await leaveQueue();
    }
  };

  const handleCancelRandomCall = async () => {
    await leaveQueue();
    setIsSearchingRandomCall(false);
    setSearchProgress(0);
    setSearchError(null);
  };

  const handleLastCalledChat = () => {
    if (calls.length > 0) {
      const lastCall = calls[0];
      const otherId = lastCall.callerId === user?.id ? lastCall.receiverId : lastCall.callerId;
      const contact = lastCall.contact || contacts.find(c => c.id === otherId) || {
        id: otherId,
        name: `User ${otherId.slice(0, 5)}`,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherId}`,
      };
      handleInitiateChat(contact);
    }
  };

  const isFriendRequestSent = useMemo(() => {
    if (!user || !lastCalledUser) return false;
    return friendRequests.some(r => r.fromId === user.id && r.toId === lastCalledUser.id);
  }, [user, lastCalledUser, friendRequests]);

  const incomingFriendRequests = useMemo(() => {
    if (!user) return [];
    return friendRequests.filter(r => r.toId === user.id && r.status === 'pending');
  }, [user, friendRequests]);

  const handleEndCall = () => {
    setActiveCall(null);
    // Show post-call modal only for random calls where partner is not yet a friend
    if (lastRandomPartnerRef.current) {
      const partnerId = lastRandomPartnerRef.current.contact.id;
      // Only show if they're not yet a friend (no shared chat)
      if (!friendUserIds.has(partnerId)) {
        setShowPostCallModal(true);
      }
      lastRandomPartnerRef.current = null;
    }
  };
  const handleAcceptCall = () => {
    if (incomingCall) {
      setActiveCall({
        contact: incomingCall.contact!,
        isVideo: incomingCall.isVideo,
        callId: incomingCall.id, // This is call_signals.id (same UUID as calls.id)
        isCaller: false,
      });
      setIncomingCall(null);
    }
  };
  const handleRejectCall = async () => {
    if (incomingCall) {
      // Mark signal as rejected so caller UI updates immediately
      await supabase.from('call_signals')
        .update({ status: 'rejected' })
        .eq('id', incomingCall.id);
      // Mark call as missed for the caller
      await supabase.from('calls')
        .update({ type: 'missed' })
        .eq('id', incomingCall.id);
    }
    setIncomingCall(null);
  };

  const handleSimulateCall = () => {
    if (contacts.length > 0) {
      const r = contacts[Math.floor(Math.random() * contacts.length)];
      setIncomingCall({
        id: `mock_${Date.now()}`,
        callerId: r.id,
        receiverId: user?.id || '',
        type: 'incoming',
        timestamp: new Date().toISOString(),
        isVideo: Math.random() > 0.5,
        contact: r,
      });
    }
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  // Show setup screen if env vars are missing
  if (!isSupabaseConfigured) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center p-5 overflow-y-auto">
        <div className="w-full max-w-md animate-fade-in">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-emerald-500 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-emerald-500/40 mb-4">
              <span className="text-white text-4xl font-black">V</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">ViaaChat</h1>
            <p className="text-emerald-400 text-sm font-bold mt-1 uppercase tracking-widest">Setup Required</p>
          </div>

          {/* Card */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-amber-400 text-xl">⚠️</span>
              </div>
              <div>
                <h2 className="text-white font-black text-lg leading-tight">Missing Supabase Keys</h2>
                <p className="text-slate-400 text-xs">Your .env file needs configuration</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              {[
                { num: '1', title: 'Create a Supabase Project', body: 'Go to supabase.com → New Project', link: 'https://supabase.com', linkLabel: 'supabase.com →' },
                { num: '2', title: 'Run schema.sql', body: 'SQL Editor → paste schema.sql → Run' },
                { num: '3', title: 'Get your API Keys', body: 'Settings → API → copy Project URL + anon key' },
                { num: '4', title: 'Create .env file', body: 'Copy .env.example to .env and fill in values' },
                { num: '5', title: 'Restart dev server', body: 'Stop and run npm run dev again' },
              ].map(step => (
                <div key={step.num} className="flex gap-3 bg-white/5 rounded-xl p-3 border border-white/5">
                  <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0 mt-0.5">
                    {step.num}
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">{step.title}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{step.body}</p>
                    {step.link && (
                      <a href={step.link} target="_blank" rel="noreferrer" className="text-emerald-400 text-xs font-bold hover:underline">
                        {step.linkLabel}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Code block showing .env content */}
            <div className="bg-slate-950 rounded-xl p-4 border border-white/5 font-mono text-xs">
              <p className="text-slate-500 mb-1"># .env</p>
              <p className="text-emerald-400">VITE_SUPABASE_URL<span className="text-slate-500">=</span><span className="text-amber-300">https://xxxx.supabase.co</span></p>
              <p className="text-emerald-400">VITE_SUPABASE_ANON_KEY<span className="text-slate-500">=</span><span className="text-amber-300">eyJhbGci...</span></p>
            </div>

            <p className="text-center text-slate-500 text-[10px] mt-4 font-bold uppercase tracking-widest">
              After adding .env → restart the dev server
            </p>
          </div>

          {/* Footer */}
          <p className="text-center text-slate-600 text-xs mt-6">
            Need help? Check the <span className="text-emerald-500 font-bold">walkthrough.md</span> in the project artifacts
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-700">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl">
            <span className="text-emerald-600 text-3xl font-black">V</span>
          </div>
          <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) return <Login />;


  const renderContent = () => {
    switch (activeTab) {
      case 'Chats':
        return (
          <>
            <SearchBar />
            <div className="px-4 pb-4 flex gap-2">
              <button
                onClick={() => handleRandomCall(false)}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
              >
                <PhoneCall size={18} />
                <span>Random Call</span>
              </button>
              {lastCalledUser && !contacts.some(c => c.id === lastCalledUser.id) && (
                <button
                  onClick={() => handleCreateContact({ name: lastCalledUser.name, avatarUrl: lastCalledUser.avatarUrl, phone: lastCalledUser.phone || '' })}
                  className="bg-white border border-emerald-100 text-emerald-600 px-4 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-emerald-50 transition-all active:scale-95"
                  title={`Add ${lastCalledUser.name} as friend`}
                >
                  <UserPlus size={18} />
                </button>
              )}
            </div>
            <FilterPills activeFilter={activeFilter} onFilterChange={setActiveFilter} />
            {/* Non-intrusive ad — between filter and chat list, never inside chats */}
            <div className="px-4 pb-1">
              <AdBanner format="banner" variant="chatlist" />
            </div>
            <ChatList
              chats={chats}
              activeFilter={activeFilter}
              onChatSelect={setSelectedChat}
              onChatLongPress={setChatToDelete}
            />
          </>
        );
      case 'Updates':
        return <UpdatesScreen statuses={statuses} user={user} contacts={contacts} />;
      case 'Communities':
        return (
          <GroupsScreen
            user={user}
            contacts={contacts}
            chats={chats.filter(c => c.isGroup)}
            onOpenChat={(chat) => setSelectedChat(chat)}
            onCreateGroup={() => setIsCreateGroupOpen(true)}
          />
        );
      case 'Calls':
        return (
          <CallsScreen
            calls={enrichedCalls}
            contacts={contacts}
            friendUserIds={friendUserIds}
            onInitiateCall={handleInitiateCall}
            onRandomCall={handleRandomCall}
            onSendFriendRequest={handleSendFriendRequest}
            blockedUserIds={user.blockedUserIds || []}
            onToggleBlock={handleToggleBlock}
          />
        );
      case 'Rooms':
        return (
          <RoomsScreen
            user={user}
            contacts={contacts}
            onRoomSelect={handleRoomSelect}
          />
        );
      default:
        return <ChatList chats={chats} activeFilter="All" onChatSelect={setSelectedChat} onChatLongPress={setChatToDelete} />;
    }
  };

  return (
    <div className="relative h-screen w-screen bg-gray-50 flex flex-col font-sans max-w-md mx-auto shadow-2xl overflow-hidden">

      {/* Matchmaking search overlay */}
      {isSearchingRandomCall && (
        <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-emerald-950 to-slate-950 z-[100] flex flex-col items-center justify-center animate-fade-in p-6 text-center">
          {/* Radar animation */}
          <div className="relative mb-10 w-36 h-36 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 animate-ping" style={{ animationDuration: '1.5s' }} />
            <div className="absolute inset-4 rounded-full border-2 border-emerald-500/30 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="absolute inset-8 rounded-full border-2 border-emerald-500/40 animate-ping" style={{ animationDuration: '2.5s' }} />
            <div className="relative bg-gradient-to-br from-emerald-500 to-teal-500 p-5 rounded-full shadow-2xl shadow-emerald-500/40">
              <PhoneCall size={40} className="text-white" />
            </div>
          </div>

          <h2 className="text-2xl font-black text-white mb-2 tracking-tight">
            {searchError ? '😔 No match found' : '🔍 Finding a partner...'}
          </h2>
          <p className="text-emerald-300/80 text-sm max-w-[260px] mb-8 leading-relaxed">
            {searchError
              ? searchError
              : 'Waiting for another user to also start searching. You\'ll be connected automatically!'}
          </p>

          {!searchError && (
            <div className="w-full max-w-xs mb-6">
              <div className="flex justify-between text-xs text-emerald-400/60 font-bold uppercase tracking-widest mb-2">
                <span>Searching</span>
                <span>Auto-connects when matched</span>
              </div>
              <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${searchProgress}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleCancelRandomCall}
            className="px-8 py-3.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold transition-all border border-white/10 active:scale-95"
          >
            {searchError ? 'Close' : 'Cancel'}
          </button>
        </div>
      )}


      {/* Active call overlay */}
      {activeCall && <CallScreen call={activeCall} onEndCall={handleEndCall} />}
      {incomingCall && <IncomingCallModal call={incomingCall} onAccept={handleAcceptCall} onReject={handleRejectCall} />}

      {/* Post-call: prompt to add friend after random call */}
      {showPostCallModal && lastCalledUser && !friendUserIds.has(lastCalledUser.id) && (
        <PostCallModal
          partner={lastCalledUser}
          isFriendRequestSent={isFriendRequestSent}
          onSendFriendRequest={() => handleSendFriendRequest(lastCalledUser.id, lastCalledUser.name, lastCalledUser.avatarUrl)}
          onClose={() => setShowPostCallModal(false)}
        />
      )}

      {/* Room screen */}
      {selectedRoom && user && (
        <RoomDetailScreen
          room={selectedRoom}
          user={user}
          contacts={contacts}
          onClose={() => handleRoomSelect(null)}
          onSendFriendRequest={handleSendFriendRequest}
        />
      )}

      {/* Chat / Group screens */}
      {selectedChat ? (
        selectedChat.isGroup ? (
          <GroupDetailScreen
            group={selectedChat as Group}
            contacts={contacts}
            onClose={() => setSelectedChat(null)}
            onSendMessage={handleSendMessage}
            onInitiateCall={handleInitiateCall}
            onInitiateChat={handleInitiateChat}
            onUpdateGroup={handleUpdateGroup}
          />
        ) : (
          <ChatDetailScreen
            chat={selectedChat}
            onClose={() => setSelectedChat(null)}
            onSendMessage={handleSendMessage}
            onInitiateCall={handleInitiateCall}
          />
        )
      ) : selectedGroup ? (
        <GroupDetailScreen
          group={selectedGroup}
          contacts={contacts}
          onClose={() => setSelectedGroup(null)}
          onSendMessage={handleSendMessage}
          onInitiateCall={handleInitiateCall}
          onInitiateChat={handleInitiateChat}
          onUpdateGroup={handleUpdateGroup}
        />
      ) : (
        <div className={`h-full flex flex-col ${activeCall || incomingCall ? 'blur-sm' : ''}`}>
          <Header onProfileClick={() => setIsProfileOpen(prev => !prev)} user={user} />
          {isProfileOpen && (
            <ProfileDashboard
              user={user}
              onClose={() => setIsProfileOpen(false)}
              onSimulateCall={handleSimulateCall}
              onUserUpdated={(updates) => setUser(prev => prev ? { ...prev, ...updates } : prev)}
            />
          )}
          <main className="flex-1 overflow-y-auto pb-20">
            {/* Incoming friend requests banner */}
            {incomingFriendRequests.length > 0 && (
              <div className="px-4 py-2 space-y-2">
                {incomingFriendRequests.map(req => (
                  <div key={req.id} className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 flex items-center justify-between animate-fade-in">
                    <div className="flex items-center gap-3">
                      <img src={req.fromAvatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${req.fromId}`} alt={req.fromName} className="w-10 h-10 rounded-full object-cover" />
                      <div>
                        <p className="text-sm font-bold text-gray-800">{req.fromName}</p>
                        <p className="text-[10px] text-gray-500">Sent you a friend request</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptFriendRequest(req)}
                        className="bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-emerald-600 transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        onClick={async () => { await supabase.from('friend_requests').delete().eq('id', req.id); }}
                        className="bg-white text-gray-500 border border-gray-200 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-gray-50 transition-colors"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {renderContent()}
          </main>
          {activeTab === 'Chats' && (
            <Fab
              onNewChat={() => setIsCreateContactOpen(true)}
              onLastCalledChat={handleLastCalledChat}
              onSendFriendRequest={handleSendFriendRequest}
              lastCalledUser={lastCalledUser}
              isFriendRequestSent={isFriendRequestSent}
            />
          )}
          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>
      )}

      {isCreateGroupOpen && (
        <CreateGroupModal contacts={contacts} onClose={() => setIsCreateGroupOpen(false)} onGroupCreate={handleCreateGroup} />
      )}
      {isCreateContactOpen && (
        <CreateContactModal onClose={() => setIsCreateContactOpen(false)} onContactCreate={handleCreateContact} />
      )}
      {chatToDelete && (
        <DeleteConfirmationModal
          chatName={chatToDelete.name}
          onConfirm={() => handleDeleteChat(chatToDelete.id)}
          onCancel={() => setChatToDelete(null)}
        />
      )}

      {/* Global Toast */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[999] bg-slate-800 text-white px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold animate-fade-in max-w-[90vw] text-center pointer-events-none">
          {toastMessage}
        </div>
      )}

    </div>
  );
};

export default App;
