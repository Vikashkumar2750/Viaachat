
import React from 'react';
import { Search, QrCode, Bell } from 'lucide-react';
import { User } from '../types';

interface HeaderProps {
    onProfileClick: () => void;
    user: User | null;
}

export const Header: React.FC<HeaderProps> = ({ onProfileClick, user }) => {
  return (
    <header className="bg-gray-950/95 backdrop-blur-xl text-white px-4 pt-safe-top pb-0 flex justify-between items-center z-20 border-b border-white/8">
      <div className="py-3">
        <h1 className="text-xl font-black tracking-tight text-white">ViaaChat</h1>
        <p className="text-[10px] text-emerald-400 font-bold -mt-0.5">End-to-end encrypted</p>
      </div>
      <div className="flex items-center gap-1 text-white/60 pb-1">
        <button aria-label="Notifications" className="w-9 h-9 flex items-center justify-center rounded-2xl hover:bg-white/8 transition-colors active:scale-95">
          <Bell size={20} />
        </button>
        <button aria-label="Search" className="w-9 h-9 flex items-center justify-center rounded-2xl hover:bg-white/8 transition-colors active:scale-95">
          <Search size={20} />
        </button>
        {/* Avatar opens full-screen profile */}
        <button
          onClick={onProfileClick}
          aria-label="Profile & Settings"
          className="w-9 h-9 ml-1 rounded-2xl overflow-hidden border-2 border-emerald-500/40 active:scale-95 transition-transform hover:border-emerald-400"
        >
          <img
            src={user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id || 'guest'}`}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            alt="Profile"
          />
        </button>
      </div>
    </header>
  );
};
