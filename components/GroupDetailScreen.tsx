
import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Info, Smile, Send, Paperclip, FileText, Camera as CameraIcon, Image as ImageIcon, Headphones, MapPin, User as UserIcon, Search, Settings, X, Pin, Trash2, Shield, Bell, BellOff } from 'lucide-react';
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

const MemberItem: React.FC<{ 
    member: Contact, 
    isAdmin: boolean, 
    isCurrentUserAdmin: boolean,
    onRemove: () => void,
    onClick: () => void 
}> = ({ member, isAdmin, isCurrentUserAdmin, onRemove, onClick }) => (
    <div className="flex items-center p-3 hover:bg-gray-50 cursor-pointer transition-colors group">
        <div onClick={onClick} className="flex flex-1 items-center min-w-0">
            <img src={member.avatarUrl || `https://picsum.photos/seed/${member.id}/200`} alt={member.name} className="w-10 h-10 rounded-full mr-4 object-cover border border-gray-100" />
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
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                title="Remove from group"
            >
                <Trash2 size={18} />
            </button>
        )}
    </div>
);

const MessageBubble: React.FC<{ 
    message: Message, 
    onPin: () => void,
    isPinned: boolean,
    onReact: (emoji: string) => void
}> = ({ message, onPin, isPinned, onReact }) => {
    const [myId, setMyId] = React.useState('');
    const [showReactions, setShowReactions] = useState(false);
    const isYou = message.senderId === myId;
    React.useEffect(() => { supabase.auth.getUser().then(({ data }) => { if (data.user) setMyId(data.user.id); }); }, []);

    const formatTime = (timestamp: any) => {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
                    <div className="flex items-center justify-end gap-1 mt-1">
                        {isPinned && <Pin size={10} className="opacity-60" />}
                        <p className={`text-[10px] text-right opacity-60`}>{formatTime(message.timestamp)}</p>
                    </div>
                </div>

                {/* Display Reactions */}
                {message.reactions && Object.keys(message.reactions).length > 0 && (
                    <div className={`absolute -bottom-2 ${isYou ? 'right-2' : 'left-2'} flex flex-wrap gap-1 z-10`}>
                        {Object.entries(message.reactions as { [key: string]: string[] }).map(([emoji, uids]) => (
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
                        ))}
                    </div>
                )}

                {/* Reaction & Pin Actions */}
                <div className={`absolute ${isYou ? '-left-16' : '-right-16'} top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1`}>
                    <button 
                        onClick={() => setShowReactions(!showReactions)}
                        className="p-1.5 bg-white rounded-full shadow-md text-gray-400 hover:text-emerald-600 border border-gray-100"
                    >
                        <Smile size={16} />
                    </button>
                    <button 
                        onClick={onPin}
                        className="p-1.5 bg-white rounded-full shadow-md text-gray-400 hover:text-emerald-600 border border-gray-100"
                        title={isPinned ? "Unpin message" : "Pin message"}
                    >
                        <Pin size={16} className={isPinned ? 'fill-emerald-600 text-emerald-600' : ''} />
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

// Define the categorized emojis
const categorizedEmojis = {
    '😀 Smileys & Emotions': [
        '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
        '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖',
        '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔',
        '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴',
        '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '💀', '☠️', '👻', '👽', '🤖', '💩'
    ],
    '👋 People & Body': [
        '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎',
        '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻',
        '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '👶', '🧒', '👦', '👧', '🧑', '👨', '👩', '👱', '👴', '👵',
        '🧔', '🧕', '👳', '👲', '🧢', '👮', '👷', '💂', '🕵️', '👩‍⚕️', '👨‍⚕️', '👩‍🎓', '👨‍🎓', '👩‍💼', '👨‍💼', '👩‍💻', '👨‍💻', '👩‍🎤', '👨‍🎤',
        '👩‍🏫', '👨‍🏫', '👩‍🚀', '👨‍🚀', '🧙', '🧚', '🧛', '🧟', '🧞', '🧜', '🧝', '🧌'
    ],
    '🐶 🐱 Animals & Nature': [
        '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊',
        '🐒', '🦍', '🦧', '🐔', '🐧', '🐦', '🐤', '🐣', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌',
        '🐞', '🐜', '🦟', '🦗', '🕷️', '🐢', '🐍', '🦎', '🐙', '🦑', '🦐', '🦞', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅',
        '🐆', '🦓', '🦍', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🐐', '🦌',
        '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🐓', '🦃', '🦤', '🦚', '🦜', '🦢', '🦩', '🌸', '🌼', '🌻', '🌹', '🌷', '🌺', '🌴',
        '🌲', '🌳', '🍀', '🍁', '🍂', '🍃'
    ],
    '🍔 🍕 Food & Drink': [
        '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑',
        '🫒', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫛', '🧄', '🧅', '🍠', '🥔', '🍞', '🥐', '🥖', '🫓', '🧀', '🍳', '🥞',
        '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🍝', '🍜', '🍲', '🍛', '🍣',
        '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🧁', '🍰', '🎂', '🍮', '🍭',
        '🍬', '🍫', '🍿', '🍩', '🍪', '🥛', '🍼', '☕', '🍵', '🧃', '🥤', '🍶', '🍺', '🍻', '🍷', '🥂', '🥃', '🍸', '🍹',
        '🧉', '🍾'
    ],
    '⚽ 🎮 Activities & Sports': [
        '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '🏀', '🏋️', '🤸',
        '⛹️', '🤺', '🤾', '🏊', '🚴', '🧗', '🏇', '🏌️', '🎿', '🛷', '🥌', '⛸️', '🎯', '🎳', '🎮', '🕹️', '🎲', '🎰', '🎭', '🎨',
        '🎼', '🎵', '🎶', '🎤', '🎧', '🎷', '🎸', '🎹', '🥁'
    ],
    '🚗 ✈️ Travel & Places': [
        '🚗', '🚕', '🚙', '🚌', '🚎', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛹', '🚨', '🚔',
        '🚍', '✈️', '🛫', '🛬', '🛩️', '🚀', '🛸', '🚁', '🚢', '⛴️', '🛥️', '🚤', '🚉', '🚆', '🚄', '🚅', '🚇', '🚝', '🚊', '🚞',
        '🚋', '🗽', '🗼', '🗿', '🏰', '🏯', '🏟️', '🏖️', '🏝️', '🏜️', '🏕️', '🌋', '🗻', '🏔️', '⛰️', '🏞️', '🌅', '🌄', '🌠', '🎇',
        '🎆', '🌌'
    ],
    '💡 📱 Objects': [
        '📱', '💻', '🖥️', '⌨️', '🖱️', '🖨️', '📷', '📸', '📹', '🎥', '📽️', '📞', '☎️', '📟', '📠', '📺', '📻', '🧭', '⏰', '⏱️',
        '⏲️', '⌚', '💡', '🔦', '🕯️', '🧯', '🪔', '🔌', '🔋', '🔑', '🗝️', '🚪', '🪑', '🛋️', '🛏️', '🪞', '🚿', '🛁', '🧴', '🪒',
        '🧹', '🧺', '🧻', '🪣', '🧼', '🪥', '🧽', '🧯'
    ],
    '❤️ 🔣 Symbols': [
        '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '☮️', '✝️',
        '☪️', '🕉️', '☸️', '✡️', '🔯', '☯️', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '✔️', '❌', '❓',
        '❗', '⚠️', '🚫', '💯', '🔥', '✨', '🎉', '🎊', '🆗', '🆒', '🆕', '🆓', '🆙', '🆘', '⬆️', '⬇️', '⬅️', '➡️', '🔴', '🟠',
        '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤'
    ]
};


const AttachmentMenuItem: React.FC<{ icon: React.ReactNode; label: string; colorClass: string; isHighlighted?: boolean }> = ({ icon, label, colorClass, isHighlighted }) => (
    <button className={`w-full flex items-center p-3 text-left text-gray-800 rounded-xl transition-all active:scale-95 ${isHighlighted ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 ${colorClass} bg-opacity-10`}>
            {icon}
        </div>
        <span className="font-bold text-[15px]">{label}</span>
    </button>
);

export const GroupDetailScreen: React.FC<GroupDetailScreenProps> = ({ group, contacts, onClose, onSendMessage, onInitiateCall, onInitiateChat, onUpdateGroup }) => {
  const [isInfoVisible, setIsInfoVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<Contact | null>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);

  const [myId, setMyId] = React.useState('');
  React.useEffect(() => { supabase.auth.getUser().then(({ data }) => { if (data.user) setMyId(data.user.id); }); }, []);
  const isAdmin = group.admins?.includes(myId) || group.createdBy === myId;

  const filteredMembers = (group.participants || []).filter(uid => {
    const member = contacts.find(c => c.id === uid);
    if (!member) return false;
    return member.name.toLowerCase().includes(memberSearchQuery.toLowerCase());
  });

  const pinnedMessages = messages.filter(m => group.pinnedMessageIds?.includes(m.id));

  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', group.id)
        .order('timestamp', { ascending: true });
      if (data) {
        setMessages(data.map(row => ({
          id: row.id,
          text: row.text,
          senderId: row.sender_id,
          senderName: row.sender_name,
          timestamp: row.timestamp,
          type: row.type,
          isPinned: row.is_pinned,
          reactions: row.reactions || {},
        })) as Message[]);
      }
    };
    fetchMessages();

    const channel = supabase
      .channel(`group-messages-${group.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${group.id}` }, () => fetchMessages())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${group.id}` }, () => fetchMessages())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [group.id]);

  useEffect(() => {
    supabase.from('chats').update({ unread_count: 0 }).eq('id', group.id);
  }, [group.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close emoji picker if clicked outside
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setIsEmojiPickerOpen(false);
      }
      // Close attachment menu if clicked outside
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target as Node)) {
        setIsAttachmentMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSend = () => {
      if (message.trim()) {
          onSendMessage(group.id, message.trim());
          setMessage('');
          setIsEmojiPickerOpen(false); // Close emoji picker after sending
      }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage(prevMessage => prevMessage + emoji);
  };

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
    onUpdateGroup(group.id, { 
        participants: newParticipants,
        admins: newAdmins,
        memberCount: newParticipants.length
    });
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!myId) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    const currentReactions = { ...(msg.reactions || {}) };
    const uids: string[] = currentReactions[emoji] || [];
    const newUids = uids.includes(myId) ? uids.filter(id => id !== myId) : [...uids, myId];
    if (newUids.length === 0) delete currentReactions[emoji];
    else currentReactions[emoji] = newUids;
    const { error } = await supabase.from('chat_messages').update({ reactions: currentReactions }).eq('id', messageId);
    if (error) handleSupabaseError(error, 'group-react');
  };

  const formatCreationDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full bg-gray-100 animate-fade-in relative">
        <header className="p-3 flex items-center sticky top-0 bg-white/80 backdrop-blur-md z-10 border-b shadow-sm">
            <button onClick={onClose} className="p-2 text-gray-600 hover:text-emerald-600 mr-1 rounded-full transition-colors">
                <ArrowLeft size={24} />
            </button>
            <img src={group.avatarUrl || `https://picsum.photos/seed/${group.id}/200`} alt={group.name} className="w-10 h-10 rounded-full mr-3 object-cover border border-gray-100" />
            <div className="flex-1 overflow-hidden cursor-pointer" onClick={() => setIsInfoVisible(true)}>
                <h2 className="text-base font-bold text-gray-800 truncate">{group.name}</h2>
                <p className="text-[10px] text-emerald-600 font-medium">{group.memberCount} members</p>
            </div>
            <div className="flex items-center gap-1">
                {pinnedMessages.length > 0 && (
                    <button 
                        onClick={() => setShowPinnedOnly(prev => !prev)}
                        className={`p-2 rounded-full transition-all ${showPinnedOnly ? 'bg-emerald-100 text-emerald-600' : 'text-gray-600 hover:bg-gray-100'}`}
                        title="View pinned messages"
                    >
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

        {/* Pinned Message Bar */}
        {pinnedMessages.length > 0 && !showPinnedOnly && (
            <div className="bg-emerald-50 border-b px-4 py-2 flex items-center justify-between animate-fade-in-down">
                <div className="flex items-center gap-2 overflow-hidden">
                    <Pin size={14} className="text-emerald-600 flex-shrink-0" />
                    <p className="text-xs text-emerald-800 truncate font-medium">
                        {pinnedMessages[pinnedMessages.length - 1].text}
                    </p>
                </div>
                <button 
                    onClick={() => setShowPinnedOnly(true)}
                    className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider ml-2 whitespace-nowrap"
                >
                    View All ({pinnedMessages.length})
                </button>
            </div>
        )}

        {/* Group Info Modal */}
        {isInfoVisible && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
                <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-fade-in-up">
                    <div className="p-6 flex flex-col items-center border-b relative">
                        <button onClick={() => setIsInfoVisible(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600">
                            <X size={24} />
                        </button>
                        <img src={group.avatarUrl || `https://picsum.photos/seed/${group.id}/200`} alt={group.name} className="w-24 h-24 rounded-full object-cover shadow-lg mb-4 border-4 border-emerald-50" />
                        <h2 className="text-xl font-bold text-gray-900">{group.name}</h2>
                        <p className="text-sm text-gray-500 mt-1">Group · {group.memberCount} members</p>
                    </div>
                    
                    <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description</h3>
                            <p className="text-sm text-gray-700 leading-relaxed">
                                {group.description || "No description provided for this group."}
                            </p>
                        </div>
                        
                        <div className="flex justify-between text-sm">
                            <div>
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Created By</h3>
                                <p className="text-gray-700">
                                    {contacts.find(c => c.id === group.createdBy)?.name || "Unknown"}
                                </p>
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
                                    <input 
                                        type="text" 
                                        placeholder="Search members..." 
                                        className="pl-8 pr-3 py-1 bg-gray-100 rounded-full text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 w-32 transition-all focus:w-48"
                                        value={memberSearchQuery}
                                        onChange={e => setMemberSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="divide-y divide-gray-100 bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
                                {filteredMembers.length > 0 ? (
                                    filteredMembers.map(uid => {
                                        const member = contacts.find(c => c.id === uid);
                                        if (!member) return null;
                                        return (
                                            <MemberItem 
                                                key={uid} 
                                                member={member} 
                                                isAdmin={group.admins?.includes(uid) || group.createdBy === uid}
                                                isCurrentUserAdmin={isAdmin}
                                                onRemove={() => handleRemoveMember(uid)}
                                                onClick={() => { setSelectedMember(member); setIsInfoVisible(false); }} 
                                            />
                                        );
                                    })
                                ) : (
                                    <p className="p-4 text-center text-gray-500 text-sm">No members found.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Group Settings Modal */}
        {isSettingsVisible && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
                <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-fade-in-up">
                    <div className="p-4 flex items-center justify-between border-b">
                        <h2 className="text-lg font-bold text-gray-800">Group Settings</h2>
                        <button onClick={() => setIsSettingsVisible(false)} className="p-2 text-gray-400 hover:text-gray-600">
                            <X size={24} />
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Group Name</label>
                                <input 
                                    type="text" 
                                    defaultValue={group.name}
                                    disabled={!isAdmin}
                                    onBlur={(e) => isAdmin && onUpdateGroup(group.id, { name: e.target.value })}
                                    className="w-full bg-gray-100 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Group Avatar URL</label>
                                <input 
                                    type="text" 
                                    defaultValue={group.avatarUrl}
                                    disabled={!isAdmin}
                                    onBlur={(e) => isAdmin && onUpdateGroup(group.id, { avatarUrl: e.target.value })}
                                    className="w-full bg-gray-100 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Description</label>
                                <textarea 
                                    defaultValue={group.description}
                                    disabled={!isAdmin}
                                    onBlur={(e) => isAdmin && onUpdateGroup(group.id, { description: e.target.value })}
                                    rows={3}
                                    className="w-full bg-gray-100 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm disabled:opacity-50 resize-none"
                                    placeholder="Tell members what this group is about..."
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t">
                            <button 
                                onClick={() => onUpdateGroup(group.id, { isMuted: !group.isMuted })}
                                className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    {group.isMuted ? <BellOff size={20} className="text-red-500" /> : <Bell size={20} className="text-emerald-600" />}
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-gray-800">Mute Notifications</p>
                                        <p className="text-[10px] text-gray-500">Silence alerts for this group</p>
                                    </div>
                                </div>
                                <div className={`w-10 h-5 rounded-full relative transition-colors ${group.isMuted ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${group.isMuted ? 'right-1' : 'left-1'}`}></div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Pinned Messages View */}
        {showPinnedOnly && (
            <div className="fixed inset-0 bg-white z-40 flex flex-col animate-fade-in">
                <header className="p-3 flex items-center border-b bg-emerald-50">
                    <button onClick={() => setShowPinnedOnly(false)} className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-full transition-colors mr-2">
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h2 className="text-lg font-bold text-emerald-900">Pinned Messages</h2>
                        <p className="text-xs text-emerald-700">{pinnedMessages.length} messages pinned</p>
                    </div>
                </header>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                    {pinnedMessages.length > 0 ? (
                        pinnedMessages.map(msg => (
                            <div key={msg.id} className="bg-white p-4 rounded-2xl shadow-sm border border-emerald-100 relative">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">{msg.senderName}</p>
                                    <button 
                                        onClick={() => handlePinMessage(msg.id)}
                                        className="text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                                <p className="text-gray-800 text-[15px] leading-relaxed">{msg.text}</p>
                                <p className="text-[10px] text-gray-400 mt-2 text-right">
                                    {new Date(msg.timestamp).toLocaleString()}
                                </p>
                            </div>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <Pin size={48} className="mb-4 opacity-20" />
                            <p>No pinned messages yet.</p>
                        </div>
                    )}
                </div>
            </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {messages.map(msg => (
                <MessageBubble 
                    key={msg.id} 
                    message={msg} 
                    onPin={() => handlePinMessage(msg.id)}
                    isPinned={group.pinnedMessageIds?.includes(msg.id) || false}
                    onReact={(emoji) => handleReact(msg.id, emoji)}
                />
            ))}
            <div ref={messagesEndRef} />
        </div>

        {/* Emoji Picker */}
        {isEmojiPickerOpen && (
            <div ref={emojiPickerRef} className="absolute bottom-16 left-0 right-0 mx-auto w-full max-w-sm bg-white rounded-xl shadow-xl p-2 z-20 overflow-y-auto max-h-64 animate-fade-in-up">
                {Object.entries(categorizedEmojis).map(([category, emojis]) => (
                    <div key={category} className="mb-2">
                        <h3 className="text-sm font-semibold text-gray-500 px-2 py-1 sticky top-0 bg-white z-10">{category}</h3>
                        <div className="grid grid-cols-7 gap-1">
                            {emojis.map((emoji, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleEmojiSelect(emoji)}
                                    className="p-1 text-3xl emoji-3d hover:bg-gray-100 rounded-lg flex items-center justify-center"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        )}

        {isAttachmentMenuOpen && (
            <div ref={attachmentMenuRef} className="absolute bottom-20 left-4 right-4 bg-white rounded-[2rem] shadow-2xl p-4 z-20 animate-fade-in-up border border-gray-100 max-w-sm mx-auto">
                <div className="grid grid-cols-1 gap-1">
                    <AttachmentMenuItem icon={<FileText size={20} />} label="Document" colorClass="text-purple-500 bg-purple-500" />
                    <AttachmentMenuItem icon={<CameraIcon size={20} />} label="Camera" colorClass="text-red-500 bg-red-500" />
                    <AttachmentMenuItem icon={<ImageIcon size={20} />} label="Gallery" colorClass="text-emerald-500 bg-emerald-500" />
                    <AttachmentMenuItem icon={<Headphones size={20} />} label="Audio" colorClass="text-orange-500 bg-orange-500" />
                    <AttachmentMenuItem icon={<MapPin size={20} />} label="Location" colorClass="text-blue-500 bg-blue-500" />
                    <AttachmentMenuItem icon={<UserIcon size={20} />} label="Contact" colorClass="text-cyan-500 bg-cyan-500" />
                </div>
            </div>
        )}

        <div className="p-3 bg-white border-t flex items-center gap-2 z-10">
            <button
                onClick={() => { setIsEmojiPickerOpen(prev => !prev); setIsAttachmentMenuOpen(false); }}
                className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-full transition-colors"
                aria-label="Open emoji picker"
            >
                <Smile size={24} />
            </button>
            <div className="flex-1 relative">
              <input 
                  type="text" 
                  placeholder="Type a message..." 
                  className="w-full bg-gray-100 rounded-2xl py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-[15px] text-gray-900 transition-all"
                  value={message}
                  onChange={e => { setMessage(e.target.value); setIsEmojiPickerOpen(false); }}
                  onKeyPress={e => e.key === 'Enter' && handleSend()}
              />
            </div>
            <button 
                onClick={() => { setIsAttachmentMenuOpen(prev => !prev); setIsEmojiPickerOpen(false); }} 
                className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-full transition-colors"
                aria-label="Open attachment menu"
            >
                <Paperclip size={24} />
            </button>
            <button 
              onClick={handleSend} 
              disabled={!message.trim()}
              className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${
                message.trim() ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'
              }`}
            >
                <Send size={20} className={message.trim() ? 'translate-x-0.5' : ''} />
            </button>
        </div>

        {selectedMember && <UserProfileModal user={selectedMember} onClose={() => setSelectedMember(null)} onInitiateCall={onInitiateCall} onInitiateChat={onInitiateChat} />}

    </div>
  );
};
