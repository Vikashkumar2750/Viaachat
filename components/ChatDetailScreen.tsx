
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Video, Phone, Smile, Paperclip, Send,
  Mic, MicOff, Image as ImageIcon, X, Shield, MoreVertical,
  Edit3, Trash2, Eye, EyeOff, Play, Pause, Search,
  ChevronDown, CornerUpLeft, Copy, Forward, Check,
} from 'lucide-react';
import { supabase, handleSupabaseError } from '../supabase';
import type { Chat, Message, Contact } from '../types';

interface ChatDetailScreenProps {
  chat: Chat;
  onClose: () => void;
  onSendMessage: (chatId: string, messageText: string) => void;
  onInitiateCall: (contact: Contact, isVideo: boolean) => void;
}

// ─── Toast notification ───────────────────────────────────────────────────────
const Toast: React.FC<{ message: string; type?: 'success' | 'error' | 'info'; onDone: () => void }> = ({ message, type = 'info', onDone }) => {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  const color = type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-slate-800';
  return (
    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[999] ${color} text-white px-4 py-2.5 rounded-2xl shadow-2xl text-sm font-bold animate-fade-in-up max-w-[90vw] text-center`}>
      {message}
    </div>
  );
};

// ─── Audio message player ─────────────────────────────────────────────────────
const AudioPlayer: React.FC<{ src: string; isMe: boolean }> = ({ src, isMe }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
    setIsPlaying(p => !p);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(Math.floor(s) % 60).toString().padStart(2, '0')}`;

  return (
    <div className={`flex items-center gap-2 min-w-[160px] ${isMe ? 'text-white' : 'text-gray-700'}`}>
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={e => setProgress((e.currentTarget.currentTime / (e.currentTarget.duration || 1)) * 100)}
        onDurationChange={e => setDuration(e.currentTarget.duration)}
        onEnded={() => { setIsPlaying(false); setProgress(0); }}
      />
      <button onClick={togglePlay} className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isMe ? 'bg-white/20 hover:bg-white/30' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'}`}>
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="flex-1">
        <div className={`h-1.5 rounded-full ${isMe ? 'bg-white/20' : 'bg-gray-200'} overflow-hidden`}>
          <div className={`h-full rounded-full transition-all ${isMe ? 'bg-white' : 'bg-emerald-500'}`} style={{ width: `${progress}%` }} />
        </div>
        <span className={`text-[10px] font-bold mt-0.5 block ${isMe ? 'text-white/60' : 'text-gray-400'}`}>{formatTime(duration)}</span>
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
  isRead: false,   // always start false; will be overridden in context
  reactions: row.reactions || {},
  replyToId:     row.reply_to?.id     || null,
  replyToText:   row.reply_to?.text   || null,
  replyToSender: row.reply_to?.sender || null,
});

// ─── Show browser notification ────────────────────────────────────────────────
function showBrowserNotification(title: string, body: string, icon = '/icon-192.png') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.hidden) {
    try {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, { body, icon, badge: icon } as any);
        }).catch(() => {});
      } else {
        new Notification(title, { body, icon });
      }
    } catch {}
  }
}

