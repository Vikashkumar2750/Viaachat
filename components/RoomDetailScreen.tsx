import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X, Mic, MicOff, Hand, MessageSquare, LogOut, Crown, Shield,
  UserPlus, UserMinus, Lock, Unlock, Users, Radio, Send, ChevronDown,
  MoreVertical, Volume2, VolumeX, Smile, Share2, Pin, Trash2, Copy,
} from 'lucide-react';
import { supabase } from '../supabase';
import type { Room, User, Contact, Seat } from '../types';
import { useRoomAudio } from '../hooks/useRoomAudio';

// ─── Types ───────────────────────────────────────────────────────────────────
type Role = 'host' | 'co-host' | 'speaker' | 'listener';

interface Participant {
  userId: string;
  name: string;
  avatar: string;
  role: Role;
  isMuted: boolean;
  isSpeaking: boolean;
  joinedAt: string;
}

interface ChatMsg {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  type: 'user' | 'system';
  timestamp: string;
  isHost?: boolean;
  isCoHost?: boolean;
  isPinned?: boolean;
}

interface HandRaise {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  raisedAt: string;
}

const EMOJI_REACTIONS = ['❤️', '🔥', '👏', '😂', '🎉', '💯'];
const CATEGORIES = ['General', 'Tech', 'Business', 'Finance', 'Music', 'Gaming', 'Education', 'Health'];

// ─── Role badge ───────────────────────────────────────────────────────────────
const RoleBadge: React.FC<{ role: Role }> = ({ role }) => {
  if (role === 'host') return <Crown size={10} className="text-amber-400" />;
  if (role === 'co-host') return <Shield size={10} className="text-blue-400" />;
  return null;
};

// ─── Speaking ring animation ─────────────────────────────────────────────────
const SpeakingRing: React.FC<{ active: boolean }> = ({ active }) => (
  active ? (
    <div className="absolute inset-0 rounded-full border-[3px] border-emerald-400 animate-pulse" />
  ) : null
);

