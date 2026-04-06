
import React, { useState } from 'react';
import { Plus, MessageSquare, PhoneCall, X, UserPlus } from 'lucide-react';
import type { Contact } from '../types';

interface FabProps {
  onNewChat: () => void;
  onLastCalledChat: () => void;
  onSendFriendRequest: (toId: string, toName: string, toAvatarUrl: string) => void;
  lastCalledUser: Contact | null;
  isFriendRequestSent: boolean;
}

export const Fab: React.FC<FabProps> = ({ 
  onNewChat, 
  onLastCalledChat, 
  onSendFriendRequest, 
  lastCalledUser,
  isFriendRequestSent
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-20 right-4 flex flex-col items-end space-y-3 z-30">
      {isOpen && (
        <>
          <button
            onClick={() => {
              if (lastCalledUser && !isFriendRequestSent) {
                onSendFriendRequest(lastCalledUser.id, lastCalledUser.name, lastCalledUser.avatarUrl);
              }
            }}
            disabled={!lastCalledUser || isFriendRequestSent}
            className={`w-12 h-12 rounded-2xl shadow-lg flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 animate-slide-up ${
              lastCalledUser 
                ? isFriendRequestSent 
                  ? 'bg-gray-100 text-gray-400 cursor-default' 
                  : 'bg-white text-emerald-600' 
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
            }`}
            title={isFriendRequestSent ? "Friend Request Sent" : "Add Last Called as Friend"}
          >
            <UserPlus size={20} />
          </button>
          <button
            onClick={() => { onLastCalledChat(); setIsOpen(false); }}
            disabled={!lastCalledUser}
            className={`w-12 h-12 rounded-2xl shadow-lg flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 animate-slide-up ${
              lastCalledUser ? 'bg-white text-emerald-600' : 'bg-gray-100 text-gray-300 cursor-not-allowed'
            }`}
            title="Chat with Last Called"
          >
            <PhoneCall size={20} />
          </button>
          <button
            onClick={() => { onNewChat(); setIsOpen(false); }}
            className="bg-white text-emerald-600 w-12 h-12 rounded-2xl shadow-lg flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 animate-slide-up"
            title="New Chat"
          >
            <MessageSquare size={20} />
          </button>
        </>
      )}
      
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Actions"
        className={`bg-emerald-500 hover:bg-emerald-600 text-white w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 ${isOpen ? 'rotate-45 bg-red-500 hover:bg-red-600' : ''}`}
      >
        {isOpen ? <X size={28} /> : <Plus size={28} />}
      </button>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
};
