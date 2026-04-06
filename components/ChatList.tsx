
import React from 'react';
import type { Chat } from '../types';
import { ChatItem } from './ChatItem';

interface ChatListProps {
  chats: Chat[];
  activeFilter: string;
  onChatSelect: (chat: Chat) => void;
  onChatLongPress: (chat: Chat) => void;
}

export const ChatList: React.FC<ChatListProps> = ({ chats, activeFilter, onChatSelect, onChatLongPress }) => {
  const filteredChats = chats.filter(chat => {
    if (activeFilter === 'Unread') {
      return chat.unreadCount > 0;
    }
    if (activeFilter === 'Groups') {
      return chat.isGroup;
    }
    return true; // 'All'
  });

  return (
    <div className="divide-y divide-gray-200">
      {filteredChats.map((chat) => (
        <ChatItem 
          key={chat.id} 
          chat={chat} 
          onSelect={() => onChatSelect(chat)}
          onLongPress={(e) => {
            e.preventDefault();
            onChatLongPress(chat);
          }}
        />
      ))}
    </div>
  );
};
