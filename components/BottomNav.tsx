
import React from 'react';
import { MessageSquare, CircleDashed, Users, Phone, Radio } from 'lucide-react';
import type { Tab } from '../types';

interface BottomNavProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

const NavItem: React.FC<{
  tabKey: Tab;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: number;
}> = ({ label, icon, active, onClick, badge }) => (
  <button onClick={onClick} className="flex flex-col items-center justify-center w-1/5 transition-all relative group">
    <div className={`p-1.5 px-4 rounded-full transition-all duration-300 ${active ? 'bg-emerald-500/15' : 'bg-transparent group-hover:bg-white/8'}`}>
        <div className={`${active ? 'text-emerald-400 scale-110' : 'text-white/40'} transition-transform`}>
          {icon}
        </div>
    </div>
    <span className={`text-[10px] mt-0.5 transition-colors ${active ? 'font-black text-emerald-400' : 'font-medium text-white/40'}`}>{label}</span>
    {badge && badge > 0 && (
        <span className="absolute top-1 right-2 bg-emerald-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full border-2 border-gray-950 shadow-sm">
          {badge > 9 ? '9+' : badge}
        </span>
    )}
  </button>
);

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-gray-900/95 backdrop-blur-xl border-t border-white/8 h-16 flex justify-around items-center shadow-2xl z-30 pb-safe-bottom" style={{ height: 'calc(4rem + env(safe-area-inset-bottom))' }}>
      <NavItem tabKey="Chats" label="Chats" icon={<MessageSquare size={22} />} active={activeTab === 'Chats'} onClick={() => setActiveTab('Chats')} badge={2} />
      <NavItem tabKey="Updates" label="Updates" icon={<CircleDashed size={22} />} active={activeTab === 'Updates'} onClick={() => setActiveTab('Updates')} />
      <NavItem tabKey="Communities" label="Groups" icon={<Users size={22} />} active={activeTab === 'Communities'} onClick={() => setActiveTab('Communities')} />
      <NavItem tabKey="Rooms" label="Rooms" icon={<Radio size={22} />} active={activeTab === 'Rooms'} onClick={() => setActiveTab('Rooms')} />
      <NavItem tabKey="Calls" label="Calls" icon={<Phone size={22} />} active={activeTab === 'Calls'} onClick={() => setActiveTab('Calls')} />
    </nav>
  );
};
