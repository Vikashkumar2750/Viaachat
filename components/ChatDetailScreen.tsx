
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Video, Phone, Smile, Paperclip, Send,
  FileText, Camera as CameraIcon, Image as ImageIcon,
  Headphones, MapPin, User as UserIcon, Shield,
} from 'lucide-react';
import { supabase, handleSupabaseError } from '../supabase';
import type { Chat, Message, Contact } from '../types';

interface ChatDetailScreenProps {
  chat: Chat;
  onClose: () => void;
  onSendMessage: (chatId: string, messageText: string) => void;
  onInitiateCall: (contact: Contact, isVideo: boolean) => void;
}

const dbToMessage = (row: any): Message => ({
  id: row.id,
  text: row.text,
  senderId: row.sender_id,
  senderName: row.sender_name,
  timestamp: row.timestamp,
  type: row.type || 'text',
  isPinned: row.is_pinned || false,
  reactions: row.reactions || {},
});

// ─── Typing dots ─────────────────────────────────────────────────────────────
const TypingDots: React.FC = () => (
  <div className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-2xl rounded-bl-none shadow-sm max-w-[80px]">
    {[0, 1, 2].map(i => (
      <span
        key={i}
        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
        style={{ animationDelay: `${i * 0.15}s` }}
      />
    ))}
  </div>
);

