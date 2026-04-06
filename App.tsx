
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './components/Header';
import { SearchBar } from './components/SearchBar';
import { FilterPills } from './components/FilterPills';
import { ChatList } from './components/ChatList';
import { BottomNav } from './components/BottomNav';
import { Fab } from './components/Fab';
import { UpdatesScreen } from './components/UpdatesScreen';
import { CommunitiesScreen } from './components/CommunitiesScreen';
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

  // ─── Auth: listen to Supabase auth changes ─────────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await syncUser(session.user);
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setUser(dbToUser(profile));
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─── Presence: update lastSeen every 5 minutes ─────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(() => updateUserPresence(user.id), 300000);
    return () => clearInterval(interval);
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
        if (now - callTime < 30000) {
          if (user.blockedUserIds?.includes(row.caller_id)) return;
          const callerContact = contacts.find(c => c.id === row.caller_id);
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

    const fetchData = async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();

      const [statusRes, communityRes] = await Promise.all([
        supabase.from('statuses').select('*').gt('timestamp', yesterday).order('timestamp', { ascending: false }).limit(50),
        supabase.from('communities').select('*').order('created_at', { ascending: false }).limit(20),
      ]);

      if (statusRes.data) {
        setStatuses(statusRes.data.map(s => ({
          ...s,
          userId: s.user_id,
          avatarUrl: s.avatar_url,
          backgroundColor: s.background_color,
          contentUrl: s.content_url,
          isMine: s.user_id === user.id,
          time: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        })));
      }
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
    const interval = setInterval(fetchData, 900000);
    return () => clearInterval(interval);
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
      alert(`You have blocked ${contact.name}. Unblock them to call.`);
      return;
    }

    setIsProfileOpen(false);
    setSelectedChat(null);
    setSelectedGroup(null);
    setActiveTab('Calls');
    setLastCalledUser(contact);

    const { data, error } = await supabase.from('calls').insert({
      caller_id: user.id,
      receiver_id: contact.id,
      type: 'outgoing',
      timestamp: new Date().toISOString(),
      is_video: isVideo,
    }).select().single();

    if (error) { handleSupabaseError(error, 'initiate-call'); return; }
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
    alert(`Friend request sent to ${toName}!`);
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

  const handleRandomCall = async (isVideo: boolean) => {
    if (!user) return;
    setIsSearchingRandomCall(true);
    setSearchProgress(0);
    setSearchError(null);

    const progressInterval = setInterval(() => {
      setSearchProgress(prev => prev >= 95 ? prev : prev + Math.random() * 5);
    }, 200);

    try {
      const tenMinutesAgo = new Date(Date.now() - 600000).toISOString();
      const { data } = await supabase
        .from('users')
        .select('id, display_name, photo_url')
        .neq('id', user.id)
        .gte('last_seen', tenMinutesAgo)
        .limit(20);

      const available = (data || []).filter(u => !user.blockedUserIds?.includes(u.id));

      if (available.length > 0) {
        setSearchProgress(100);
        const randomUser = available[Math.floor(Math.random() * available.length)];
        handleInitiateCall({
          id: randomUser.id,
          name: randomUser.display_name,
          avatarUrl: randomUser.photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${randomUser.id}`,
        }, isVideo);
        setTimeout(() => setIsSearchingRandomCall(false), 500);
      } else {
        const { data: anyUsers } = await supabase
          .from('users')
          .select('id, display_name, photo_url')
          .neq('id', user.id)
          .limit(10);

        if (anyUsers && anyUsers.length > 0) {
          setSearchProgress(100);
          const randomUser = anyUsers[Math.floor(Math.random() * anyUsers.length)];
          handleInitiateCall({
            id: randomUser.id,
            name: randomUser.display_name,
            avatarUrl: randomUser.photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${randomUser.id}`,
          }, isVideo);
          setTimeout(() => setIsSearchingRandomCall(false), 500);
        } else {
          setSearchError('No other users online. Try again later!');
          setSearchProgress(0);
        }
      }
    } catch (err) {
      setSearchError('Something went wrong. Please try again.');
    } finally {
      clearInterval(progressInterval);
    }
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

  const handleEndCall = () => setActiveCall(null);
  const handleAcceptCall = () => {
    if (incomingCall) {
      setActiveCall({
        contact: incomingCall.contact!,
        isVideo: incomingCall.isVideo,
        callId: incomingCall.id,
        isCaller: false,
      });
      setIncomingCall(null);
    }
  };
  const handleRejectCall = () => setIncomingCall(null);

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
        <style>{`
          @keyframes fade-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
          .animate-fade-in { animation: fade-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        `}</style>
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
        return <CommunitiesScreen communities={communities} />;
      case 'Calls':
        return (
          <CallsScreen
            calls={enrichedCalls}
            contacts={contacts}
            onInitiateCall={handleInitiateCall}
            onRandomCall={handleRandomCall}
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

      {/* Random call search overlay */}
      {isSearchingRandomCall && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex flex-col items-center justify-center animate-fade-in p-6 text-center">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
            <div className="relative bg-emerald-500 p-6 rounded-full shadow-2xl shadow-emerald-500/40">
              <PhoneCall size={48} className="text-white animate-bounce" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {searchError ? 'No one found' : 'Finding someone...'}
          </h2>
          <p className="text-emerald-100 text-sm max-w-[240px] mb-8">
            {searchError || "We're searching for an active user. Please wait."}
          </p>
          {!searchError && (
            <>
              <div className="w-full max-w-xs bg-white/10 rounded-full h-2 mb-4 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300 ease-out"
                  style={{ width: `${searchProgress}%` }}
                />
              </div>
              <p className="text-white font-bold text-lg mb-8">{Math.round(searchProgress)}%</p>
            </>
          )}
          <button
            onClick={() => setIsSearchingRandomCall(false)}
            className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold transition-all border border-white/20"
          >
            {searchError ? 'Close' : 'Cancel Search'}
          </button>
        </div>
      )}

      {/* Active call overlay */}
      {activeCall && <CallScreen call={activeCall} onEndCall={handleEndCall} />}
      {incomingCall && <IncomingCallModal call={incomingCall} onAccept={handleAcceptCall} onReject={handleRejectCall} />}

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
            <ProfileDashboard user={user} onClose={() => setIsProfileOpen(false)} onSimulateCall={handleSimulateCall} />
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

      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default App;
