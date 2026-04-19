
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Info, Smile, Send, Paperclip, FileText, Camera as CameraIcon,
  Image as ImageIcon, Headphones, MapPin, User as UserIcon, Search, Settings, X,
  Pin, Trash2, Shield, Bell, BellOff, CornerUpLeft, Edit3, MoreVertical,
  Copy, Forward, Check, Mic, MicOff, Video, Phone, Play, Pause,
} from 'lucide-react';
import { supabase, handleSupabaseError } from '../supabase';
import type { Group, Contact, Message } from '../types';
import { UserProfileModal } from './UserProfileModal';

interface GroupDetailScreenProps {
  group: Group;
  contacts: Contact[];
  onClose: () => void;
  onSendMessage: (groupId: string, messageText: string) => void;
  onInitiateCall: (contact: Contact, isVideo: boolean) => void;
  onInitiateChat: (contact: Contact) => void;
  onUpdateGroup: (groupId: string, updates: Partial<Group>) => void;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
const Toast: React.FC<{ message: string; type?: 'success' | 'error' | 'info'; onDone: () => void }> = ({ message, type = 'info', onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  const color = type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-slate-800';
  return (
    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[999] ${color} text-white px-4 py-2.5 rounded-2xl shadow-2xl text-sm font-bold animate-fade-in-up max-w-[90vw] text-center`}>
      {message}
    </div>
  );
};

// ─── Audio player ─────────────────────────────────────────────────────────────
const AudioPlayer: React.FC<{ src: string; isMe: boolean }> = ({ src, isMe }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const togglePlay = () => {
    if (!audioRef.current) return;
    isPlaying ? audioRef.current.pause() : audioRef.current.play().catch(() => {});
    setIsPlaying(p => !p);
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(Math.floor(s) % 60).toString().padStart(2, '0')}`;
  return (
    <div className={`flex items-center gap-2 min-w-[150px] ${isMe ? 'text-white' : 'text-gray-700'}`}>
      <audio ref={audioRef} src={src}
        onTimeUpdate={e => setProgress((e.currentTarget.currentTime / (e.currentTarget.duration || 1)) * 100)}
        onDurationChange={e => setDuration(e.currentTarget.duration)}
        onEnded={() => { setIsPlaying(false); setProgress(0); }} />
      <button onClick={togglePlay} className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isMe ? 'bg-white/20' : 'bg-emerald-100 text-emerald-700'}`}>
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="flex-1">
        <div className={`h-1.5 rounded-full ${isMe ? 'bg-white/20' : 'bg-gray-200'} overflow-hidden`}>
          <div className={`h-full rounded-full ${isMe ? 'bg-white' : 'bg-emerald-500'}`} style={{ width: `${progress}%` }} />
        </div>
        <span className={`text-[10px] font-bold mt-0.5 block ${isMe ? 'text-white/60' : 'text-gray-400'}`}>{fmt(duration)}</span>
      </div>
      <Mic size={12} className={isMe ? 'text-white/40' : 'text-gray-300'} />
    </div>
  );
};

// ─── DB mapper ────────────────────────────────────────────────────────────────
const dbToMessage = (row: any): Message => ({
  id: row.id,
  text: row.text,
  senderId: row.sender_id,
  senderName: row.sender_name,
  timestamp: row.timestamp,
  type: row.type || 'text',
  isPinned: row.is_pinned || false,
  isRead: false,
  reactions: row.reactions || {},
  replyToId: row.reply_to?.id || null,
  replyToText: row.reply_to?.text || null,
  replyToSender: row.reply_to?.sender || null,
});

// ─── Member item ──────────────────────────────────────────────────────────────
const MemberItem: React.FC<{
  member: Contact;
  isAdmin: boolean;
  isCurrentUserAdmin: boolean;
  onRemove: () => void;
  onClick: () => void;
}> = ({ member, isAdmin, isCurrentUserAdmin, onRemove, onClick }) => (
  <div className="flex items-center p-3 hover:bg-gray-50 cursor-pointer transition-colors group">
    <div onClick={onClick} className="flex flex-1 items-center min-w-0">
      <img src={member.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.id}`} alt={member.name} className="w-10 h-10 rounded-full mr-4 object-cover border border-gray-100" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 truncate">{member.name}</p>
          {isAdmin && (
            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded uppercase tracking-wider flex items-center gap-1">
              <Shield size={10} /> Admin
            </span>
          )}
        </div>
      </div>
    </div>
    {isCurrentUserAdmin && !isAdmin && (
      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
        title="Remove from group"
      >
        <Trash2 size={18} />
      </button>
    )}
  </div>
);

// ─── Snapchat typing indicator ────────────────────────────────────────────────
const AvatarTyping: React.FC<{ avatarUrl: string; name: string }> = ({ avatarUrl, name }) => (
  <div className="flex items-end gap-1.5" style={{ animation: 'scPeekIn 0.32s cubic-bezier(0.34,1.56,0.64,1) both' }}>
    <div className="relative flex-shrink-0 w-8 h-8" style={{ animation: 'scBreathe 3.2s ease-in-out infinite' }}>
      <img src={avatarUrl} alt={name} className="w-8 h-8 rounded-full object-cover shadow-md" referrerPolicy="no-referrer"
        style={{ border: '2px solid #fff' }} />
    </div>
    <div className="flex flex-col items-start mb-0.5">
      <div className="flex items-center gap-[4px] bg-white px-3 py-2 shadow-md" style={{ borderRadius: '18px 18px 18px 5px', border: '1px solid rgba(0,0,0,0.05)' }}>
        {[0, 1, 2].map(i => (
          <span key={i} className="block rounded-full" style={{ width: 6, height: 6, background: '#aeb0b8', animation: 'scDot 1.4s ease-in-out infinite', animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
    </div>
    <style>{`
      @keyframes scPeekIn { 0% { opacity:0; transform:translateY(14px) scale(0.88); } 100% { opacity:1; transform:translateY(0) scale(1); } }
      @keyframes scBreathe { 0%,100% { transform:scale(1); } 50% { transform:scale(1.05); } }
      @keyframes scDot { 0%,60%,100% { transform:scale(0.72); opacity:0.35; } 30% { transform:scale(1.28); opacity:1; } }
    `}</style>
  </div>
);

// ─── Message Bubble ───────────────────────────────────────────────────────────
const MessageBubble: React.FC<{
  message: Message;
  myId: string;
  onPin: () => void;
  isPinned: boolean;
  onReact: (emoji: string) => void;
  onReply: (msg: Message) => void;
  onDelete: () => void;
  onEdit: () => void;
  onForward: (msg: Message) => void;
}> = ({ message, myId, onPin, isPinned, onReact, onReply, onDelete, onEdit, onForward }) => {
  const isYou = message.senderId === myId;
  const [showReactions, setShowReactions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Swipe-to-reply
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [swipeX, setSwipeX] = useState(0);
  const SWIPE_THRESHOLD = 60;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setSwipeX(0);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dy) > Math.abs(dx) + 6) return;
    if (dx < 4) { setSwipeX(0); return; }
    setSwipeX(Math.min(80, dx));
  };
  const handleTouchEnd = () => {
    if (swipeX >= SWIPE_THRESHOLD) { onReply(message); try { navigator.vibrate(35); } catch {} }
    setSwipeX(0);
  };

  const quickReactions = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
  const isImage = message.type === 'image';
  const isAudio = message.type === 'audio';

  const handleCopy = () => {
    if (message.text && !isImage && !isAudio) {
      navigator.clipboard.writeText(message.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); setShowMenu(false); });
    }
  };

  const formatTime = (ts: any) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  return (
    <div className={`flex ${isYou ? 'justify-end' : 'justify-start'} mb-3 group relative`}>
      {/* Swipe ring */}
      {swipeX > 6 && (
        <div className="absolute left-0 top-1/2 z-10 pointer-events-none"
          style={{ transform: `translateY(-50%) scale(${0.5 + 0.5 * Math.min(1, swipeX / SWIPE_THRESHOLD)})`, opacity: Math.min(1, swipeX / SWIPE_THRESHOLD) }}>
          <div className="w-9 h-9 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center shadow-sm">
            <CornerUpLeft size={17} className="text-emerald-500" />
          </div>
        </div>
      )}

      <div
        className="relative max-w-[80%]"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${swipeX}px)`, transition: swipeX === 0 ? 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1)' : 'none', willChange: 'transform' }}
      >
        {/* Reply preview */}
        {message.replyToText && (
          <div className={`flex flex-col mb-1.5 px-3 py-1.5 rounded-xl border-l-[3px] border-emerald-400 ${isYou ? 'bg-emerald-50/80' : 'bg-gray-100'}`}>
            <span className="text-[10px] font-black text-emerald-500 truncate">{message.replyToSender}</span>
            <span className="text-[11px] text-gray-500 leading-snug line-clamp-2">{message.replyToText}</span>
          </div>
        )}

        <div
          className={`rounded-2xl ${isImage ? 'p-0 overflow-hidden' : 'px-4 py-2'} shadow-sm ${
            isYou ? 'rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none'
          }`}
          style={isYou ? { backgroundColor: '#e2fce5', color: '#1a1a1a' } : undefined}
          onDoubleClick={() => setShowReactions(true)}
          onContextMenu={e => { e.preventDefault(); setShowMenu(true); }}
        >
          {!isYou && <p className="text-[10px] text-emerald-600 font-bold mb-1 opacity-70 uppercase tracking-wider">{message.senderName}</p>}

          {isImage ? (
            <img src={message.text} alt="Image" className="max-w-[240px] max-h-[320px] object-cover rounded-2xl" referrerPolicy="no-referrer" />
          ) : isAudio ? (
            <AudioPlayer src={message.text} isMe={isYou} />
          ) : (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{message.text}</p>
          )}

          {isPinned && <span className={`text-[9px] font-black uppercase tracking-widest ${isYou ? 'text-gray-500' : 'text-emerald-500'}`}>📌 Pinned</span>}

          <div className={`flex items-center justify-end gap-1 mt-1 ${isImage ? 'absolute bottom-2 right-2 bg-black/30 px-1.5 py-0.5 rounded-full' : ''}`}>
            <p className={`text-[10px] opacity-60 ${isImage ? 'text-white' : 'text-gray-500'}`}>{formatTime(message.timestamp)}</p>
          </div>
        </div>

        {/* Reactions */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className={`absolute -bottom-3 ${isYou ? 'right-2' : 'left-2'} flex flex-wrap gap-1 z-10`}>
            {Object.entries(message.reactions as { [key: string]: string[] }).map(([emoji, uids]) =>
              uids.length > 0 && (
                <button key={emoji} onClick={() => onReact(emoji)}
                  className={`flex items-center gap-1 bg-white border border-gray-100 rounded-full px-1.5 py-0.5 shadow-sm text-[12px] hover:bg-gray-50 ${uids.includes(myId) ? 'border-emerald-200 bg-emerald-50' : ''}`}>
                  <span>{emoji}</span><span className="text-gray-500 font-medium">{uids.length}</span>
                </button>
              )
            )}
          </div>
        )}

        {/* Hover actions */}
        <div className={`absolute ${isYou ? '-left-10' : '-right-10'} top-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-1`}>
          <button onClick={() => setShowReactions(!showReactions)} className="p-1.5 bg-white rounded-full shadow-md text-gray-400 hover:text-emerald-600 border border-gray-100"><Smile size={14} /></button>
          <button onClick={() => setShowMenu(true)} className="p-1.5 bg-white rounded-full shadow-md text-gray-400 hover:text-gray-600 border border-gray-100"><MoreVertical size={14} /></button>
        </div>

        {/* Reaction picker */}
        {showReactions && (
          <div className={`absolute ${isYou ? 'right-0' : 'left-0'} bottom-full mb-2 bg-white rounded-full shadow-xl border border-gray-100 p-1 flex gap-1 z-20 animate-fade-in-up`}>
            {quickReactions.map(emoji => (
              <button key={emoji} onClick={() => { onReact(emoji); setShowReactions(false); }} className="hover:scale-125 transition-transform p-1 text-lg">{emoji}</button>
            ))}
          </div>
        )}

        {/* Context menu */}
        {showMenu && (
          <div ref={menuRef} className={`absolute ${isYou ? 'right-0' : 'left-0'} bottom-full mb-2 z-30 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden min-w-[160px]`}>
            <button onClick={() => { onReply(message); setShowMenu(false); }}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 font-medium">
              <CornerUpLeft size={14} className="text-emerald-500" /> Reply
            </button>
            {!isImage && !isAudio && (
              <button onClick={handleCopy}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 font-medium">
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-gray-400" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
            <button onClick={() => { onForward(message); setShowMenu(false); }}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 font-medium">
              <Forward size={14} className="text-gray-400" /> Forward
            </button>
            <button onClick={() => { onPin(); setShowMenu(false); }}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 font-medium">
              📌 {isPinned ? 'Unpin' : 'Pin'}
            </button>
            {isYou && !isImage && !isAudio && (
              <button onClick={() => { onEdit(); setShowMenu(false); }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 font-medium">
                <Edit3 size={14} className="text-gray-400" /> Edit
              </button>
            )}
            {isYou && (
              <button onClick={() => { onDelete(); setShowMenu(false); }}
                className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 flex items-center gap-2.5 font-medium border-t border-gray-50">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Emoji set ────────────────────────────────────────────────────────────────
const categorizedEmojis: Record<string, string[]> = {
  '😀 Smileys': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😋','😛','😜','🤪','😎','😏','😒','😞','😢','😭','😤','😠','😡','🤯','😳','😱','😨','🤗','🤔','😶','😐','😑','😬','🙄','😮','🥱','😴'],
  '👋 People': ['👋','✋','💪','👏','🙌','🙏','✍️','💅','👍','👎','✊','👊','🤝','👶','👦','👧','🧑','👨','👩'],
  '🐶 Animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐸','🐵','🐔','🐧','🦆','🦉','🐺','🦄'],
  '🍔 Food': ['🍏','🍎','🍊','🍋','🍌','🍇','🍓','🍒','🍑','🥑','🌽','🥕','🍕','🍔','🍟','🌮','🍜','🍣','🍦','🍰','🎂','🍭','☕','🍺'],
  '❤️ Symbols': ['❤️','🧡','💛','💚','💙','💜','🖤','💔','💕','💞','💓','💗','💖','💘','💝','☮️','✔️','❌','⚠️','🚫','💯','🔥','✨','🎉'],
};

// ─── Forward modal ────────────────────────────────────────────────────────────
const ForwardModal: React.FC<{
  message: Message;
  contacts: Contact[];
  myId: string;
  myName: string;
  groupId: string;
  onClose: () => void;
  onForwarded: () => void;
}> = ({ message, contacts, myId, myName, groupId, onClose, onForwarded }) => {
  const [sending, setSending] = useState<string | null>(null);

  const forward = async (contact: Contact) => {
    setSending(contact.id);
    // Find or create a DM chat with this contact
    const { data: existing } = await supabase
      .from('chats')
      .select('id')
      .contains('participants', [myId, contact.id])
      .eq('is_group', false)
      .single();

    let chatId = existing?.id;
    if (!chatId) {
      const { data: newChat } = await supabase.from('chats').insert({
        name: contact.name,
        avatar_url: contact.avatarUrl,
        participants: [myId, contact.id],
        is_group: false,
        last_message: '',
        last_message_time: new Date().toISOString(),
        unread_count: 0,
      }).select('id').single();
      chatId = newChat?.id;
    }
    if (!chatId) { setSending(null); return; }

    await supabase.from('chat_messages').insert({
      chat_id: chatId,
      text: message.text,
      sender_id: myId,
      sender_name: myName,
      timestamp: new Date().toISOString(),
      type: message.type || 'text',
    });
    setSending(null);
    onForwarded();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-t-3xl overflow-hidden shadow-2xl animate-slide-up">
        <div className="p-4 flex items-center justify-between border-b">
          <h3 className="text-base font-black text-gray-800">Forward to</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
          {contacts.map(c => (
            <button key={c.id} onClick={() => forward(c)} disabled={sending === c.id}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors">
              <img src={c.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.id}`}
                alt={c.name} className="w-10 h-10 rounded-full object-cover" />
              <span className="text-sm font-semibold text-gray-800 flex-1 text-left">{c.name}</span>
              {sending === c.id
                ? <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                : <Forward size={16} className="text-gray-300" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export const GroupDetailScreen: React.FC<GroupDetailScreenProps> = ({
  group, contacts, onClose, onSendMessage, onInitiateCall, onInitiateChat, onUpdateGroup,
}) => {
  const [isInfoVisible, setIsInfoVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<Contact | null>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [myId, setMyId] = React.useState('');
  const [myName, setMyName] = React.useState('Me');
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setMyId(data.user.id);
        setMyName(data.user.user_metadata?.full_name || data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'Me');
      }
    });
  }, []);