// ─── Speaker Seat Card ────────────────────────────────────────────────────────
const SeatCard: React.FC<{
  seat: Seat;
  participant?: Participant;
  myId: string;
  myRole: Role;
  isSpeaking: boolean;
  onRemove: (userId: string) => void;
  onMute: (userId: string) => void;
  onMakeCoHost: (userId: string) => void;
  onSitDown: (seatNum: number) => void;
  onSendFriendRequest?: (userId: string, name: string, avatar: string) => void;
}> = ({ seat, participant, myId, myRole, isSpeaking, onRemove, onMute, onMakeCoHost, onSitDown, onSendFriendRequest }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const isMe = participant?.userId === myId;
  const canModerate = myRole === 'host' || myRole === 'co-host';

  return (
    <div className="flex flex-col items-center gap-1.5 w-[60px]">
      <button
        onClick={() => !participant ? onSitDown(seat.id) : setMenuOpen(m => !m)}
        className="relative w-14 h-14 rounded-full focus:outline-none"
      >
        {participant ? (
          <>
            <SpeakingRing active={isSpeaking && !participant.isMuted} />
            <img
              src={participant.avatar}
              alt={participant.name}
              className="w-14 h-14 rounded-full object-cover border-2 border-white/10"
              referrerPolicy="no-referrer"
            />
            {/* Muted indicator */}
            {participant.isMuted && (
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center border-2 border-gray-950">
                <MicOff size={9} className="text-white" />
              </div>
            )}
            {/* Role badge */}
            <div className="absolute -top-0.5 -left-0.5 w-4 h-4 bg-gray-900 rounded-full flex items-center justify-center border border-white/10">
              <RoleBadge role={participant.role} />
            </div>
            {/* Me indicator */}
            {isMe && (
              <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 bg-emerald-500 rounded-full border-2 border-gray-950" />
            )}
          </>
        ) : (
          <div className="w-14 h-14 rounded-full bg-white/5 border-2 border-white/10 border-dashed flex items-center justify-center hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all">
            <UserPlus size={16} className="text-white/20" />
          </div>
        )}
      </button>

      <span className="text-[10px] text-white/70 text-center truncate w-full leading-tight">
        {participant ? participant.name.split(' ')[0] : `Seat ${seat.id}`}
      </span>

      {/* Context menu */}
      {menuOpen && participant && (
        <div className="absolute z-50 bg-gray-800 border border-white/10 rounded-2xl shadow-2xl p-1 min-w-[160px] top-full mt-1 left-1/2 -translate-x-1/2">
          {!isMe && onSendFriendRequest && (
            <button
              onClick={() => { onSendFriendRequest(participant.userId, participant.name, participant.avatar); setMenuOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10 rounded-xl flex items-center gap-2"
            >
              <UserPlus size={14} /> Add Friend
            </button>
          )}
          {canModerate && !isMe && (
            <>
              <button
                onClick={() => { onMute(participant.userId); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10 rounded-xl flex items-center gap-2"
              >
                {participant.isMuted ? <Volume2 size={14} /> : <VolumeX size={14} />}
                {participant.isMuted ? 'Unmute' : 'Mute'}
              </button>
              {myRole === 'host' && (
                <button
                  onClick={() => { onMakeCoHost(participant.userId); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-blue-400 hover:bg-white/10 rounded-xl flex items-center gap-2"
                >
                  <Shield size={14} /> Make Co-host
                </button>
              )}
              <button
                onClick={() => { onRemove(participant.userId); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-xl flex items-center gap-2"
              >
                <UserMinus size={14} /> Remove
              </button>
            </>
          )}
          <button onClick={() => setMenuOpen(false)} className="w-full text-left px-3 py-2 text-xs text-white/30 hover:bg-white/5 rounded-xl">
            Close
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Chat Message ─────────────────────────────────────────────────────────────
const ChatMessage: React.FC<{ msg: ChatMsg; myId: string }> = ({ msg, myId }) => {
  const isMe = msg.senderId === myId;

  if (msg.type === 'system') {
    return (
      <div className="flex justify-center my-1">
        <span className="text-[11px] text-white/30 bg-white/5 px-3 py-1 rounded-full">{msg.text}</span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 max-w-[85%] ${isMe ? 'ml-auto flex-row-reverse' : ''}`}>
      <img
        src={msg.senderAvatar}
        alt={msg.senderName}
        className="w-7 h-7 rounded-full flex-shrink-0 object-cover border border-white/10 mt-1"
        referrerPolicy="no-referrer"
      />
      <div>
        <div className={`flex items-center gap-1 mb-0.5 ${isMe ? 'justify-end' : ''}`}>
          <span className={`text-[10px] font-bold ${msg.isHost ? 'text-amber-400' : msg.isCoHost ? 'text-blue-400' : 'text-white/50'}`}>
            {isMe ? 'You' : msg.senderName}
          </span>
          {msg.isHost && <Crown size={9} className="text-amber-400" />}
          {msg.isCoHost && !msg.isHost && <Shield size={9} className="text-blue-400" />}
        </div>
        <div className={`px-3 py-2 rounded-2xl text-sm ${
          isMe
            ? 'bg-emerald-600 text-white rounded-tr-sm'
            : 'bg-white/10 text-white/90 rounded-tl-sm'
        }`}>
          {msg.text}
        </div>
      </div>
    </div>
  );
};

// ─── Hand Raise Queue ─────────────────────────────────────────────────────────
const HandRaiseQueue: React.FC<{
  raises: HandRaise[];
  myRole: Role;
  onAccept: (userId: string) => void;
  onReject: (userId: string) => void;
}> = ({ raises, myRole, onAccept, onReject }) => {
  const canAct = myRole === 'host' || myRole === 'co-host';
  if (raises.length === 0) return null;

  return (
    <div className="absolute bottom-20 left-0 right-0 mx-4 bg-gray-800/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-40">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Hand size={14} className="text-amber-400" />
          <span className="text-sm font-bold text-white">Raised Hands ({raises.length})</span>
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto divide-y divide-white/5">
        {raises.map(r => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <img src={r.userAvatar} alt={r.userName} className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
            <span className="flex-1 text-sm text-white/80 font-medium">{r.userName}</span>
            {canAct && (
              <div className="flex gap-2">
                <button
                  onClick={() => onAccept(r.userId)}
                  className="px-3 py-1 bg-emerald-500 rounded-xl text-xs text-white font-bold hover:bg-emerald-600"
                >Accept</button>
                <button
                  onClick={() => onReject(r.userId)}
                  className="px-3 py-1 bg-white/10 rounded-xl text-xs text-white/60 hover:bg-white/20"
                >Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
interface RoomDetailScreenProps {
  room: Room;
  user: User;
  contacts: Contact[];
  onClose: () => void;
  onSendFriendRequest: (toId: string, toName: string, toAvatar: string) => void;
}

export const RoomDetailScreen: React.FC<RoomDetailScreenProps> = ({
  room, user, contacts, onClose, onSendFriendRequest,
}) => {
  const [seats, setSeats] = useState<Seat[]>(room.seats || []);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [handRaises, setHandRaises] = useState<HandRaise[]>([]);
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(false);
  const [isLocked, setIsLocked] = useState(room.isLocked || false);
  const [showChat, setShowChat] = useState(false);
  const [showHandRaises, setShowHandRaises] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [hasRaisedHand, setHasRaisedHand] = useState(false);
  const [listenerCount, setListenerCount] = useState(0);
  const [emojiReactions, setEmojiReactions] = useState<{ emoji: string; id: string; x: number }[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const reactTimer = useRef<any>(null);

  const myId = user.id;
  const myName = user.displayName;
  const myAvatar = user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${myId}`;

  // ── Determine role ─────────────────────────────────────────────────────────
  const myRole: Role = useMemo(() => {
    if (room.ownerId === myId) return 'host';
    if ((room as any).coHosts?.includes(myId)) return 'co-host';
    if (seats.some(s => s.userId === myId)) return 'speaker';
    return 'listener';
  }, [room.ownerId, myId, seats, room]);

  const isSpeaker = myRole === 'host' || myRole === 'co-host' || myRole === 'speaker';
  const isHost = myRole === 'host';
  const isCoHost = myRole === 'co-host';

  // ── Seated users for WebRTC ─────────────────────────────────────────────────
  const seatedUserIds = useMemo(() =>
    seats.filter(s => s.userId).map(s => s.userId!),
    [seats]
  );

  // ── Active speaker callback ─────────────────────────────────────────────────
  const handleSpeakingChange = useCallback((userId: string, speaking: boolean) => {
    setSpeakingUsers(prev => {
      const next = new Set(prev);
      speaking ? next.add(userId) : next.delete(userId);
      return next;
    });
  }, []);

  // ── Room audio hook ─────────────────────────────────────────────────────────
  const { connectToNewUser, disconnectFromUser } = useRoomAudio({
    roomId: room.id,
    myUserId: myId,
    seatedUserIds,
    isMuted,
    isEnabled: isSpeaker,
    onSpeakingChange: handleSpeakingChange,
  });

  // ── Sync participants from seats + DB ──────────────────────────────────────
  useEffect(() => {
    const buildParticipants = () => {
      const coHosts: string[] = (room as any).coHosts || [];
      const list: Participant[] = seats
        .filter(s => s.userId)
        .map(s => {
          const contact = contacts.find(c => c.id === s.userId);
          let role: Role = 'speaker';
          if (s.userId === room.ownerId) role = 'host';
          else if (coHosts.includes(s.userId!)) role = 'co-host';
          return {
            userId: s.userId!,
            name: s.userId === myId ? myName : (s.displayName || contact?.name || `User ${s.userId!.slice(0, 5)}`),
            avatar: s.userId === myId ? myAvatar : (s.photoURL || contact?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${s.userId}`),
            role,
            isMuted: s.isMuted || false,
            isSpeaking: speakingUsers.has(s.userId!),
            joinedAt: s.userId === myId ? new Date().toISOString() : '',
          };
        });
      setParticipants(list);
    };
    buildParticipants();
  }, [seats, speakingUsers, myId, myName, myAvatar, room.ownerId, contacts, room]);

  // ── Subscribe to room real-time changes ─────────────────────────────────────
  useEffect(() => {
    const roomCh = supabase
      .channel(`room-detail-${room.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${room.id}`,
      }, (payload) => {
        const r = payload.new as any;
        if (r.seats) setSeats(r.seats);
        if (typeof r.is_locked === 'boolean') setIsLocked(r.is_locked);
        if (typeof r.listener_count === 'number') setListenerCount(r.listener_count);
        if (r.ended_at) { addSystemMsg('Room has ended.'); setTimeout(onClose, 2000); }
      })
      .subscribe();

    return () => { supabase.removeChannel(roomCh); };
  }, [room.id, onClose]);

  // ── Subscribe to chat messages (ephemeral — only new messages) ────────────
  useEffect(() => {
    // Add join system message
    addSystemMsg(`${myName} joined the room`);

    const chatCh = supabase
      .channel(`room-chat-${room.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'room_messages',
        filter: `room_id=eq.${room.id}`,
      }, (payload) => {
        const row = payload.new as any;
        if (row.mentions?.includes('__webrtc__')) return; // skip WebRTC signals
        const coHosts: string[] = (room as any).coHosts || [];
        const msg: ChatMsg = {
          id: row.id,
          senderId: row.sender_id,
          senderName: row.sender_name,
          senderAvatar: row.sender_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.sender_id}`,
          text: row.text,
          type: row.mentions?.includes('__system__') ? 'system' : 'user',
          timestamp: row.timestamp,
          isHost: row.sender_id === room.ownerId,
          isCoHost: coHosts.includes(row.sender_id),
        };
        setChatMessages(prev => [...prev.slice(-99), msg]); // keep last 100
      })
      .subscribe();

    return () => { supabase.removeChannel(chatCh); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  // ── Subscribe to hand raises ─────────────────────────────────────────────
  useEffect(() => {
    const fetchRaises = async () => {
      const { data } = await supabase
        .from('hand_raises')
        .select('*')
        .eq('room_id', room.id)
        .eq('status', 'pending')
        .order('raised_at', { ascending: true });
      setHandRaises((data || []).map(r => ({
        id: r.id, userId: r.user_id, userName: r.user_name,
        userAvatar: r.user_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.user_id}`,
        raisedAt: r.raised_at,
      })));
    };
    fetchRaises();

    const ch = supabase
      .channel(`hand-raises-${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hand_raises', filter: `room_id=eq.${room.id}` },
        () => fetchRaises())
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [room.id]);

  // ── Increment listener count on join ────────────────────────────────────────
  useEffect(() => {
    if (isSpeaker) return;
    supabase.from('rooms').update({ listener_count: (room as any).listenerCount + 1 }).eq('id', room.id).then(() => {});
    return () => {
      supabase.from('rooms').update({ listener_count: Math.max(0, (room as any).listenerCount - 1) }).eq('id', room.id).then(() => {});
    };
  }, [isSpeaker, room.id, room]);

  // ── Auto scroll chat ──────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const addSystemMsg = (text: string) => {
    const msg: ChatMsg = {
      id: `sys-${Date.now()}`,
      senderId: '__system__',
      senderName: 'System',
      senderAvatar: '',
      text,
      type: 'system',
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, msg]);
  };

  const updateSeatsInDb = async (newSeats: Seat[]) => {
    await supabase.from('rooms').update({ seats: newSeats }).eq('id', room.id);
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleSitDown = async (seatNum: number) => {
    if (myRole !== 'listener') return; // already a speaker
    const newSeats = seats.map(s =>
      s.id === seatNum && !s.userId
        ? { ...s, userId: myId, displayName: myName, photoURL: myAvatar, isMuted: false }
        : s
    );
    setSeats(newSeats);
    await updateSeatsInDb(newSeats);
    addSystemMsg(`${myName} became a speaker`);
  };

  const handleLeaveSeat = async () => {
    const newSeats = seats.map(s =>
      s.userId === myId ? { ...s, userId: null, displayName: null, photoURL: null, isMuted: false } : s
    );
    setSeats(newSeats);
    await updateSeatsInDb(newSeats);
    disconnectFromUser(myId);
    addSystemMsg(`${myName} stepped down from speaker`);
  };

  const handleRemoveSpeaker = async (userId: string) => {
    const target = seats.find(s => s.userId === userId);
    if (target) {
      const newSeats = seats.map(s =>
        s.userId === userId ? { ...s, userId: null, displayName: null, photoURL: null, isMuted: false } : s
      );
      setSeats(newSeats);
      await updateSeatsInDb(newSeats);
      disconnectFromUser(userId);
      addSystemMsg(`A speaker was removed`);
    }
  };

  const handleMuteSpeaker = async (userId: string) => {
    const newSeats = seats.map(s =>
      s.userId === userId ? { ...s, isMuted: !s.isMuted } : s
    );
    setSeats(newSeats);
    await updateSeatsInDb(newSeats);
  };

  const handleMakeCoHost = async (userId: string) => {
    const coHosts = [...((room as any).coHosts || [])];
    if (!coHosts.includes(userId)) coHosts.push(userId);
    await supabase.from('rooms').update({ co_hosts: coHosts }).eq('id', room.id);
    addSystemMsg(`A new co-host was assigned`);
  };

  const handleToggleLock = async () => {
    const next = !isLocked;
    setIsLocked(next);
    await supabase.from('rooms').update({ is_locked: next }).eq('id', room.id);
    addSystemMsg(`Room ${next ? 'locked' : 'unlocked'}`);
  };

  const handleEndRoom = async () => {
    await supabase.from('rooms').update({ ended_at: new Date().toISOString() }).eq('id', room.id);
    onClose();
  };

  const handleRaiseHand = async () => {
    if (hasRaisedHand) {
      await supabase.from('hand_raises').delete().eq('room_id', room.id).eq('user_id', myId);
      setHasRaisedHand(false);
    } else {
      await supabase.from('hand_raises').upsert({
        room_id: room.id,
        user_id: myId,
        user_name: myName,
        user_avatar: myAvatar,
        status: 'pending',
      }, { onConflict: 'room_id,user_id' });
      setHasRaisedHand(true);
    }
  };

  const handleAcceptHand = async (userId: string) => {
    // Find free seat
    const freeSeat = seats.find(s => !s.userId);
    if (!freeSeat) return;
    const target = contacts.find(c => c.id === userId);
    const raise = handRaises.find(r => r.userId === userId);
    const newSeats = seats.map(s =>
      s.id === freeSeat.id
        ? { ...s, userId, displayName: raise?.userName || target?.name || 'User', photoURL: raise?.userAvatar || target?.avatarUrl || '', isMuted: false }
        : s
    );
    setSeats(newSeats);
    await updateSeatsInDb(newSeats);
    await supabase.from('hand_raises').update({ status: 'accepted' }).eq('room_id', room.id).eq('user_id', userId);
    connectToNewUser(userId);
    addSystemMsg(`${raise?.userName || 'Someone'} became a speaker`);
  };

  const handleRejectHand = async (userId: string) => {
    await supabase.from('hand_raises').update({ status: 'rejected' }).eq('room_id', room.id).eq('user_id', userId);
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    const coHosts: string[] = (room as any).coHosts || [];
    await supabase.from('room_messages').insert({
      room_id: room.id,
      sender_id: myId,
      sender_name: myName,
      sender_avatar: myAvatar,
      text,
      timestamp: new Date().toISOString(),
      mentions: [],
    });
  };

  const handleEmojiReact = async (emoji: string) => {
    setShowEmojiPicker(false);
    // Show floating emoji animation
    const id = `${Date.now()}`;
    const x = 20 + Math.random() * 60;
    setEmojiReactions(prev => [...prev, { emoji, id, x }]);
    reactTimer.current = setTimeout(() => {
      setEmojiReactions(prev => prev.filter(r => r.id !== id));
    }, 2500);
    // Save to DB
    await supabase.from('room_reactions').insert({
      room_id: room.id,
      user_id: myId,
      emoji,
    });
  };

  const handleLeave = async () => {
    if (isSpeaker && !isHost) await handleLeaveSeat();
    if (isHost) {
      // Transfer host to first co-host or first speaker
      const coHosts: string[] = (room as any).coHosts || [];
      const nextHost = coHosts[0] || seats.find(s => s.userId && s.userId !== myId)?.userId;
      if (nextHost) {
        await supabase.from('rooms').update({ owner_id: nextHost }).eq('id', room.id);
      } else {
        // No one left — end the room
        await handleEndRoom();
        return;
      }
    }
    addSystemMsg(`${myName} left the room`);
    onClose();
  };

  // ── Empty seats to fill grid to 10 ────────────────────────────────────────
  const displaySeats = useMemo(() => {
    const filled = [...seats];
    while (filled.length < 10) filled.push({ id: filled.length + 1, userId: null, isLocked: false, isMuted: false });
    return filled.slice(0, 10);
  }, [seats]);

  const speakerCount = seats.filter(s => s.userId).length;
  const totalListeners = listenerCount + (myRole === 'listener' ? 1 : 0);

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col overflow-hidden">

      {/* ── Floating emoji reactions ─────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
        {emojiReactions.map(r => (
          <div
            key={r.id}
            className="absolute bottom-24 text-3xl animate-[floatUp_2.5s_ease-out_forwards]"
            style={{ left: `${r.x}%` }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-gray-900/90 backdrop-blur-xl border-b border-white/10 px-4 pt-safe-top pb-0">
        <div className="flex items-center gap-3 py-3">
          <button onClick={handleLeave} className="p-2 -ml-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all">
            <ChevronDown size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-white truncate">{room.title}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Live</span>
              </div>
              <span className="text-[10px] text-white/30">·</span>
              <div className="flex items-center gap-1 text-[10px] text-white/40">
                <Users size={10} />
                <span>{speakerCount} speakers · {totalListeners} listeners</span>
              </div>
              {isLocked && <Lock size={10} className="text-amber-400" />}
            </div>
          </div>

          {/* Host controls */}
          {(isHost || isCoHost) && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleToggleLock}
                className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all"
                title={isLocked ? 'Unlock room' : 'Lock room'}
              >
                {isLocked ? <Unlock size={18} /> : <Lock size={18} />}
              </button>
              {isHost && (
                <button
                  onClick={handleEndRoom}
                  className="px-3 py-1.5 bg-red-500/20 text-red-400 text-xs font-bold rounded-xl hover:bg-red-500/30 transition-all"
                >
                  End
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Speaker Grid ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pt-5 pb-2">
        <div className="grid grid-cols-5 gap-3 justify-items-center">
          {displaySeats.map(seat => {
            const participant = participants.find(p => p.userId === seat.userId);
            return (
              <div key={seat.id} className="relative">
                <SeatCard
                  seat={seat}
                  participant={participant}
                  myId={myId}
                  myRole={myRole}
                  isSpeaking={speakingUsers.has(seat.userId || '')}
                  onRemove={handleRemoveSpeaker}
                  onMute={handleMuteSpeaker}
                  onMakeCoHost={handleMakeCoHost}
                  onSitDown={handleSitDown}
                  onSendFriendRequest={onSendFriendRequest}
                />
              </div>
            );
          })}
        </div>

        {/* Category tag */}
        <div className="flex items-center gap-2 mt-4 px-1">
          <Radio size={12} className="text-emerald-400" />
          <span className="text-xs text-emerald-400 font-bold">{(room as any).category || 'General'}</span>
          {room.description && (
            <p className="text-xs text-white/30 truncate">{room.description}</p>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* ── Chat panel ─────────────────────────────────────────────────── */}
        {showChat && (
          <div className="flex-1 flex flex-col min-h-0 bg-gray-900/50 border-t border-white/10">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scroll-smooth">
              {chatMessages.map(msg => (
                <ChatMessage key={msg.id} msg={msg} myId={myId} />
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="flex-shrink-0 px-3 pb-3 pt-2 border-t border-white/10">
              <div className="flex items-center gap-2 bg-white/10 rounded-2xl px-3">
                <input
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                  placeholder="Message..."
                  className="flex-1 bg-transparent py-3 text-sm text-white placeholder-white/30 focus:outline-none"
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim()}
                  className="p-1.5 text-emerald-400 disabled:text-white/20 transition-colors"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Listeners section (when chat hidden) ─────────────────────── */}
        {!showChat && (
          <div className="flex-1 overflow-y-auto px-4 py-2">
            <p className="text-xs text-white/30 font-bold uppercase tracking-widest mb-3">Listeners</p>
            <div className="grid grid-cols-6 gap-2">
              {/* Placeholder listeners */}
              {Array.from({ length: Math.min(totalListeners, 18) }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div
                    className="w-10 h-10 rounded-full bg-white/5 border border-white/10"
                    style={{ background: `hsl(${(i * 37) % 360}, 50%, 25%)` }}
                  />
                  <span className="text-[9px] text-white/30">Listener</span>
                </div>
              ))}
              {totalListeners > 18 && (
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-xs text-white/40 font-bold">+{totalListeners - 18}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Hand raise queue ─────────────────────────────────────────── */}
        {showHandRaises && handRaises.length > 0 && (
          <HandRaiseQueue
            raises={handRaises}
            myRole={myRole}
            onAccept={handleAcceptHand}
            onReject={handleRejectHand}
          />
        )}
      </div>

      {/* ── Emoji picker ──────────────────────────────────────────────────── */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2 bg-gray-800 border border-white/10 rounded-2xl px-4 py-3 shadow-2xl z-40">
          {EMOJI_REACTIONS.map(e => (
            <button key={e} onClick={() => handleEmojiReact(e)} className="text-2xl hover:scale-125 active:scale-110 transition-transform">
              {e}
            </button>
          ))}
        </div>
      )}

      {/* ── Control Bar ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-gray-900/95 backdrop-blur-xl border-t border-white/10 px-4 pt-3 pb-safe-bottom">
        <div className="flex items-center justify-between max-w-sm mx-auto">

          {/* Mic toggle (speakers only) */}
          {isSpeaker ? (
            <button
              onClick={() => setIsMuted(m => !m)}
              className={`flex flex-col items-center gap-1 p-3 rounded-2xl transition-all ${
                isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              <span className="text-[9px] font-bold">{isMuted ? 'Muted' : 'Mic'}</span>
            </button>
          ) : (
            /* Raise hand (listeners) */
            <button
              onClick={handleRaiseHand}
              className={`flex flex-col items-center gap-1 p-3 rounded-2xl transition-all ${
                hasRaisedHand ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              <Hand size={20} />
              <span className="text-[9px] font-bold">{hasRaisedHand ? 'Lower' : 'Raise'}</span>
            </button>
          )}

          {/* Hand raises indicator (host/co-host) */}
          {(isHost || isCoHost) && handRaises.length > 0 && (
            <button
              onClick={() => setShowHandRaises(h => !h)}
              className="relative flex flex-col items-center gap-1 p-3 rounded-2xl bg-amber-500/20 text-amber-400"
            >
              <Hand size={20} />
              <span className="text-[9px] font-bold">Hands</span>
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                <span className="text-[9px] text-white font-black">{handRaises.length}</span>
              </div>
            </button>
          )}

          {/* Emoji react */}
          <button
            onClick={() => setShowEmojiPicker(e => !e)}
            className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-white/10 text-white/60 hover:bg-white/20 transition-all"
          >
            <Smile size={20} />
            <span className="text-[9px] font-bold">React</span>
          </button>

          {/* Chat */}
          <button
            onClick={() => setShowChat(c => !c)}
            className={`flex flex-col items-center gap-1 p-3 rounded-2xl transition-all ${
              showChat ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            <MessageSquare size={20} />
            <span className="text-[9px] font-bold">Chat</span>
          </button>

          {/* Step down (if speaker but not host) */}
          {isSpeaker && !isHost && (
            <button
              onClick={handleLeaveSeat}
              className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-white/10 text-white/60 hover:bg-white/20 transition-all"
            >
              <Users size={20} />
              <span className="text-[9px] font-bold">Step Down</span>
            </button>
          )}

          {/* Leave */}
          <button
            onClick={handleLeave}
            className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
          >
            <LogOut size={20} />
            <span className="text-[9px] font-bold">Leave</span>
          </button>
        </div>
      </div>
    </div>
  );
};