// ─── Message Bubble ────────────────────────────────────────────────────────────
const MessageBubble: React.FC<{
  message: Message;
  myId: string;
  onReact: (emoji: string) => void;
}> = ({ message, myId, onReact }) => {
  const isYou = message.senderId === myId;
  const [showReactions, setShowReactions] = useState(false);

  const formatTime = (ts: any) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const quickReactions = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

  return (
    <div className={`flex ${isYou ? 'justify-end' : 'justify-start'} mb-3 group relative`}>
      <div className="relative">
        <div
          className={`rounded-2xl px-4 py-2 max-w-[80%] shadow-sm ${isYou ? 'bg-emerald-500 text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none'}`}
          onDoubleClick={() => setShowReactions(true)}
        >
          {!isYou && <p className="text-[10px] text-emerald-600 font-bold mb-1 opacity-70 uppercase tracking-wider">{message.senderName}</p>}
          <p className="text-[15px] leading-relaxed">{message.text}</p>
          <p className={`text-[10px] text-right mt-1 opacity-60`}>{formatTime(message.timestamp)}</p>
        </div>

        {/* Reactions */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className={`absolute -bottom-2 ${isYou ? 'right-2' : 'left-2'} flex flex-wrap gap-1 z-10`}>
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

        {/* Reaction picker */}
        <div className={`absolute ${isYou ? '-left-10' : '-right-10'} top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center`}>
          <button
            onClick={() => setShowReactions(!showReactions)}
            className="p-1.5 bg-white rounded-full shadow-md text-gray-400 hover:text-emerald-600 border border-gray-100"
          >
            <Smile size={16} />
          </button>
          {showReactions && (
            <div className="absolute bottom-full mb-2 bg-white rounded-full shadow-xl border border-gray-100 p-1 flex gap-1 z-20 animate-fade-in-up">
              {quickReactions.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { onReact(emoji); setShowReactions(false); }}
                  className="hover:scale-125 transition-transform p-1 text-lg"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Large emoji categorized set ─────────────────────────────────────────────
const categorizedEmojis: Record<string, string[]> = {
  '😀 Smileys': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','😎','🤩','😏','😒','😞','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😵','🤐','🥴','🤢','🤮','🤧','😷','😈','👿','💀','☠️','👻','👽','🤖','💩'],
  '👋 People': ['👋','✋','💪','🦾','👏','🙌','👐','🙏','✍️','💅','🤳','👍','👎','✊','👊','🤛','🤜','🤝','👶','👦','👧','🧑','👨','👩','👴','👵','👮','👷','💂','🕵️','👩‍⚕️','👨‍⚕️','👩‍🎓','👨‍🎓','👩‍💻','👨‍💻'],
  '🐶 Animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🐺','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🐢','🐍','🦎','🐙','🦑','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🐘','🦒','🦘','🐕','🐈','🌸','🌼','🌻','🌹','🌴','🌲','🌳','🍀','🌺'],
  '🍔 Food': ['🍏','🍎','🍊','🍋','🍌','🍉','🍇','🍓','🍒','🍑','🥭','🍍','🥝','🍅','🥑','🥦','🌽','🥕','🍞','🧀','🍳','🥞','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🌮','🌯','🍜','🍲','🍣','🍱','🍦','🍰','🎂','🍭','🍬','🍫','🍿','🍩','🍪','☕','🍵','🍺','🍻','🍷','🥂','🥃','🍸','🍹'],
  '⚽ Sports': ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥅','🏋️','🤸','🏊','🚴','🎿','🎯','🎳','🎮','🕹️','🎲','🎰','🎭','🎨','🎼','🎵','🎤','🎧','🎷','🎸','🎹','🥁'],
  '✈️ Travel': ['🚗','🚕','🚙','🚌','🚓','🚑','🚒','🏍️','🚲','✈️','🛫','🚀','🛸','🚁','🚢','🚉','🚆','🚄','🗽','🗼','🏰','🏯','🏖️','🏝️','🏜️','🌋','🏔️','🌅','🌄','🌌'],
  '❤️ Symbols': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','☮️','✔️','❌','❓','❗','⚠️','🚫','💯','🔥','✨','🎉','🎊','⬆️','⬇️','⬅️','➡️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪'],
};

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
export const ChatDetailScreen: React.FC<ChatDetailScreenProps> = ({
  chat, onClose, onSendMessage, onInitiateCall,
}) => {
  const [myId, setMyId] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get current user ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setMyId(data.user.id);
    });
  }, []);

  // ─── Fetch messages & realtime ────────────────────────────────────────────
  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chat.id)
        .order('timestamp', { ascending: true });
      if (data) setMessages(data.map(dbToMessage));
    };
    fetchMessages();

    const channel = supabase
      .channel(`chat-messages-${chat.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `chat_id=eq.${chat.id}`,
      }, (payload) => {
        setMessages(prev => [...prev, dbToMessage(payload.new as any)]);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `chat_id=eq.${chat.id}`,
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === (payload.new as any).id ? dbToMessage(payload.new as any) : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chat.id]);

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
        const ts = (payload.new as any).typing_status || {};
        const typing = Object.entries(ts)
          .filter(([uid, isTyping]) => isTyping && uid !== myId)
          .map(([uid]) => uid);
        setTypingUsers(typing);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chat.id, myId]);

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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // Mark as read
  useEffect(() => {
    supabase.from('chats').update({ unread_count: 0 }).eq('id', chat.id);
  }, [chat.id]);

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(chat.id, message.trim());
      setMessage('');
      setIsEmojiPickerOpen(false);
      updateTypingStatus(false);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage(prev => prev + emoji);
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!myId) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    const currentReactions = { ...(msg.reactions || {}) };
    const uids: string[] = currentReactions[emoji] || [];
    const newUids = uids.includes(myId) ? uids.filter(id => id !== myId) : [...uids, myId];

    if (newUids.length === 0) {
      delete currentReactions[emoji];
    } else {
      currentReactions[emoji] = newUids;
    }

    const { error } = await supabase
      .from('chat_messages')
      .update({ reactions: currentReactions })
      .eq('id', messageId);

    if (error) handleSupabaseError(error, 'react-to-message');
  };

  const contactForCall: Contact = {
    id: chat.participants.find(p => p !== myId) || chat.id,
    name: chat.name,
    avatarUrl: chat.avatarUrl,
  };

  return (
    <div className="relative flex flex-col h-full bg-gray-100 animate-fade-in">
      {/* Header */}
      <header className="p-3 flex items-center sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b shadow-sm">
        <button onClick={onClose} className="p-2 text-gray-600 hover:text-emerald-600 mr-1 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <img
          src={chat.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${chat.id}`}
          alt={chat.name}
          className="w-10 h-10 rounded-full mr-3 object-cover border border-gray-100"
          referrerPolicy="no-referrer"
        />
        <div className="flex-1 overflow-hidden">
          <h2 className="text-base font-bold text-gray-800 truncate">{chat.name}</h2>
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] text-emerald-600 font-medium">
              {typingUsers.length > 0 ? 'typing...' : 'online'}
            </p>
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 rounded-full border border-emerald-100">
              <Shield size={8} className="text-emerald-600" />
              <span className="text-[7px] font-black text-emerald-600 uppercase tracking-tighter">E2EE</span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1 text-gray-600">
          <button onClick={() => onInitiateCall(contactForCall, true)} className="p-2 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all">
            <Video size={20} />
          </button>
          <button onClick={() => onInitiateCall(contactForCall, false)} className="p-2 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all">
            <Phone size={20} />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} myId={myId} onReact={emoji => handleReact(msg.id, emoji)} />
        ))}
        {typingUsers.length > 0 && (
          <div className="flex justify-start mb-2">
            <TypingDots />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Picker */}
      {isEmojiPickerOpen && (
        <div className="absolute bottom-16 left-0 right-0 mx-auto w-full max-w-sm bg-white rounded-xl shadow-xl p-2 z-20 overflow-y-auto max-h-64 animate-fade-in-up">
          {Object.entries(categorizedEmojis).map(([category, emojis]) => (
            <div key={category} className="mb-2">
              <h3 className="text-sm font-semibold text-gray-500 px-2 py-1 sticky top-0 bg-white z-10">{category}</h3>
              <div className="grid grid-cols-8 gap-1">
                {emojis.map((emoji, i) => (
                  <button key={i} onClick={() => handleEmojiSelect(emoji)} className="p-1 text-2xl hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors">
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Attachment Menu */}
      {isAttachmentMenuOpen && (
        <div className="absolute bottom-20 left-4 right-4 bg-white rounded-[2rem] shadow-2xl p-4 z-20 animate-fade-in-up border border-gray-100 max-w-sm mx-auto">
          {[
            { icon: <FileText size={20} />, label: 'Document', color: 'text-purple-500' },
            { icon: <CameraIcon size={20} />, label: 'Camera', color: 'text-red-500' },
            { icon: <ImageIcon size={20} />, label: 'Gallery', color: 'text-emerald-500' },
            { icon: <Headphones size={20} />, label: 'Audio', color: 'text-orange-500' },
            { icon: <MapPin size={20} />, label: 'Location', color: 'text-blue-500' },
            { icon: <UserIcon size={20} />, label: 'Contact', color: 'text-cyan-500' },
          ].map(({ icon, label, color }) => (
            <button key={label} className="w-full flex items-center p-3 text-left text-gray-800 rounded-xl transition-all hover:bg-gray-50">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 ${color} bg-opacity-10 bg-current`}>
                {icon}
              </div>
              <span className="font-bold text-[15px]">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input Bar */}
      <div className="p-3 bg-white border-t flex items-center gap-2 z-10">
        <button
          onClick={() => { setIsEmojiPickerOpen(p => !p); setIsAttachmentMenuOpen(false); }}
          className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-full transition-colors"
        >
          <Smile size={24} />
        </button>
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Type a message..."
            className="w-full bg-gray-100 rounded-2xl py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-[15px] text-gray-900 transition-all"
            value={message}
            onChange={e => { handleMessageChange(e.target.value); setIsEmojiPickerOpen(false); }}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
        </div>
        <button
          onClick={() => { setIsAttachmentMenuOpen(p => !p); setIsEmojiPickerOpen(false); }}
          className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-full transition-colors"
        >
          <Paperclip size={24} />
        </button>
        <button
          onClick={handleSend}
          disabled={!message.trim()}
          className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${message.trim() ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'}`}
        >
          <Send size={20} className={message.trim() ? 'translate-x-0.5' : ''} />
        </button>
      </div>

      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fade-in-up 0.2s ease-out forwards; }
      `}</style>
    </div>
  );
};
