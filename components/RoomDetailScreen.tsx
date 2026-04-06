
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Mic, MicOff, Lock, Unlock, UserPlus, Share2, Send,
  UserMinus, MessageSquare, Shield, UserCheck, Copy, Check,
  Plus, Volume2, VolumeX, Video, VideoOff, Crown, Settings,
  Ban, Bell, ChevronDown, AtSign, Users, Radio,
} from 'lucide-react';
import { supabase, handleSupabaseError } from '../supabase';
import type { Room, User, Contact, Seat, RoomMessage, RoomParticipant } from '../types';

interface RoomDetailScreenProps {
  room: Room;
  user: User;
  contacts: Contact[];
  onClose: () => void;
  onSendFriendRequest: (toId: string, toName: string, toAvatar: string) => void;
}

// ─── DB mapper ──────────────────────────────────────────────────────────────
const dbToMessage = (row: any): RoomMessage => ({
  id: row.id,
  roomId: row.room_id,
  senderId: row.sender_id,
  senderName: row.sender_name,
  senderAvatar: row.sender_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.sender_id}`,
  text: row.text,
  timestamp: row.timestamp,
  mentions: row.mentions || [],
});

// ─── Typing dots ─────────────────────────────────────────────────────────────
const TypingDots: React.FC = () => (
  <span className="inline-flex items-center gap-0.5">
    {[0, 1, 2].map(i => (
      <span
        key={i}
        className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"
        style={{ animationDelay: `${i * 0.15}s` }}
      />
    ))}
  </span>
);

// ─── Individual Seat Card ─────────────────────────────────────────────────────
interface SeatCardProps {
  seat: Seat;
  myId: string;
  ownerId: string;
  isAdmin: boolean;
  isOwner: boolean;
  onSit: (seatId: number) => void;
  onToggleMute: (seatId: number) => void;
  onToggleCamera: (seatId: number) => void;
  onToggleLock: (seatId: number) => void;
  onRemove: (seatId: number) => void;
  onBan: (userId: string) => void;
  onMakeAdmin: (userId: string) => void;
  onOfferSeat: (seatId: number) => void;
  onSendFriendRequest: (userId: string, name: string, avatar: string) => void;
  admins: string[];
}

const SeatCard: React.FC<SeatCardProps> = ({
  seat, myId, ownerId, isAdmin, isOwner,
  onSit, onToggleMute, onToggleCamera, onToggleLock,
  onRemove, onBan, onMakeAdmin, onOfferSeat, onSendFriendRequest, admins
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const isMe = seat.userId === myId;
  const isOccupied = !!seat.userId;
  const isTargetOwner = seat.userId === ownerId;
  const canControlMute = isMe || (isAdmin && !isTargetOwner);
  const isOfferedToMe = seat.offeredToId === myId;
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleClick = () => {
    if (!isOccupied && !seat.isLocked) {
      if (!seat.offeredToId || seat.offeredToId === myId) {
        onSit(seat.id);
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-1.5 group relative">
      {/* Seat container */}
      <div className="relative">
        {/* Offered pulse ring */}
        {isOfferedToMe && (
          <div className="absolute -inset-1 rounded-[22px] border-2 border-emerald-400 animate-pulse z-10 pointer-events-none" />
        )}

        <div
          onClick={handleClick}
          className={`
            w-[56px] h-[56px] rounded-[18px] overflow-hidden flex items-center justify-center transition-all duration-300 relative
            ${isMe ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-gray-900' : ''}
            ${isOccupied
              ? 'bg-gray-800 shadow-lg'
              : seat.isLocked
                ? 'bg-gray-800/60 border-2 border-dashed border-gray-700 cursor-not-allowed'
                : isOfferedToMe
                  ? 'bg-emerald-900/50 border-2 border-dashed border-emerald-500 cursor-pointer hover:bg-emerald-800/50'
                  : 'bg-gray-800/40 border-2 border-dashed border-white/10 cursor-pointer hover:border-emerald-500/60 hover:bg-gray-800/70'}
          `}
        >
          {isOccupied ? (
            <div className="relative w-full h-full">
              <img
                src={seat.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${seat.userId}`}
                className={`w-full h-full object-cover ${seat.isVideoOn ? 'opacity-50' : ''}`}
                alt={seat.userName || ''}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seat.userId}`;
                }}
              />
              {seat.isVideoOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Video size={20} className="text-emerald-400 drop-shadow" />
                </div>
              )}
              {/* Speaking animation */}
              {!seat.isMuted && (
                <div className="absolute inset-0 rounded-[18px] ring-2 ring-emerald-500/60 animate-pulse pointer-events-none" />
              )}
            </div>
          ) : seat.isLocked ? (
            <Lock size={18} className="text-gray-600" />
          ) : isOfferedToMe ? (
            <div className="text-center">
              <UserCheck size={18} className="text-emerald-400 mx-auto mb-0.5" />
              <span className="text-[7px] text-emerald-400 font-black">FOR YOU</span>
            </div>
          ) : (
            <Plus size={18} className="text-white/20 group-hover:text-emerald-500 transition-colors" />
          )}

          {/* Muted badge */}
          {seat.isMuted && isOccupied && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center shadow-lg z-10">
              <MicOff size={9} className="text-white" />
            </div>
          )}
          {/* Video badge */}
          {seat.isVideoOn && isOccupied && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg z-10">
              <Video size={9} className="text-white" />
            </div>
          )}
          {/* Owner crown */}
          {seat.userId === ownerId && (
            <div className="absolute -top-1 -left-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow-lg z-10">
              <Crown size={9} className="text-white" />
            </div>
          )}
          {/* Admin badge */}
          {seat.userId && admins.includes(seat.userId) && seat.userId !== ownerId && (
            <div className="absolute -top-1 -left-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-lg z-10">
              <Shield size={9} className="text-white" />
            </div>
          )}
        </div>

        {/* Controls overlay for occupied seats */}
        {isOccupied && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 bg-black/70 rounded-[18px] z-20 backdrop-blur-[2px]">
            {/* My seat controls */}
            {isMe && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); onToggleMute(seat.id); }}
                  className={`p-1.5 rounded-lg transition-all ${seat.isMuted ? 'bg-rose-500 text-white' : 'bg-white/20 hover:bg-white/40 text-white'}`}
                  title={seat.isMuted ? 'Unmute' : 'Mute'}
                >
                  {seat.isMuted ? <Volume2 size={12} /> : <VolumeX size={12} />}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onToggleCamera(seat.id); }}
                  className={`p-1.5 rounded-lg transition-all ${seat.isVideoOn ? 'bg-emerald-500 text-white' : 'bg-white/20 hover:bg-white/40 text-white'}`}
                  title={seat.isVideoOn ? 'Turn Camera Off' : 'Turn Camera On'}
                >
                  {seat.isVideoOn ? <VideoOff size={12} /> : <Video size={12} />}
                </button>
              </>
            )}
            {/* Admin controls on other seats */}
            {!isMe && isAdmin && (
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
                className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-lg transition-all"
                title="Options"
              >
                <Settings size={12} />
              </button>
            )}
            {/* Non-admin: send friend request */}
            {!isMe && !isAdmin && seat.userId && (
              <button
                onClick={e => { e.stopPropagation(); onSendFriendRequest(seat.userId!, seat.userName || '', seat.userAvatar || ''); }}
                className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-lg transition-all"
                title="Add Friend"
              >
                <UserPlus size={12} />
              </button>
            )}
          </div>
        )}

        {/* Owner controls on empty/locked seats */}
        {!isOccupied && isOwner && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 bg-black/60 rounded-[18px] z-20">
            <button
              onClick={e => { e.stopPropagation(); onToggleLock(seat.id); }}
              className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-lg transition-all"
              title={seat.isLocked ? 'Unlock' : 'Lock'}
            >
              {seat.isLocked ? <Unlock size={12} /> : <Lock size={12} />}
            </button>
            {!seat.isLocked && (
              <button
                onClick={e => { e.stopPropagation(); onOfferSeat(seat.id); }}
                className="p-1.5 bg-emerald-500/80 hover:bg-emerald-500 text-white rounded-lg transition-all"
                title="Offer Seat"
              >
                <UserPlus size={12} />
              </button>
            )}
          </div>
        )}

        {/* Admin context menu */}
        {menuOpen && !isMe && isAdmin && seat.userId && (
          <div ref={menuRef} className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden min-w-[150px]">
            {!isTargetOwner && (
              <button
                onClick={() => { onToggleMute(seat.id); setMenuOpen(false); }}
                className="w-full px-4 py-2.5 text-left text-xs font-bold text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
              >
                {seat.isMuted ? <Volume2 size={14} /> : <VolumeX size={14} />}
                {seat.isMuted ? 'Unmute' : 'Mute'}
              </button>
            )}
            <button
              onClick={() => { onSendFriendRequest(seat.userId!, seat.userName || '', seat.userAvatar || ''); setMenuOpen(false); }}
              className="w-full px-4 py-2.5 text-left text-xs font-bold text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
            >
              <UserPlus size={14} />
              Add Friend
            </button>
            {isOwner && (
              <button
                onClick={() => { onMakeAdmin(seat.userId!); setMenuOpen(false); }}
                className="w-full px-4 py-2.5 text-left text-xs font-bold text-blue-400 hover:bg-white/10 flex items-center gap-2 transition-colors"
              >
                <Shield size={14} />
                {admins.includes(seat.userId!) ? 'Remove Admin' : 'Make Admin'}
              </button>
            )}
            {!isTargetOwner && (
              <button
                onClick={() => { onRemove(seat.id); setMenuOpen(false); }}
                className="w-full px-4 py-2.5 text-left text-xs font-bold text-rose-400 hover:bg-white/10 flex items-center gap-2 transition-colors"
              >
                <UserMinus size={14} />
                Remove Seat
              </button>
            )}
            {isOwner && !isTargetOwner && (
              <button
                onClick={() => { onBan(seat.userId!); setMenuOpen(false); }}
                className="w-full px-4 py-2.5 text-left text-xs font-bold text-rose-600 hover:bg-rose-500/10 flex items-center gap-2 transition-colors border-t border-white/5"
              >
                <Ban size={14} />
                Ban from Room
              </button>
            )}
          </div>
        )}
      </div>

      {/* Name label */}
      <p className={`text-[9px] font-black uppercase tracking-wider truncate max-w-[56px] text-center transition-colors ${isOccupied ? (isMe ? 'text-emerald-400' : 'text-white/80') : 'text-white/20'}`}>
        {isOccupied ? (isMe ? 'You' : seat.userName) : (seat.isLocked ? '🔒' : `Seat ${seat.id + 1}`)}
      </p>
    </div>
  );
};

// ─── Message bubble ───────────────────────────────────────────────────────────
const MessageBubble: React.FC<{ msg: RoomMessage; isMe: boolean; }> = ({ msg, isMe }) => {
  const formatTime = (ts: any) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderText = (text: string) =>
    text.split(' ').map((word, i) =>
      word.startsWith('@')
        ? <span key={i} className="text-emerald-400 font-bold">{word} </span>
        : <span key={i}>{word} </span>
    );

  return (
    <div className={`flex items-end gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse self-end' : 'self-start'}`}>
      <img
        src={msg.senderAvatar}
        className="w-6 h-6 rounded-lg object-cover flex-shrink-0 mb-1"
        alt=""
        referrerPolicy="no-referrer"
        onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderId}`; }}
      />
      <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed shadow-sm ${isMe ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-gray-800 text-white/90 rounded-bl-none'}`}>
        {!isMe && (
          <p className="text-[8px] font-black text-emerald-400 mb-0.5 uppercase tracking-wider">{msg.senderName}</p>
        )}
        <p>{renderText(msg.text)}</p>
        <p className="text-[9px] opacity-50 mt-0.5 text-right">{formatTime(msg.timestamp)}</p>
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export const RoomDetailScreen: React.FC<RoomDetailScreenProps> = ({
  room: initialRoom,
  user,
  contacts,
  onClose,
  onSendFriendRequest,
}) => {
  const [room, setRoom] = useState<Room>(initialRoom);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [onlineParticipants, setOnlineParticipants] = useState<RoomParticipant[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState<{ seatId: number } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwner = room.ownerId === user.uid;
  const isAdmin = isOwner || (room.admins?.includes(user.uid) || false);
  const myCurrentSeat = room.seats.find(s => s.userId === user.uid);
  const isSitting = !!myCurrentSeat;

  // ─── Fetch initial messages ───────────────────────────────────────────────
  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('room_messages')
        .select('*')
        .eq('room_id', initialRoom.id)
        .order('timestamp', { ascending: true })
        .limit(100);
      if (data) setMessages(data.map(dbToMessage));
    };
    fetchMessages();
  }, [initialRoom.id]);

  // ─── Fetch online participants ─────────────────────────────────────────────
  useEffect(() => {
    const fetchParticipants = async () => {
      const { data } = await supabase
        .from('room_participants')
        .select('*')
        .eq('room_id', initialRoom.id);

      if (data) {
        setOnlineParticipants(data.map(p => ({
          roomId: p.room_id,
          userId: p.user_id,
          displayName: p.display_name,
          photoUrl: p.photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.user_id}`,
          joinedAt: p.joined_at,
        })));
      }
    };
    fetchParticipants();
  }, [initialRoom.id]);

  // ─── Track my presence in the room ───────────────────────────────────────
  useEffect(() => {
    // Check for ban
    if (room.bannedUserIds?.includes(user.uid)) {
      alert('You have been removed from this room.');
      onClose();
      return;
    }

    // Join room_participants
    const joinRoom = async () => {
      await supabase.from('room_participants').upsert({
        room_id: initialRoom.id,
        user_id: user.uid,
        display_name: user.displayName,
        photo_url: user.photoURL,
        joined_at: new Date().toISOString(),
      }, { onConflict: 'room_id,user_id' });
    };
    joinRoom();

    // Leave room on unmount
    return () => {
      supabase.from('room_participants').delete()
        .eq('room_id', initialRoom.id)
        .eq('user_id', user.uid)
        .then(() => {});
    };
  }, [initialRoom.id, user.uid]);

  // ─── Realtime subscriptions ───────────────────────────────────────────────
  useEffect(() => {
    // 1. Room updates (seats, lock, bans)
    const roomChannel = supabase
      .channel(`room-detail-${initialRoom.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${initialRoom.id}`,
      }, (payload) => {
        const r = payload.new as any;
        setRoom({
          id: r.id,
          numericId: r.numeric_id,
          name: r.name,
          ownerId: r.owner_id,
          admins: r.admins || [],
          seats: r.seats || [],
          createdAt: r.created_at,
          participantCount: r.participant_count || 0,
          description: r.description,
          avatarUrl: r.avatar_url,
          isLocked: r.is_locked,
          bannedUserIds: r.banned_user_ids || [],
          typingStatus: r.typing_status || {},
        });
        // Check ban in real-time
        if ((r.banned_user_ids || []).includes(user.uid)) {
          alert('You have been removed from this room.');
          onClose();
        }
      })
      // 2. Room messages (new messages)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'room_messages',
        filter: `room_id=eq.${initialRoom.id}`,
      }, (payload) => {
        setMessages(prev => [...prev, dbToMessage(payload.new as any)]);
      })
      // 3. Room participants (online users)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'room_participants',
        filter: `room_id=eq.${initialRoom.id}`,
      }, (payload) => {
        const p = payload.new as any;
        setOnlineParticipants(prev => {
          if (prev.some(x => x.userId === p.user_id)) return prev;
          return [...prev, {
            roomId: p.room_id,
            userId: p.user_id,
            displayName: p.display_name,
            photoUrl: p.photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.user_id}`,
            joinedAt: p.joined_at,
          }];
        });
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'room_participants',
        filter: `room_id=eq.${initialRoom.id}`,
      }, (payload) => {
        const p = payload.old as any;
        setOnlineParticipants(prev => prev.filter(x => x.userId !== p.user_id));
      })
      .subscribe();

    return () => { supabase.removeChannel(roomChannel); };
  }, [initialRoom.id, user.uid]);

  // ─── Typing status ────────────────────────────────────────────────────────
  useEffect(() => {
    if (room.typingStatus) {
      setTypingUsers(
        Object.entries(room.typingStatus)
          .filter(([uid, isTyping]) => isTyping && uid !== user.uid)
          .map(([uid]) => {
            const p = onlineParticipants.find(x => x.userId === uid);
            return p?.displayName || 'Someone';
          })
      );
    }
  }, [room.typingStatus, user.uid, onlineParticipants]);

  // ─── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Update typing status ──────────────────────────────────────────────────
  const updateTyping = useCallback(async (isTyping: boolean) => {
    await supabase.from('rooms').update({
      typing_status: { ...room.typingStatus, [user.uid]: isTyping },
    }).eq('id', room.id);
  }, [room.id, room.typingStatus, user.uid]);

  const handleInputChange = (value: string) => {
    setNewMessage(value);
    // Mention search
    const lastAt = value.lastIndexOf('@');
    if (lastAt !== -1 && (lastAt === 0 || value[lastAt - 1] === ' ')) {
      setMentionSearch(value.slice(lastAt + 1));
    } else {
      setMentionSearch(null);
    }
    // Typing indicator
    updateTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => updateTyping(false), 3000);
  };

  // ─── Send message ──────────────────────────────────────────────────────────
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = newMessage.trim();
    if (!text) return;

    const mentions = text.match(/@(\w+)/g)?.map(m => m.slice(1)) || [];

    const { error } = await supabase.from('room_messages').insert({
      room_id: room.id,
      sender_id: user.uid,
      sender_name: user.displayName,
      sender_avatar: user.photoURL,
      text,
      timestamp: new Date().toISOString(),
      mentions,
    });

    if (error) { handleSupabaseError(error, 'send-room-message'); return; }
    setNewMessage('');
    setMentionSearch(null);
    updateTyping(false);
  };

  // ─── Seat operations ───────────────────────────────────────────────────────
  const updateSeats = async (newSeats: Seat[]) => {
    const { error } = await supabase.from('rooms').update({
      seats: newSeats,
      participant_count: newSeats.filter(s => s.userId).length,
    }).eq('id', room.id);
    if (error) handleSupabaseError(error, 'update-seats');
  };

  const handleSit = (seatId: number) => {
    if (isSitting) return; // Already seated
    const newSeats = room.seats.map(s => {
      if (s.id !== seatId) return s;
      const canSit =
        (!s.userId && !s.isLocked) &&
        (!s.offeredToId || s.offeredToId === user.uid || isAdmin);
      if (!canSit) return s;
      return {
        ...s,
        userId: user.uid,
        userName: user.displayName,
        userAvatar: user.photoURL,
        isMuted: false,
        offeredToId: null,
        isVideoOn: false,
      };
    });
    updateSeats(newSeats);
  };

  const handleLeaveSeat = () => {
    const newSeats = room.seats.map(s =>
      s.userId === user.uid
        ? { ...s, userId: null, userName: null, userAvatar: null, isMuted: false, isVideoOn: false }
        : s
    );
    updateSeats(newSeats);
  };

  const handleToggleMute = (seatId: number) => {
    const newSeats = room.seats.map(s => {
      if (s.id !== seatId || !s.userId) return s;
      const canMute = s.userId === user.uid || (isAdmin && s.userId !== room.ownerId);
      if (!canMute) return s;
      return { ...s, isMuted: !s.isMuted };
    });
    updateSeats(newSeats);
  };

  const handleToggleCamera = (seatId: number) => {
    const newSeats = room.seats.map(s =>
      s.id === seatId && s.userId === user.uid
        ? { ...s, isVideoOn: !s.isVideoOn }
        : s
    );
    updateSeats(newSeats);
  };

  const handleToggleLock = (seatId: number) => {
    if (!isOwner) return;
    const newSeats = room.seats.map(s => {
      if (s.id !== seatId) return s;
      const locking = !s.isLocked;
      return {
        ...s,
        isLocked: locking,
        ...(locking ? { userId: null, userName: null, userAvatar: null, offeredToId: null, isVideoOn: false } : {}),
      };
    });
    updateSeats(newSeats);
  };

  const handleRemoveFromSeat = (seatId: number) => {
    if (!isAdmin) return;
    const newSeats = room.seats.map(s =>
      s.id === seatId
        ? { ...s, userId: null, userName: null, userAvatar: null, isMuted: false, isVideoOn: false }
        : s
    );
    updateSeats(newSeats);
  };

  const handleBanUser = async (userId: string) => {
    if (!isOwner) return;
    const newSeats = room.seats.map(s =>
      s.userId === userId ? { ...s, userId: null, userName: null, userAvatar: null } : s
    );
    const { error } = await supabase.from('rooms').update({
      seats: newSeats,
      banned_user_ids: [...(room.bannedUserIds || []), userId],
    }).eq('id', room.id);
    if (error) handleSupabaseError(error, 'ban-user');
  };

  const handleMakeAdmin = async (userId: string) => {
    if (!isOwner) return;
    const isCurrentAdmin = room.admins.includes(userId);
    const newAdmins = isCurrentAdmin
      ? room.admins.filter(id => id !== userId)
      : [...room.admins, userId];

    await supabase.from('rooms').update({ admins: newAdmins }).eq('id', room.id);
  };

  const handleOfferSeat = async (seatId: number, targetUserId: string) => {
    if (!isOwner) return;
    const newSeats = room.seats.map(s =>
      s.id === seatId ? { ...s, offeredToId: targetUserId, isLocked: false } : s
    );
    updateSeats(newSeats);
    setShowOfferModal(null);
  };

  const toggleRoomLock = async () => {
    if (!isOwner) return;
    await supabase.from('rooms').update({ is_locked: !room.isLocked }).eq('id', room.id);
  };

  const copyRoomId = async () => {
    const shareText = `Join my ViaaChat room! Room ID: ${room.numericId}`;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleShareRoom = async () => {
    const shareData = {
      title: `ViaaChat Room: ${room.name}`,
      text: `Join my live room on ViaaChat! Room ID: ${room.numericId}`,
      url: window.location.origin,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      setShowShareModal(true);
    }
  };

  // Mention autocomplete filter
  const mentionCandidates = mentionSearch !== null
    ? onlineParticipants
        .filter(p => p.userId !== user.uid && p.displayName.toLowerCase().includes(mentionSearch.toLowerCase()))
        .slice(0, 5)
    : [];

  const insertMention = (name: string) => {
    const lastAt = newMessage.lastIndexOf('@');
    setNewMessage(newMessage.slice(0, lastAt) + `@${name} `);
    setMentionSearch(null);
    inputRef.current?.focus();
  };

  // Online users NOT seated (for offer modal)
  const unseatedOnlineUsers = onlineParticipants.filter(p => {
    if (p.userId === user.uid) return false;
    return !room.seats.some(s => s.userId === p.userId);
  });

  return (
    <div className="fixed inset-0 z-[150] bg-gray-950 flex flex-col overflow-hidden">
      {/* ─── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="relative flex-shrink-0 px-4 pt-10 pb-3 flex items-center justify-between bg-gradient-to-b from-gray-950 to-gray-950/0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 text-white/50 hover:text-white transition-colors active:scale-90">
            <X size={22} />
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-white truncate max-w-[160px]">{room.name}</h2>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Room #{room.numericId}</span>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-bold text-emerald-400">{onlineParticipants.length} online</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isOwner && (
            <button
              onClick={toggleRoomLock}
              className={`p-2.5 rounded-xl transition-all active:scale-90 ${room.isLocked ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30' : 'bg-white/10 text-white/70 hover:bg-white/15'}`}
              title={room.isLocked ? 'Unlock Room' : 'Lock Room'}
            >
              {room.isLocked ? <Lock size={18} /> : <Unlock size={18} />}
            </button>
          )}
          <button
            onClick={() => setShowInvite(true)}
            className="p-2.5 bg-white/10 text-white/70 rounded-xl hover:bg-white/15 transition-all"
          >
            <UserPlus size={18} />
          </button>
          <button
            onClick={handleShareRoom}
            className="p-2.5 bg-white/10 text-white/70 rounded-xl hover:bg-white/15 transition-all"
          >
            <Share2 size={18} />
          </button>
        </div>
      </header>

      {/* ─── SEATS SECTION (upper ~44% of screen) ───────────────────────────── */}
      <div className="flex-shrink-0 h-[44%] flex flex-col items-center justify-start pt-2 pb-3 px-4 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 via-transparent to-gray-950/80 pointer-events-none" />

        {/* Seats grid 5x2 */}
        <div className="relative z-10 grid grid-cols-5 gap-x-3 gap-y-4 w-full max-w-xs">
          {room.seats.map(seat => (
            <SeatCard
              key={seat.id}
              seat={seat}
              myId={user.uid}
              ownerId={room.ownerId}
              isAdmin={isAdmin}
              isOwner={isOwner}
              admins={room.admins || []}
              onSit={handleSit}
              onToggleMute={handleToggleMute}
              onToggleCamera={handleToggleCamera}
              onToggleLock={handleToggleLock}
              onRemove={handleRemoveFromSeat}
              onBan={handleBanUser}
              onMakeAdmin={handleMakeAdmin}
              onOfferSeat={(seatId) => setShowOfferModal({ seatId })}
              onSendFriendRequest={onSendFriendRequest}
            />
          ))}
        </div>

        {/* Leave seat / My controls */}
        {isSitting && (
          <div className="relative z-10 flex items-center gap-2 mt-3">
            <button
              onClick={() => handleToggleMute(myCurrentSeat!.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-90 ${myCurrentSeat?.isMuted ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}
            >
              {myCurrentSeat?.isMuted ? <MicOff size={12} /> : <Mic size={12} />}
              {myCurrentSeat?.isMuted ? 'Unmute' : 'Muted? Unmute'}
            </button>
            <button
              onClick={handleLeaveSeat}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-rose-500/20 active:scale-90"
            >
              <X size={12} />
              Leave
            </button>
          </div>
        )}
      </div>

      {/* ─── CHAT SECTION ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-gray-900/80 border-t border-white/5 overflow-hidden">
        {/* Chat header bar */}
        <div className="flex-shrink-0 px-4 py-2 flex items-center justify-between border-b border-white/5 bg-gray-900/50">
          <div className="flex items-center gap-2">
            <MessageSquare size={12} className="text-emerald-500" />
            <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">Room Chat</span>
            {/* E2EE badge */}
            <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 rounded-full border border-emerald-500/20">
              <Shield size={8} className="text-emerald-500" />
              <span className="text-[7px] font-black text-emerald-500 uppercase tracking-wider">E2EE</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Radio size={8} className="text-white/20" />
            <span className="text-[8px] text-white/20 font-bold">{messages.length} msgs</span>
          </div>
        </div>

        {/* Messages list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 no-scrollbar">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center opacity-20 select-none">
              <MessageSquare size={40} className="text-white mb-3" />
              <p className="text-xs font-black text-white uppercase tracking-widest">Start the conversation</p>
            </div>
          ) : (
            messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} isMe={msg.senderId === user.uid} />
            ))
          )}
          {/* Typing indicator */}
          {typingUsers.length > 0 && (
            <div className="self-start flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-2xl rounded-bl-none">
              <TypingDots />
              <span className="text-[10px] text-white/50 font-medium">
                {typingUsers.slice(0, 2).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing
              </span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Mention autocomplete */}
        {mentionCandidates.length > 0 && (
          <div className="mx-4 mb-1 bg-gray-800 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
            {mentionCandidates.map(p => (
              <button
                key={p.userId}
                onClick={() => insertMention(p.displayName)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-white/10 transition-colors"
              >
                <img src={p.photoUrl} className="w-7 h-7 rounded-lg object-cover" alt="" />
                <span className="text-sm font-bold text-white">{p.displayName}</span>
                <AtSign size={12} className="text-emerald-500 ml-auto" />
              </button>
            ))}
          </div>
        )}

        {/* ─── INPUT BAR ─────────────────────────────────────────────────── */}
        <form
          onSubmit={handleSendMessage}
          className="flex-shrink-0 p-3 bg-gray-950 border-t border-white/5 flex items-center gap-2"
        >
          <div className="flex-1 flex items-center bg-gray-800/80 rounded-2xl border border-white/5 focus-within:border-emerald-500/40 transition-all px-1">
            <button
              type="button"
              onClick={() => {
                setNewMessage(prev => prev + '@');
                setMentionSearch('');
                inputRef.current?.focus();
              }}
              className="p-2 text-white/30 hover:text-emerald-400 transition-colors"
            >
              <AtSign size={16} />
            </button>
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder="Say something... use @ to tag"
              className="flex-1 bg-transparent text-white text-sm py-2.5 px-1 focus:outline-none placeholder-white/20"
            />
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-30 disabled:shadow-none active:scale-90"
          >
            <Send size={18} />
          </button>
        </form>
      </div>

      {/* ─── INVITE MODAL ───────────────────────────────────────────────────── */}
      {showInvite && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowInvite(false)} />
          <div className="relative w-full max-w-md bg-gray-900 rounded-t-[2.5rem] border-t border-white/10 shadow-2xl p-6 animate-slide-up max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-black text-white">Invite Friends</h3>
                <p className="text-xs text-white/30 mt-0.5">Share Room #{room.numericId}</p>
              </div>
              <button onClick={() => setShowInvite(false)} className="p-2 text-white/40 hover:text-white transition-colors">
                <X size={22} />
              </button>
            </div>

            {/* Copy room ID */}
            <button
              onClick={copyRoomId}
              className="flex items-center justify-between w-full bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4 mb-4 hover:bg-emerald-500/15 transition-all active:scale-95"
            >
              <div className="text-left">
                <p className="text-xs text-white/50 font-bold uppercase tracking-wider">Room ID</p>
                <p className="text-2xl font-black text-white mt-0.5">{room.numericId}</p>
              </div>
              <div className={`p-3 rounded-xl transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/60'}`}>
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </div>
            </button>

            {/* Contact list to invite */}
            <div className="overflow-y-auto flex-1 space-y-2 no-scrollbar">
              <p className="text-[10px] text-white/30 font-black uppercase tracking-widest mb-2">Your Contacts</p>
              {contacts.length === 0 && (
                <p className="text-center text-white/20 py-6 text-sm">No contacts yet</p>
              )}
              {contacts.map(contact => (
                <div key={contact.id} className="flex items-center gap-3 px-1">
                  <img src={contact.avatarUrl} className="w-10 h-10 rounded-xl object-cover" alt="" referrerPolicy="no-referrer" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{contact.name}</p>
                    <p className="text-[10px] text-white/30">Tap to notify</p>
                  </div>
                  <button
                    onClick={async () => {
                      // Send a chat message with invite
                      const { data: chatData } = await supabase
                        .from('chats')
                        .select('id')
                        .contains('participants', [user.uid, contact.id])
                        .eq('is_group', false)
                        .single();

                      if (chatData) {
                        await supabase.from('chat_messages').insert({
                          chat_id: chatData.id,
                          sender_id: user.uid,
                          sender_name: user.displayName,
                          text: `🎙️ Join my live ViaaChat room "${room.name}"! Room ID: ${room.numericId}`,
                          timestamp: new Date().toISOString(),
                          type: 'text',
                        });
                        alert(`Invite sent to ${contact.name}!`);
                      } else {
                        copyRoomId();
                        alert(`Copied room ID! Share Room #${room.numericId} with ${contact.name}`);
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/30 transition-all"
                  >
                    Invite
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── OFFER SEAT MODAL ───────────────────────────────────────────────── */}
      {showOfferModal && (
        <div className="fixed inset-0 z-[250] flex items-end justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowOfferModal(null)} />
          <div className="relative w-full max-w-md bg-gray-900 rounded-t-[2.5rem] border-t border-white/10 shadow-2xl p-6 animate-slide-up max-h-[60vh] flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-black text-white">Offer Seat {showOfferModal.seatId + 1}</h3>
                <p className="text-xs text-white/30 mt-0.5">Select an online user</p>
              </div>
              <button onClick={() => setShowOfferModal(null)} className="p-2 text-white/40 hover:text-white transition-colors">
                <X size={22} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-2 no-scrollbar">
              {unseatedOnlineUsers.length === 0 ? (
                <div className="text-center py-8">
                  <Users size={32} className="text-white/10 mx-auto mb-3" />
                  <p className="text-white/30 text-sm">No one available to offer a seat to.</p>
                  <p className="text-white/20 text-xs mt-1">Users must be in the room to receive offers.</p>
                </div>
              ) : (
                unseatedOnlineUsers.map(p => (
                  <button
                    key={p.userId}
                    onClick={() => handleOfferSeat(showOfferModal.seatId, p.userId)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 bg-white/5 rounded-2xl hover:bg-emerald-500/10 hover:border-emerald-500/20 border border-transparent transition-all active:scale-98 group"
                  >
                    <img src={p.photoUrl} className="w-11 h-11 rounded-xl object-cover" alt="" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-bold text-white truncate">{p.displayName}</p>
                      <p className="text-[10px] text-emerald-400 font-bold">● Online in room</p>
                    </div>
                    <UserCheck size={18} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-all" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── SHARE MODAL ────────────────────────────────────────────────────── */}
      {showShareModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowShareModal(false)} />
          <div className="relative bg-gray-900 rounded-3xl border border-white/10 shadow-2xl p-8 w-full max-w-sm animate-scale-in">
            <h3 className="text-xl font-black text-white mb-1">Share Room</h3>
            <p className="text-xs text-white/40 mb-6">Anyone with this ID can join your room</p>
            <div className="bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between px-5 py-4 mb-4">
              <div>
                <p className="text-xs text-white/30 font-bold uppercase tracking-wider">Room ID</p>
                <p className="text-3xl font-black text-white">{room.numericId}</p>
              </div>
              <button
                onClick={copyRoomId}
                className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-90 ${copied ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                {copied ? '✓ Copied' : 'Copy ID'}
              </button>
            </div>
            <button onClick={() => setShowShareModal(false)} className="w-full py-3 bg-white/5 rounded-2xl text-white/50 font-bold hover:bg-white/10 transition-colors">
              Done
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-up { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-up { animation: slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes scale-in { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-scale-in { animation: scale-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};
