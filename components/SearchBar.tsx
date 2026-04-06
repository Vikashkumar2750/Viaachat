
import React from 'react';
import { Search } from 'lucide-react';

export const SearchBar: React.FC = () => {
  return (
    <div className="px-4 py-3">
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search size={18} className="text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
        </div>
        <input
          type="text"
          placeholder="Search chats..."
          className="w-full bg-gray-100 text-gray-800 rounded-2xl py-2.5 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all text-[15px]"
        />
      </div>
    </div>
  );
};
