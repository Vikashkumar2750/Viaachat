
import React from 'react';
import { Check, Video, StickyNote, Film, Pin } from 'lucide-react';
import type { Chat } from '../types';

interface ChatItemProps {
  chat: Chat;
  onSelect: () => void;
  onLongPress: (event: React.MouseEvent) => void;
}

const ReadReceipt: React.FC<{ status?: 'sent' | 'delivered' | 'read' }> = ({ status }) => {
  if (!status) return null;
  const color = status === 'read' ? 'text-blue-500' : 'text-gray-400';
  return <Check size={16} className={`${color} mr-1`} />;
};

const MessageTypeIcon: React.FC<{ type: 'video' | 'sticker' | 'gif' | 'text' }> = ({ type }) => {
    switch (type) {
        case 'video':
            return <Video size={14} className="text-gray-400 mr-1.5" />;
        case 'sticker':
            return <StickyNote size={14} className="text-gray-400 mr-1.5" />;
        case 'gif':
            return <Film size={14} className="text-gray-400 mr-1.5" />;
        default:
            return null;
    }
}

const formatTime = (timestamp: any) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const ChatItem: React.FC<ChatItemProps> = ({ chat, onSelect, onLongPress }) => {
  return (
    <div 
      onClick={onSelect}
      onContextMenu={onLongPress}
      className="flex items-center p-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100 last:border-0"
    >
      <div className="relative">
        <img 
          src={chat.avatarUrl || `https://picsum.photos/seed/${chat.id}/200`} 
          alt={chat.name} 
          className="w-14 h-14 rounded-full mr-4 object-cover border border-gray-100" 
          referrerPolicy="no-referrer"
        />
        {chat.unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center">
            <span className="text-[10px] text-white font-bold">{chat.unreadCount}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-1">
          <p className="text-base font-semibold text-gray-900 truncate">{chat.name}</p>
          <p className={`text-xs ${chat.unreadCount > 0 ? 'text-emerald-600 font-bold' : 'text-gray-400'}`}>
            {formatTime(chat.lastMessageTime)}
          </p>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-center text-gray-500 text-sm truncate">
            <ReadReceipt status={chat.status} />
            <MessageTypeIcon type={chat.messageType} />
            <p className="truncate opacity-80">{chat.lastMessage}</p>
          </div>
          <div className="flex items-center space-x-2 ml-2">
            {chat.isPinned && <Pin size={14} className="text-emerald-500 rotate-45" />}
          </div>
        </div>
      </div>
    </div>
  );
};