// ─── Snapchat-style Typing Indicator ─────────────────────────────────────────
const AvatarTyping: React.FC<{ avatarUrl: string; name: string }> = ({ avatarUrl, name }) => (
  <div
    className="flex items-end gap-1.5"
    style={{ animation: 'scPeekIn 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}
  >
    <div
      className="relative flex-shrink-0 w-10 h-10"
      style={{ animation: 'scBreathe 3.2s ease-in-out infinite' }}
    >
      <img
        src={avatarUrl}
        alt={name}
        className="w-10 h-10 rounded-full object-cover shadow-md"
        referrerPolicy="no-referrer"
        style={{ border: '2.5px solid #fff', boxShadow: '0 2px 12px rgba(0,0,0,0.13)' }}
      />
    </div>
    <div className="flex flex-col items-start mb-1">
      <div
        className="flex items-center gap-[5px] bg-white px-[14px] py-[10px] shadow-md"
        style={{
          borderRadius: '22px 22px 22px 6px',
          boxShadow: '0 2px 14px rgba(0,0,0,0.10)',
          border: '1px solid rgba(0,0,0,0.05)',
        }}
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="block rounded-full"
            style={{
              width: 8, height: 8,
              background: '#aeb0b8',
              animation: 'scDot 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </div>
      <div
        style={{
          width: 7, height: 7,
          background: '#fff',
          borderRadius: '50%',
          marginLeft: 6,
          marginTop: -2,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          border: '1px solid rgba(0,0,0,0.05)',
        }}
      />
    </div>
    <style>{`
      @keyframes scPeekIn {
        0%   { opacity: 0; transform: translateY(18px) scale(0.85); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes scBreathe {
        0%, 100% { transform: scale(1);    }
        50%       { transform: scale(1.06); }
      }
      @keyframes scDot {
        0%, 60%, 100% { transform: scale(0.72); opacity: 0.35; }
        30%           { transform: scale(1.28); opacity: 1.0;  }
      }
    `}</style>
  </div>
);

// ─── Message Bubble ───────────────────────────────────────────────────────────
const MessageBubble: React.FC<{
  message: Message;
  myId: string;
  onReact: (emoji: string) => void;
  onDelete: () => void;
  onEdit: () => void;
  onPin: () => void;
  onReply: (msg: Message) => void;
  onForward: (msg: Message) => void;
}> = ({ message, myId, onReact, onDelete, onEdit, onPin, onReply, onForward }) => {
  const isYou = message.senderId === myId;
  const [showReactions, setShowReactions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Swipe-to-reply ───────────────────────────────────────────
  const touchStartX  = useRef(0);
  const touchStartY  = useRef(0);
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
    if (swipeX >= SWIPE_THRESHOLD) {
      onReply(message);
      try { navigator.vibrate(35); } catch {}
    }
    setSwipeX(0);
  };

  const formatTime = (ts: any) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isImage = message.type === 'image';
  const isAudio = message.type === 'audio';

  const quickReactions = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

  const handleCopy = () => {
    if (message.text && !isImage && !isAudio) {
      navigator.clipboard.writeText(message.text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        setShowMenu(false);
      });
    }
  };

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  return (
    <div className={`flex ${isYou ? 'justify-end' : 'justify-start'} mb-3 group relative`}>
      {/* Swipe ring */}
      {swipeX > 6 && (
        <div
          className="absolute left-0 top-1/2 z-10 pointer-events-none"
          style={{
            transform: `translateY(-50%) scale(${0.5 + 0.5 * Math.min(1, swipeX / SWIPE_THRESHOLD)})`,
            opacity: Math.min(1, swipeX / SWIPE_THRESHOLD),
          }}
        >
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
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: swipeX === 0 ? 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
          willChange: 'transform',
        }}
      >
        {/* Quoted reply preview */}
        {message.replyToText && (
          <div className={`flex flex-col mb-1.5 px-3 py-1.5 rounded-xl border-l-[3px] border-emerald-400 ${isYou ? 'bg-emerald-50/80' : 'bg-gray-100'}`}>
            <span className="text-[10px] font-black text-emerald-500 truncate">{message.replyToSender}</span>
            <span className="text-[11px] text-gray-500 leading-snug line-clamp-2">{message.replyToText}</span>
          </div>
        )}

        <div
          className={`rounded-2xl ${
            isImage ? 'p-0 overflow-hidden' : 'px-4 py-2'
          } shadow-sm ${
            isYou
              ? 'rounded-tr-none'
              : 'bg-white text-gray-800 rounded-tl-none'
          }`}
          style={isYou ? { backgroundColor: '#e2fce5', color: '#1a1a1a' } : undefined}
          onDoubleClick={() => setShowReactions(true)}
          onContextMenu={e => { e.preventDefault(); setShowMenu(true); }}
        >
          {!isYou && <p className="text-[10px] text-emerald-600 font-bold mb-1 opacity-70 uppercase tracking-wider">{message.senderName}</p>}

          {isImage ? (
            <img
              src={message.text}
              alt="Image"
              className="max-w-[240px] max-h-[320px] object-cover rounded-2xl"
              referrerPolicy="no-referrer"
            />
          ) : isAudio ? (
            <AudioPlayer src={message.text} isMe={isYou} />
          ) : (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{message.text}</p>
          )}

          {message.isPinned && (
            <span className={`text-[9px] font-black uppercase tracking-widest ${isYou ? 'text-gray-500' : 'text-emerald-500'}`}>📌 Pinned</span>
          )}

          <div className={`flex items-center justify-end gap-1 mt-1 ${isImage ? 'absolute bottom-2 right-2 bg-black/30 px-1.5 py-0.5 rounded-full' : ''}`}>
            <p className={`text-[10px] opacity-60 ${isImage ? 'text-white' : 'text-gray-500'}`}>
              {formatTime(message.timestamp)}
            </p>
            {isYou && (
              message.isRead
                ? <Eye    size={13} className={isImage ? 'text-blue-300'  : 'text-blue-500'} />
                : <EyeOff size={13} className={isImage ? 'text-white/50'  : 'text-gray-400'} />
            )}
          </div>
        </div>

        {/* Reactions display */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className={`absolute -bottom-3 ${isYou ? 'right-2' : 'left-2'} flex flex-wrap gap-1 z-10`}>
            {Object.entries(message.reactions as { [key: string]: string[] }).map(([emoji, uids]) =>
              uids.length > 0 && (
                <button
                  key={emoji}
                  onClick={() => onReact(emoji)}
                  className={`flex items-center gap-1 bg-white border border-gray-100 rounded-full px-1.5 py-0.5 shadow-sm text-[12px] hover:bg-gray-50 transition-all ${uids.includes(myId) ? 'border-emerald-200 bg-emerald-50' : ''}`}
                >
                  <span>{emoji}</span>
                  <span className="text-gray-500 font-medium">{uids.length}</span>
                </button>
              )
            )}
          </div>
        )}

        {/* Hover actions */}
        <div className={`absolute ${isYou ? '-left-10' : '-right-10'} top-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-1`}>
          <button onClick={() => setShowReactions(!showReactions)}
            className="p-1.5 bg-white rounded-full shadow-md text-gray-400 hover:text-emerald-600 border border-gray-100">
            <Smile size={14} />
          </button>
          <button onClick={() => setShowMenu(true)}
            className="p-1.5 bg-white rounded-full shadow-md text-gray-400 hover:text-gray-600 border border-gray-100">
            <MoreVertical size={14} />
          </button>
        </div>

        {/* Reaction picker */}
        {showReactions && (
          <div className={`absolute ${isYou ? 'right-0' : 'left-0'} bottom-full mb-2 bg-white rounded-full shadow-xl border border-gray-100 p-1 flex gap-1 z-20 animate-fade-in-up`}>
            {quickReactions.map(emoji => (
              <button key={emoji} onClick={() => { onReact(emoji); setShowReactions(false); }}
                className="hover:scale-125 transition-transform p-1 text-lg">
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Context menu — full options like modern messengers */}
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
              📌 {message.isPinned ? 'Unpin' : 'Pin'}
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

// ─── Large emoji set ──────────────────────────────────────────────────────────
const categorizedEmojis: Record<string, string[]> = {
  '😀 Smileys': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😋','😛','😜','🤪','😎','😏','😒','😞','😟','😕','🙁','😢','😭','😤','😠','😡','🤬','🤯','😳','😱','😨','😓','🤗','🤔','😶','😐','😑','😬','🙄','😯','😮','🥱','😴'],
  '👋 People': ['👋','✋','💪','👏','🙌','🙏','✍️','💅','👍','👎','✊','👊','🤝','👶','👦','👧','🧑','👨','👩'],
  '🐶 Animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐸','🐵','🐔','🐧','🦆','🦉','🐺','🦄','🐉'],
  '🍔 Food': ['🍏','🍎','🍊','🍋','🍌','🍇','🍓','🍒','🍑','🥑','🌽','🥕','🍕','🍔','🍟','🌮','🍜','🍣','🍦','🍰','🎂','🍭','🍬','🍫','🍿','☕','🍵','🍺','🍷','🥂'],
  '⚽ Sports': ['⚽','🏀','🏈','⚾','🎾','🏐','🎱','🏋️','🤸','🏊','🚴','🎿','🎯','🎮','🎲','🎭','🎨','🎵','🎤','🎧'],
  '❤️ Symbols': ['❤️','🧡','💛','💚','💙','💜','🖤','💔','💕','💞','💓','💗','💖','💘','💝','☮️','✔️','❌','⚠️','🚫','💯','🔥','✨','🎉','🎊'],
};

// ─── Forward modal (simple) ───────────────────────────────────────────────────
const ForwardModal: React.FC<{
  message: Message;
  chats: { id: string; name: string; avatarUrl: string }[];
  myId: string;
  myName: string;
  onClose: () => void;
  onForwarded: (chatId: string) => void;
}> = ({ message, chats, myId, myName, onClose, onForwarded }) => {
  const [sending, setSending] = useState<string | null>(null);

  const forward = async (chatId: string) => {
    setSending(chatId);
    const payload: Record<string, any> = {
      chat_id: chatId,
      text: message.text,
      sender_id: myId,
      sender_name: myName,
      timestamp: new Date().toISOString(),
      type: message.type || 'text',
    };
    await supabase.from('chat_messages').insert(payload);
    await supabase.from('chats').update({
      last_message: message.type === 'image' ? '📷 Photo' : message.type === 'audio' ? '🎤 Voice' : message.text.slice(0, 80),
      last_message_time: new Date().toISOString(),
    }).eq('id', chatId);
    setSending(null);
    onForwarded(chatId);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-t-3xl overflow-hidden shadow-2xl animate-slide-up">
        <div className="p-4 flex items-center justify-between border-b">
          <h3 className="text-base font-black text-gray-800">Forward message</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
          {chats.map(c => (
            <button
              key={c.id}
              onClick={() => forward(c.id)}
              disabled={sending === c.id}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <img src={c.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.id}`}
                alt={c.name} className="w-10 h-10 rounded-full object-cover" />
              <span className="text-sm font-semibold text-gray-800 flex-1 text-left">{c.name}</span>
              {sending === c.id
                ? <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                : <Forward size={16} className="text-gray-300" />
              }
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export const ChatDetailScreen: React.FC<ChatDetailScreenProps> = ({
  chat, onClose, onSendMessage, onInitiateCall,
}) => {
  const [myId, setMyId] = useState('');
  const [myName, setMyName] = useState('Me');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allChats, setAllChats] = useState<{ id: string; name: string; avatarUrl: string }[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [partnerViewing, setPartnerViewing] = useState(false);
  const partnerViewingRef = useRef(false);
  // Track which message IDs have already been seen by partner
  // CRITICAL: once a message is seen, it must never go back to unseen
  const seenMessageIds = useRef<Set<string>>(new Set());

  const PAGE_SIZE = 40;

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
  };

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setMyId(data.user.id);
        setMyName(
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          data.user.email?.split('@')[0] ||
          'Me'
        );
      }
    });
  }, []);

  // Load chats list for forward modal
  useEffect(() => {
    supabase.from('chats').select('id, name, avatar_url').then(({ data }) => {
      if (data) setAllChats(data.map(c => ({ id: c.id, name: c.name, avatarUrl: c.avatar_url })));
    });
  }, []);

  // ─── Fetch messages (paginated) ───────────────────────────────────────────
  const fetchMessages = useCallback(async (pageNum: number, append = false) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_id', chat.id)
      .order('timestamp', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

    if (data) {
      const sorted = data.reverse().map(row => {
        const msg = dbToMessage(row);
        // CRITICAL SEEN LOGIC:
        // 1. If we already know this message was seen (in seenMessageIds), keep isRead:true
        // 2. If partner is currently viewing, our sent msgs are also seen
        // 3. Their messages are always "seen" by us (we're reading them)
        const alreadySeen = seenMessageIds.current.has(row.id);
        if (alreadySeen) {
          return { ...msg, isRead: true };
        }
        const isMineAndPartnerHere = row.sender_id === myId && partnerViewingRef.current;
        const isTheirMsg = row.sender_id !== myId;
        const isRead = alreadySeen || isMineAndPartnerHere || isTheirMsg;
        if (isRead && row.sender_id === myId) {
          seenMessageIds.current.add(row.id);
        }
        return { ...msg, isRead };
      });
      if (append) {
        setMessages(prev => [...sorted, ...prev]);
      } else {
        setMessages(sorted);
      }
      setHasMore(data.length === PAGE_SIZE);
    }
  }, [chat.id, myId]);

  // Mark MY outgoing messages as read — always uses seenMessageIds to prevent regression
  const markAllRead = useCallback(() => {
    setMessages(prev => prev.map(m => {
      if (m.senderId === myId) {
        seenMessageIds.current.add(m.id);
        return { ...m, isRead: true };
      }
      return m;
    }));
  }, [myId]);

  useEffect(() => {
    fetchMessages(0);

    const channel = supabase
      .channel(`chat-messages-${chat.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `chat_id=eq.${chat.id}`,
      }, (payload) => {
        const newMsg = dbToMessage(payload.new as any);
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          if (newMsg.senderId === myId) {
            const withoutTemp = prev.filter(m => !m.id.startsWith('temp-'));
            // Preserve seen state if partner is viewing
            const isRead = partnerViewingRef.current;
            if (isRead) seenMessageIds.current.add(newMsg.id);
            return [...withoutTemp, { ...newMsg, isRead }];
          }
          const chatName = chat.name || newMsg.senderName || 'New message';
          const preview = newMsg.type === 'image' ? '📷 Image'
            : newMsg.type === 'audio' ? '🎤 Voice message'
            : newMsg.text.slice(0, 80);
          showBrowserNotification(chatName, preview);
          return [...prev, newMsg];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `chat_id=eq.${chat.id}`,
      }, (payload) => {
        setMessages(prev => prev.map(m => {
          if (m.id !== (payload.new as any).id) return m;
          const updated = dbToMessage(payload.new as any);
          // CRITICAL: If message was already seen in-memory, NEVER revert to unseen
          const preserveSeen = m.isRead || seenMessageIds.current.has(m.id);
          if (preserveSeen && m.senderId === myId) {
            seenMessageIds.current.add(m.id);
            return { ...updated, isRead: true };
          }
          return updated;
        }));
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_messages',
        filter: `chat_id=eq.${chat.id}`,
      }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
        seenMessageIds.current.delete((payload.old as any).id);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chat.id, fetchMessages]);

  // ─── Fast read-receipt via Broadcast ─────────────────────────────────────
  useEffect(() => {
    if (!myId) return;

    const viewCh = supabase.channel(`chat-view-${chat.id}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    viewCh
      .on('broadcast', { event: 'viewing' }, ({ payload }) => {
        if (payload.uid === myId) return;
        setPartnerViewing(true);
        partnerViewingRef.current = true;
        markAllRead();
      })
      .on('broadcast', { event: 'view-left' }, ({ payload }) => {
        if (payload.uid === myId) return;
        setPartnerViewing(false);
        partnerViewingRef.current = false;
        // NOTE: do NOT revert any seenMessageIds — once seen, always seen
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          viewCh.send({ type: 'broadcast', event: 'viewing', payload: { uid: myId } });
          const ping = setInterval(() => {
            if (partnerViewingRef.current) return;
            viewCh.send({ type: 'broadcast', event: 'viewing', payload: { uid: myId } });
          }, 8000);
          (viewCh as any)._ping = ping;
        }
      });

    return () => {
      viewCh.send({ type: 'broadcast', event: 'view-left', payload: { uid: myId } });
      clearInterval((viewCh as any)._ping);
      supabase.removeChannel(viewCh);
      setPartnerViewing(false);
      partnerViewingRef.current = false;
      // Don't clear seenMessageIds — they persist the session
    };
  }, [chat.id, myId, markAllRead]);

  // ─── Typing indicator ─────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`chat-typing-${chat.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chats',
        filter: `id=eq.${chat.id}`,
      }, (payload) => {
        const updated = payload.new as any;
        const ts = updated.typing_status || {};
        const typing = Object.entries(ts)
          .filter(([uid, isTyping]) => isTyping && uid !== myId)
          .map(([uid]) => uid);
        setTypingUsers(typing);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chat.id, myId]);

  // Load older messages on scroll to top
  const handleScroll = useCallback(async () => {
    const el = scrollContainerRef.current;
    if (!el || !hasMore || loadingMore) return;
    if (el.scrollTop < 100) {
      setLoadingMore(true);
      const prevHeight = el.scrollHeight;
      const nextPage = page + 1;
      await fetchMessages(nextPage, true);
      setPage(nextPage);
      setLoadingMore(false);
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - prevHeight;
      });
    }
  }, [hasMore, loadingMore, page, fetchMessages]);

  // ─── Presence ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (chat.isGroup) return;
    const otherId = chat.participants.find(p => p !== myId);
    if (!otherId) return;
    const checkOnline = async () => {
      const { data } = await supabase
        .from('users')
        .select('last_seen')
        .eq('id', otherId)
        .single();
      if (data?.last_seen) {
        setIsOnline(Date.now() - new Date(data.last_seen).getTime() < 120000);
      }
    };
    checkOnline();
    const interval = setInterval(checkOnline, 30000);
    return () => clearInterval(interval);
  }, [chat.id, chat.isGroup, chat.participants, myId]);

  const updateTypingStatus = useCallback(async (isTyping: boolean) => {
    if (!myId) return;
    await supabase.from('chats').update({
      typing_status: { ...(chat.typingStatus || {}), [myId]: isTyping },
    }).eq('id', chat.id);
  }, [chat.id, chat.typingStatus, myId]);

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

  // Auto-scroll on new messages
  useEffect(() => {
    if (page === 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, typingUsers, page]);

  // Mark as read
  useEffect(() => {
    if (myId) {
      supabase.from('chats').update({ unread_count: 0 }).eq('id', chat.id);
    }
  }, [chat.id, myId]);

  // ─── Send text message ────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = message.trim();
    if (!text && !editingMessage) return;

    if (editingMessage) {
      const { error } = await supabase
        .from('chat_messages')
        .update({ text: text + ' (edited)' })
        .eq('id', editingMessage.id);
      if (error) { showToast('Failed to edit message', 'error'); return; }
      setEditingMessage(null);
    } else {
      const optimisticMsg: Message = {
        id: `temp-${Date.now()}`,
        text,
        senderId: myId,
        senderName: myName,
        timestamp: new Date().toISOString(),
        type: 'text',
        isRead: partnerViewingRef.current, // optimistically show seen if partner is here
        isPinned: false,
        reactions: {},
        replyToId:     replyTo?.id         || null,
        replyToText:   replyTo?.text       || null,
        replyToSender: replyTo?.senderName || null,
      };
      setMessages(prev => [...prev, optimisticMsg]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);

      const payload: Record<string, any> = {
        chat_id: chat.id, text, sender_id: myId, sender_name: myName,
        timestamp: new Date().toISOString(), type: 'text',
      };
      if (replyTo) {
        payload.reply_to = {
          id: replyTo.id,
          text: replyTo.text.slice(0, 200),
          sender: replyTo.senderName,
        };
      }
      const { error: sendErr } = await supabase.from('chat_messages').insert(payload);
      if (sendErr?.message?.includes('reply_to')) {
        delete payload.reply_to;
        await supabase.from('chat_messages').insert(payload);
      }
      await supabase.from('chats').update({
        last_message: text,
        last_message_time: new Date().toISOString(),
      }).eq('id', chat.id);

      setReplyTo(null);
    }
    setMessage('');
    setIsEmojiOpen(false);
    setIsAttachmentOpen(false);
    updateTypingStatus(false);
  };

  // ─── Delete message ──────────────────────────────────────────────────────
  const handleDeleteMessage = async (messageId: string) => {
    const { error } = await supabase.from('chat_messages').delete().eq('id', messageId);
    if (error) {
      showToast('Failed to delete message', 'error');
    } else {
      showToast('Message deleted', 'success');
    }
  };

  // ─── Pin message ─────────────────────────────────────────────────────────
  const handlePinMessage = async (msg: Message) => {
    await supabase.from('chat_messages').update({ is_pinned: !msg.isPinned }).eq('id', msg.id);
    showToast(msg.isPinned ? 'Message unpinned' : 'Message pinned', 'success');
  };

  // ─── Reactions ───────────────────────────────────────────────────────────
  const handleReact = async (messageId: string, emoji: string) => {
    if (!myId) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    const currentReactions = { ...(msg.reactions || {}) };
    const uids: string[] = currentReactions[emoji] || [];
    const newUids = uids.includes(myId) ? uids.filter(id => id !== myId) : [...uids, myId];
    if (newUids.length === 0) delete currentReactions[emoji];
    else currentReactions[emoji] = newUids;
    await supabase.from('chat_messages').update({ reactions: currentReactions }).eq('id', messageId);
  };

  // ─── Image upload ─────────────────────────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !myId) return;
    setIsAttachmentOpen(false);
    if (file.size > 5 * 1024 * 1024) { showToast('Image too large (max 5MB)', 'error'); return; }
    showToast('Sending image...', 'info');
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      const { error } = await supabase.from('chat_messages').insert({
        chat_id: chat.id, text: base64, sender_id: myId, sender_name: myName,
        timestamp: new Date().toISOString(), type: 'image',
      });
      if (error) {
        showToast('Failed to send image', 'error');
      } else {
        await supabase.from('chats').update({ last_message: '📷 Photo', last_message_time: new Date().toISOString() }).eq('id', chat.id);
        showToast('Image sent!', 'success');
      }
    };
    reader.readAsDataURL(file);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // ─── Voice recording ──────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          const { error } = await supabase.from('chat_messages').insert({
            chat_id: chat.id, text: base64, sender_id: myId, sender_name: myName,
            timestamp: new Date().toISOString(), type: 'audio',
          });
          if (!error) {
            await supabase.from('chats').update({ last_message: '🎤 Voice message', last_message_time: new Date().toISOString() }).eq('id', chat.id);
            showToast('Voice message sent!', 'success');
          } else {
            showToast('Failed to send voice message', 'error');
          }
        };
        reader.readAsDataURL(audioBlob);
      };
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      showToast('Microphone access denied', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    showToast('Recording cancelled', 'info');
  };

  const formatRecordingTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const contactForCall: Contact = {
    id: chat.participants.find(p => p !== myId) || chat.id,
    name: chat.name,
    avatarUrl: chat.avatarUrl,
  };

  const displayMessages = searchQuery
    ? messages.filter(m => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  return (
    <div className="relative flex flex-col h-full min-h-0 bg-gray-100 animate-fade-in">
      {toast && <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      {/* Hidden file input */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      {/* Forward modal */}
      {forwardMessage && (
        <ForwardModal
          message={forwardMessage}
          chats={allChats.filter(c => c.id !== chat.id)}
          myId={myId}
          myName={myName}
          onClose={() => setForwardMessage(null)}
          onForwarded={() => { setForwardMessage(null); showToast('Message forwarded!', 'success'); }}
        />
      )}

      {/* Header */}
      <header className="p-3 flex items-center sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b shadow-sm flex-shrink-0">
        <button onClick={onClose} className="p-2 text-gray-600 hover:text-emerald-600 mr-1 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <div className="relative">
          <img
            src={chat.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${chat.id}`}
            alt={chat.name}
            className="w-10 h-10 rounded-full mr-3 object-cover border border-gray-100"
            referrerPolicy="no-referrer"
          />
          {!chat.isGroup && (
            <div className={`absolute bottom-0 right-2.5 w-3 h-3 rounded-full border-2 border-white ${isOnline ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <h2 className="text-base font-bold text-gray-800 truncate">{chat.name}</h2>
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-medium">
              {typingUsers.length > 0
                ? <span className="text-emerald-600">typing...</span>
                : !chat.isGroup
                  ? <span className={isOnline ? 'text-emerald-600' : 'text-gray-400'}>{isOnline ? 'Online' : 'Offline'}</span>
                  : <span className="text-gray-400">{chat.participants?.length || 0} members</span>
              }
            </p>
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 rounded-full border border-emerald-100">
              <Shield size={8} className="text-emerald-600" />
              <span className="text-[7px] font-black text-emerald-600 uppercase tracking-tighter">E2EE</span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1 text-gray-600">
          <button onClick={() => setIsSearchOpen(p => !p)} className="p-2 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all">
            <Search size={18} />
          </button>
          {!chat.isGroup && (
            <>
              <button onClick={() => onInitiateCall(contactForCall, true)} className="p-2 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all">
                <Video size={20} />
              </button>
              <button onClick={() => onInitiateCall(contactForCall, false)} className="p-2 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all">
                <Phone size={20} />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Search bar */}
      {isSearchOpen && (
        <div className="px-4 py-2 bg-white border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
          <Search size={16} className="text-gray-400 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* Edit banner */}
      {editingMessage && (
        <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2 flex-shrink-0">
          <Edit3 size={14} className="text-emerald-600" />
          <span className="text-xs text-emerald-700 font-bold flex-1">Editing message</span>
          <button onClick={() => { setEditingMessage(null); setMessage(''); }} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1"
        onScroll={handleScroll}
      >
        {loadingMore && (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        )}
        {displayMessages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            myId={myId}
            onReact={emoji => handleReact(msg.id, emoji)}
            onDelete={() => handleDeleteMessage(msg.id)}
            onEdit={() => { setEditingMessage(msg); setMessage(msg.text.replace(' (edited)', '')); }}
            onPin={() => handlePinMessage(msg)}
            onReply={m => { setReplyTo(m); setIsEmojiOpen(false); setIsAttachmentOpen(false); }}
            onForward={m => setForwardMessage(m)}
          />
        ))}
        {typingUsers.length > 0 && (
          <div className="flex justify-start mb-2 px-1">
            <AvatarTyping
              key={typingUsers[0]}
              avatarUrl={
                chat.isGroup
                  ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${typingUsers[0]}`
                  : chat.avatarUrl
              }
              name={chat.isGroup ? typingUsers[0] : chat.name}
            />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Picker */}
      {isEmojiOpen && (
        <div className="absolute bottom-16 left-0 right-0 mx-auto w-full bg-white rounded-t-xl shadow-2xl p-2 z-20 overflow-y-auto max-h-60 flex-shrink-0">
          {Object.entries(categorizedEmojis).map(([category, emojis]) => (
            <div key={category} className="mb-2">
              <h3 className="text-xs font-semibold text-gray-500 px-2 py-1 sticky top-0 bg-white">{category}</h3>
              <div className="grid grid-cols-8 gap-1">
                {emojis.map((emoji, i) => (
                  <button key={i} onClick={() => { setMessage(p => p + emoji); setIsEmojiOpen(false); }}
                    className="p-1 text-xl hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors">
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Attachment menu */}
      {isAttachmentOpen && (
        <div className="absolute bottom-16 left-4 right-4 bg-white rounded-[2rem] shadow-2xl p-4 z-20 animate-fade-in-up border border-gray-100 max-w-sm mx-auto flex-shrink-0">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Attachments</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: '📷', label: 'Photo', action: () => { imageInputRef.current?.click(); setIsAttachmentOpen(false); } },
              { icon: '🎤', label: 'Voice', action: () => { setIsAttachmentOpen(false); startRecording(); } },
              { icon: '📄', label: 'Document', action: () => showToast('Document sharing coming soon', 'info') },
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
            <p className="text-[10px] font-black text-emerald-500 truncate">
              {replyTo.senderName === myName ? 'You' : replyTo.senderName}
            </p>
            <p className="text-[11px] text-gray-500 truncate leading-tight">
              {replyTo.type === 'image' ? '📷 Photo' : replyTo.type === 'audio' ? '🎤 Voice' : replyTo.text.slice(0, 80)}
            </p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0 p-1">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input Bar */}
      <div className="p-3 bg-white border-t flex items-center gap-2 z-10 flex-shrink-0">
        {isRecording ? (
          <div className="flex-1 flex items-center gap-3 bg-red-50 rounded-2xl px-4 py-2.5 border border-red-100">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-600 font-bold text-sm flex-1">{formatRecordingTime(recordingTime)}</span>
            <button onClick={cancelRecording} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
          </div>
        ) : (
          <>
            <button
              onClick={() => { setIsEmojiOpen(p => !p); setIsAttachmentOpen(false); }}
              className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-full transition-colors flex-shrink-0"
            >
              <Smile size={24} />
            </button>

            <div className="flex-1 relative">
              <input
                type="text"
                placeholder={editingMessage ? 'Edit message...' : 'Type a message...'}
                className="w-full bg-gray-100 rounded-2xl py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-[15px] text-gray-900 transition-all pr-10"
                value={message}
                onChange={e => { handleMessageChange(e.target.value); setIsEmojiOpen(false); }}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              />
            </div>

            <button
              onClick={() => { setIsAttachmentOpen(p => !p); setIsEmojiOpen(false); }}
              className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-full transition-colors flex-shrink-0"
            >
              <Paperclip size={24} />
            </button>
          </>
        )}

        {/* Send / Record button */}
        {message.trim() || editingMessage ? (
          <button
            onClick={handleSend}
            className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 bg-emerald-500 text-white flex-shrink-0"
          >
            <Send size={20} className="translate-x-0.5" />
          </button>
        ) : isRecording ? (
          <button
            onClick={stopRecording}
            className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 bg-emerald-500 text-white flex-shrink-0"
          >
            <Send size={20} />
          </button>
        ) : (
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 bg-gray-200 text-gray-600 hover:bg-emerald-100 hover:text-emerald-600 flex-shrink-0"
            title="Hold to record voice message"
          >
            <Mic size={20} />
          </button>
        )}
      </div>
    </div>
  );
};