  const isAdmin = group.admins?.includes(myId) || group.createdBy === myId;

  const filteredMembers = (group.participants || []).filter(uid => {
    const member = contacts.find(c => c.id === uid);
    if (!member) return false;
    return member.name.toLowerCase().includes(memberSearchQuery.toLowerCase());
  });

  const pinnedMessages = messages.filter(m => group.pinnedMessageIds?.includes(m.id));

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => setToast({ msg, type });

  // ── Fetch + subscribe ──────────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_id', group.id)
      .order('timestamp', { ascending: true });
    if (data) setMessages(data.map(row => dbToMessage(row)));
  }, [group.id]);

  useEffect(() => {
    fetchMessages();
    const channel = supabase
      .channel(`group-messages-${group.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${group.id}` }, (payload) => {
        const newMsg = dbToMessage(payload.new as any);
        setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${group.id}` }, (payload) => {
        setMessages(prev => prev.map(m => m.id === (payload.new as any).id ? dbToMessage(payload.new as any) : m));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${group.id}` }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [group.id, fetchMessages]);

  // ── Typing indicator ───────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel(`group-typing-${group.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats', filter: `id=eq.${group.id}` }, (payload) => {
        const ts = (payload.new as any).typing_status || {};
        const typing = Object.entries(ts).filter(([uid, v]) => v && uid !== myId).map(([uid]) => uid);
        setTypingUsers(typing);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [group.id, myId]);

  const updateTypingStatus = useCallback(async (isTyping: boolean) => {
    if (!myId) return;
    await supabase.from('chats').update({ typing_status: { ...(group.typingStatus || {}), [myId]: isTyping } }).eq('id', group.id);
  }, [group.id, group.typingStatus, myId]);

  const handleMessageChange = (value: string) => {
    setMessage(value);
    if (value.trim()) {
      updateTypingStatus(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => updateTypingStatus(false), 3000);
    } else {
      updateTypingStatus(false);
    }
  };

  useEffect(() => {
    supabase.from('chats').update({ unread_count: 0 }).eq('id', group.id);
  }, [group.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = message.trim();
    if (!text && !editingMessage) return;

    if (editingMessage) {
      await supabase.from('chat_messages').update({ text: text + ' (edited)' }).eq('id', editingMessage.id);
      setEditingMessage(null);
    } else {
      const payload: Record<string, any> = {
        chat_id: group.id, text, sender_id: myId, sender_name: myName,
        timestamp: new Date().toISOString(), type: 'text',
      };
      if (replyTo) {
        payload.reply_to = { id: replyTo.id, text: replyTo.text.slice(0, 200), sender: replyTo.senderName };
      }
      const { error } = await supabase.from('chat_messages').insert(payload);
      if (!error) {
        await supabase.from('chats').update({ last_message: text, last_message_time: new Date().toISOString() }).eq('id', group.id);
      }
      setReplyTo(null);
    }
    setMessage('');
    setIsEmojiPickerOpen(false);
    updateTypingStatus(false);
  };

  // ── Delete message ─────────────────────────────────────────────────────────
  const handleDeleteMessage = async (messageId: string) => {
    const { error } = await supabase.from('chat_messages').delete().eq('id', messageId);
    if (error) showToast('Failed to delete', 'error'); else showToast('Deleted', 'success');
  };

  // ── Pin message ────────────────────────────────────────────────────────────
  const handlePinMessage = async (messageId: string) => {
    const isPinned = group.pinnedMessageIds?.includes(messageId);
    const newPinnedIds = isPinned
      ? (group.pinnedMessageIds || []).filter(id => id !== messageId)
      : [...(group.pinnedMessageIds || []), messageId];
    onUpdateGroup(group.id, { pinnedMessageIds: newPinnedIds });
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!isAdmin) return;
    const newParticipants = (group.participants || []).filter(id => id !== memberId);
    const newAdmins = (group.admins || []).filter(id => id !== memberId);
    onUpdateGroup(group.id, { participants: newParticipants, admins: newAdmins, memberCount: newParticipants.length });
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!myId) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    const currentReactions = { ...(msg.reactions || {}) };
    const uids: string[] = currentReactions[emoji] || [];
    const newUids = uids.includes(myId) ? uids.filter(id => id !== myId) : [...uids, myId];
    if (newUids.length === 0) delete currentReactions[emoji]; else currentReactions[emoji] = newUids;
    const { error } = await supabase.from('chat_messages').update({ reactions: currentReactions }).eq('id', messageId);
    if (error) handleSupabaseError(error, 'group-react');
  };

  // ── Image upload ───────────────────────────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !myId) return;
    setIsAttachmentMenuOpen(false);
    if (file.size > 5 * 1024 * 1024) { showToast('Image too large (max 5MB)', 'error'); return; }
    showToast('Sending image...', 'info');
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      const { error } = await supabase.from('chat_messages').insert({
        chat_id: group.id, text: base64, sender_id: myId, sender_name: myName,
        timestamp: new Date().toISOString(), type: 'image',
      });
      if (error) showToast('Failed to send image', 'error');
      else { await supabase.from('chats').update({ last_message: '📷 Photo', last_message_time: new Date().toISOString() }).eq('id', group.id); showToast('Sent!', 'success'); }
    };
    reader.readAsDataURL(file);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // ── Voice recording ────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          await supabase.from('chat_messages').insert({
            chat_id: group.id, text: reader.result as string, sender_id: myId, sender_name: myName,
            timestamp: new Date().toISOString(), type: 'audio',
          });
          await supabase.from('chats').update({ last_message: '🎤 Voice message', last_message_time: new Date().toISOString() }).eq('id', group.id);
          showToast('Voice message sent!', 'success');
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { showToast('Mic access denied', 'error'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) { mediaRecorderRef.current.onstop = null; mediaRecorderRef.current.stop(); }
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    showToast('Recording cancelled', 'info');
  };

  const formatRecordingTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const formatCreationDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // ── Outside click for emoji picker ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) setIsEmojiPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-100 animate-fade-in relative">
      {toast && <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      {/* Forward modal */}
      {forwardMessage && (
        <ForwardModal
          message={forwardMessage}
          contacts={contacts}
          myId={myId}
          myName={myName}
          groupId={group.id}
          onClose={() => setForwardMessage(null)}
          onForwarded={() => { setForwardMessage(null); showToast('Forwarded!', 'success'); }}
        />
      )}

      {/* Header */}
      <header className="p-3 flex items-center sticky top-0 bg-white/80 backdrop-blur-md z-10 border-b shadow-sm flex-shrink-0">
        <button onClick={onClose} className="p-2 text-gray-600 hover:text-emerald-600 mr-1 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <img src={group.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${group.id}`} alt={group.name} className="w-10 h-10 rounded-full mr-3 object-cover border border-gray-100" />
        <div className="flex-1 overflow-hidden cursor-pointer" onClick={() => setIsInfoVisible(true)}>
          <h2 className="text-base font-bold text-gray-800 truncate">{group.name}</h2>
          <p className="text-[10px] font-medium">
            {typingUsers.length > 0
              ? <span className="text-emerald-600">typing...</span>
              : <span className="text-emerald-600">{group.memberCount} members</span>
            }
          </p>
        </div>
        <div className="flex items-center gap-1">
          {pinnedMessages.length > 0 && (
            <button onClick={() => setShowPinnedOnly(prev => !prev)}
              className={`p-2 rounded-full transition-all ${showPinnedOnly ? 'bg-emerald-100 text-emerald-600' : 'text-gray-600 hover:bg-gray-100'}`}>
              <Pin size={20} />
            </button>
          )}
          <button onClick={() => setIsSettingsVisible(true)} className="p-2 text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all">
            <Settings size={22} />
          </button>
          <button onClick={() => setIsInfoVisible(true)} className="p-2 text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all">
            <Info size={22} />
          </button>
        </div>
      </header>

      {/* Pinned bar */}
      {pinnedMessages.length > 0 && !showPinnedOnly && (
        <div className="bg-emerald-50 border-b px-4 py-2 flex items-center justify-between animate-fade-in-down flex-shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <Pin size={14} className="text-emerald-600 flex-shrink-0" />
            <p className="text-xs text-emerald-800 truncate font-medium">{pinnedMessages[pinnedMessages.length - 1].text}</p>
          </div>
          <button onClick={() => setShowPinnedOnly(true)} className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider ml-2 whitespace-nowrap">
            View All ({pinnedMessages.length})
          </button>
        </div>
      )}

      {/* Group Info Modal */}
      {isInfoVisible && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-fade-in-up">
            <div className="p-6 flex flex-col items-center border-b relative">
              <button onClick={() => setIsInfoVisible(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600"><X size={24} /></button>
              <img src={group.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${group.id}`} alt={group.name} className="w-24 h-24 rounded-full object-cover shadow-lg mb-4 border-4 border-emerald-50" />
              <h2 className="text-xl font-bold text-gray-900">{group.name}</h2>
              <p className="text-sm text-gray-500 mt-1">Group · {group.memberCount} members</p>
            </div>
            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{group.description || 'No description provided.'}</p>
              </div>
              <div className="flex justify-between text-sm">
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Created By</h3>
                  <p className="text-gray-700">{contacts.find(c => c.id === group.createdBy)?.name || 'Unknown'}</p>
                </div>
                <div className="text-right">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Created On</h3>
                  <p className="text-gray-700">{formatCreationDate(group.createdAt)}</p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Members ({group.memberCount})</h3>
                  <div className="relative">
                    <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Search..." className="pl-8 pr-3 py-1 bg-gray-100 rounded-full text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 w-32 transition-all focus:w-48"
                      value={memberSearchQuery} onChange={e => setMemberSearchQuery(e.target.value)} />
                  </div>
                </div>
                <div className="divide-y divide-gray-100 bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
                  {filteredMembers.length > 0 ? filteredMembers.map(uid => {
                    const member = contacts.find(c => c.id === uid);
                    if (!member) return null;
                    return (
                      <MemberItem key={uid} member={member}
                        isAdmin={group.admins?.includes(uid) || group.createdBy === uid}
                        isCurrentUserAdmin={isAdmin}
                        onRemove={() => handleRemoveMember(uid)}
                        onClick={() => { setSelectedMember(member); setIsInfoVisible(false); }} />
                    );
                  }) : <p className="p-4 text-center text-gray-500 text-sm">No members found.</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Group Settings */}
      {isSettingsVisible && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-fade-in-up">
            <div className="p-4 flex items-center justify-between border-b">
              <h2 className="text-lg font-bold text-gray-800">Group Settings</h2>
              <button onClick={() => setIsSettingsVisible(false)} className="p-2 text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Group Name</label>
                  <input type="text" defaultValue={group.name} disabled={!isAdmin}
                    onBlur={(e) => isAdmin && onUpdateGroup(group.id, { name: e.target.value })}
                    className="w-full bg-gray-100 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm disabled:opacity-50" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Group Avatar URL</label>
                  <input type="text" defaultValue={group.avatarUrl} disabled={!isAdmin}
                    onBlur={(e) => isAdmin && onUpdateGroup(group.id, { avatarUrl: e.target.value })}
                    className="w-full bg-gray-100 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm disabled:opacity-50" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Description</label>
                  <textarea defaultValue={group.description} disabled={!isAdmin}
                    onBlur={(e) => isAdmin && onUpdateGroup(group.id, { description: e.target.value })}
                    rows={3} className="w-full bg-gray-100 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm disabled:opacity-50 resize-none"
                    placeholder="Tell members what this group is about..." />
                </div>
              </div>
              <div className="pt-4 border-t">
                <button onClick={() => onUpdateGroup(group.id, { isMuted: !group.isMuted })}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-3">
                    {group.isMuted ? <BellOff size={20} className="text-red-500" /> : <Bell size={20} className="text-emerald-600" />}
                    <div className="text-left">
                      <p className="text-sm font-bold text-gray-800">Mute Notifications</p>
                      <p className="text-[10px] text-gray-500">Silence alerts for this group</p>
                    </div>
                  </div>
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${group.isMuted ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${group.isMuted ? 'right-1' : 'left-1'}`} />
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pinned messages view */}
      {showPinnedOnly && (
        <div className="fixed inset-0 bg-white z-40 flex flex-col animate-fade-in">
          <header className="p-3 flex items-center border-b bg-emerald-50 flex-shrink-0">
            <button onClick={() => setShowPinnedOnly(false)} className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-full transition-colors mr-2"><ArrowLeft size={24} /></button>
            <div>
              <h2 className="text-lg font-bold text-emerald-900">Pinned Messages</h2>
              <p className="text-xs text-emerald-700">{pinnedMessages.length} messages pinned</p>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {pinnedMessages.length > 0 ? pinnedMessages.map(msg => (
              <div key={msg.id} className="bg-white p-4 rounded-2xl shadow-sm border border-emerald-100 relative">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">{msg.senderName}</p>
                  <button onClick={() => handlePinMessage(msg.id)} className="text-gray-400 hover:text-red-500 transition-colors"><X size={16} /></button>
                </div>
                <p className="text-gray-800 text-[15px] leading-relaxed">{msg.text}</p>
                <p className="text-[10px] text-gray-400 mt-2 text-right">{new Date(msg.timestamp).toLocaleString()}</p>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Pin size={48} className="mb-4 opacity-20" />
                <p>No pinned messages yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1">
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            myId={myId}
            onPin={() => handlePinMessage(msg.id)}
            isPinned={group.pinnedMessageIds?.includes(msg.id) || false}
            onReact={emoji => handleReact(msg.id, emoji)}
            onReply={m => { setReplyTo(m); setIsEmojiPickerOpen(false); setIsAttachmentMenuOpen(false); }}
            onDelete={() => handleDeleteMessage(msg.id)}
            onEdit={() => { setEditingMessage(msg); setMessage(msg.text.replace(' (edited)', '')); }}
            onForward={m => setForwardMessage(m)}
          />
        ))}
        {typingUsers.length > 0 && (
          <div className="flex justify-start mb-2 px-1">
            <AvatarTyping
              key={typingUsers[0]}
              avatarUrl={`https://api.dicebear.com/7.x/avataaars/svg?seed=${typingUsers[0]}`}
              name={contacts.find(c => c.id === typingUsers[0])?.name || typingUsers[0]}
            />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Picker */}
      {isEmojiPickerOpen && (
        <div ref={emojiPickerRef} className="absolute bottom-16 left-0 right-0 mx-auto w-full bg-white rounded-t-xl shadow-xl p-2 z-20 overflow-y-auto max-h-64 animate-fade-in-up flex-shrink-0">
          {Object.entries(categorizedEmojis).map(([category, emojis]) => (
            <div key={category} className="mb-2">
              <h3 className="text-sm font-semibold text-gray-500 px-2 py-1 sticky top-0 bg-white z-10">{category}</h3>
              <div className="grid grid-cols-8 gap-1">
                {emojis.map((emoji, i) => (
                  <button key={i} onClick={() => setMessage(p => p + emoji)} className="p-1 text-xl hover:bg-gray-100 rounded-lg flex items-center justify-center">{emoji}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Attachment menu */}
      {isAttachmentMenuOpen && (
        <div className="absolute bottom-20 left-4 right-4 bg-white rounded-[2rem] shadow-2xl p-4 z-20 animate-fade-in-up border border-gray-100 max-w-sm mx-auto flex-shrink-0">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Attachments</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: '📷', label: 'Photo', action: () => { imageInputRef.current?.click(); setIsAttachmentMenuOpen(false); } },
              { icon: '🎤', label: 'Voice', action: () => { setIsAttachmentMenuOpen(false); startRecording(); } },
              { icon: '📄', label: 'Document', action: () => showToast('Coming soon', 'info') },
            ].map(({ icon, label, action }) => (
              <button key={label} onClick={action}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gray-50 hover:bg-emerald-50 hover:text-emerald-600 transition-all active:scale-95">
                <span className="text-2xl">{icon}</span>
                <span className="text-xs font-bold text-gray-600">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reply banner */}
      {replyTo && (
        <div className="px-4 py-2 bg-white border-t border-emerald-100 flex items-center gap-2 border-l-[3px] border-l-emerald-400 flex-shrink-0">
          <CornerUpLeft size={14} className="text-emerald-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-emerald-500 truncate">{replyTo.senderName}</p>
            <p className="text-[11px] text-gray-500 truncate">{replyTo.type === 'image' ? '📷 Photo' : replyTo.type === 'audio' ? '🎤 Voice' : replyTo.text.slice(0, 80)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={14} /></button>
        </div>
      )}

      {/* Edit banner */}
      {editingMessage && (
        <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2 flex-shrink-0">
          <Edit3 size={14} className="text-emerald-600" />
          <span className="text-xs text-emerald-700 font-bold flex-1">Editing message</span>
          <button onClick={() => { setEditingMessage(null); setMessage(''); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
      )}

      {/* Input bar */}
      <div className="p-3 bg-white border-t flex items-center gap-2 z-10 flex-shrink-0">
        {isRecording ? (
          <div className="flex-1 flex items-center gap-3 bg-red-50 rounded-2xl px-4 py-2.5 border border-red-100">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-600 font-bold text-sm flex-1">{formatRecordingTime(recordingTime)}</span>
            <button onClick={cancelRecording} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
          </div>
        ) : (
          <>
            <button onClick={() => { setIsEmojiPickerOpen(p => !p); setIsAttachmentMenuOpen(false); }}
              className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-full transition-colors flex-shrink-0">
              <Smile size={24} />
            </button>
            <div className="flex-1 relative">
              <input type="text" placeholder={editingMessage ? 'Edit message...' : 'Type a message...'}
                className="w-full bg-gray-100 rounded-2xl py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-[15px] text-gray-900 transition-all"
                value={message}
                onChange={e => { handleMessageChange(e.target.value); setIsEmojiPickerOpen(false); }}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()} />
            </div>
            <button onClick={() => { setIsAttachmentMenuOpen(p => !p); setIsEmojiPickerOpen(false); }}
              className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-full transition-colors flex-shrink-0">
              <Paperclip size={24} />
            </button>
          </>
        )}

        {message.trim() || editingMessage ? (
          <button onClick={handleSend}
            className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 bg-emerald-500 text-white flex-shrink-0">
            <Send size={20} className="translate-x-0.5" />
          </button>
        ) : isRecording ? (
          <button onClick={stopRecording}
            className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 bg-emerald-500 text-white flex-shrink-0">
            <Send size={20} />
          </button>
        ) : (
          <button
            onMouseDown={startRecording} onMouseUp={stopRecording}
            onTouchStart={startRecording} onTouchEnd={stopRecording}
            className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 bg-gray-200 text-gray-600 hover:bg-emerald-100 hover:text-emerald-600 flex-shrink-0">
            <Mic size={20} />
          </button>
        )}
      </div>

      {selectedMember && <UserProfileModal user={selectedMember} onClose={() => setSelectedMember(null)} onInitiateCall={onInitiateCall} onInitiateChat={onInitiateChat} />}
    </div>
  );
};
