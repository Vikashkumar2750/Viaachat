
import React from 'react';
import { Camera } from 'lucide-react';
import { User } from '../types';

interface HeaderProps {
    onProfileClick: () => void;
    user: User | null;
}

export const Header: React.FC<HeaderProps> = ({ onProfileClick, user }) => {
  return (
    <header className="bg-emerald-600 text-white p-4 flex justify-between items-center shadow-md z-20">
      <h1 className="text-2xl font-bold tracking-tight">ViaaChat</h1>
      <div className="flex items-center space-x-5 text-gray-100">
        <button aria-label="Camera" className="hover:bg-emerald-700 p-2 rounded-full transition-colors">
          <Camera size={22} />
        </button>
        <button onClick={onProfileClick} aria-label="Profile" className="w-9 h-9 rounded-full overflow-hidden border-2 border-emerald-400 active:scale-95 transition-transform">
          <img 
            src={user?.photoURL || "https://picsum.photos/seed/user/200"} 
            className="w-full h-full object-cover" 
            referrerPolicy="no-referrer"
          />
        </button>
      </div>
    </header>
  );
};
