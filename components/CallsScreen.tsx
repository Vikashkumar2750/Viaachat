
import React, { useState } from 'react';
import { Phone, Video, ArrowDownLeft, ArrowUpRight, PhoneCall, ShieldAlert, ShieldCheck, Filter } from 'lucide-react';
import type { Call, Contact } from '../types';

const CallTypeIcon: React.FC<{ type: 'incoming' | 'outgoing' | 'missed' }> = ({ type }) => {
    switch (type) {
        case 'incoming':
            return <ArrowDownLeft size={14} className="text-emerald-500" />;
        case 'outgoing':
            return <ArrowUpRight size={14} className="text-emerald-500" />;
        case 'missed':
            return <ArrowDownLeft size={14} className="text-red-500" />;
        default:
            return null;
    }
}

const formatCallTime = (timestamp: any) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString([], { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

const CallLogItem: React.FC<{ 
  call: Call; 
  contacts: Contact[];
  onCall: (contact: Contact, isVideo: boolean) => void;
  isBlocked: boolean;
  onToggleBlock: (id: string) => void;
}> = ({ call, contacts, onCall, isBlocked, onToggleBlock }) => {
  // Try to find the other person in the call
  const otherId = call.type === 'outgoing' ? call.receiverId : call.callerId;
  const contact = contacts.find(c => c.id === otherId) || call.contact || { id: otherId, name: 'Unknown', avatarUrl: `https://picsum.photos/seed/${otherId}/200` };
  
  return (
    <div className="flex items-center p-3 hover:bg-gray-50 transition-colors group relative">
      <div className="relative" onClick={() => onCall(contact, call.isVideo)}>
        <img 
          src={contact.avatarUrl || `https://picsum.photos/seed/${contact.id}/200`} 
          alt={contact.name} 
          className={`w-12 h-12 rounded-full mr-4 object-cover border border-gray-100 cursor-pointer ${isBlocked ? 'grayscale opacity-50' : ''}`} 
          referrerPolicy="no-referrer"
        />
        {isBlocked && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 border-2 border-white">
            <ShieldAlert size={10} />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onCall(contact, call.isVideo)}>
        <div className="flex items-center gap-2">
          <p className={`text-[15px] font-bold truncate ${call.type === 'missed' ? 'text-red-500' : 'text-gray-900'}`}>
            {contact.name}
          </p>
          {isBlocked && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider">Blocked</span>}
        </div>
        <div className="flex items-center text-xs text-gray-500 mt-0.5">
            <CallTypeIcon type={call.type} />
            <span className="ml-1">{formatCallTime(call.timestamp)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button 
          onClick={() => onToggleBlock(contact.id)} 
          className={`p-2 rounded-xl transition-all ${isBlocked ? 'text-emerald-500 hover:bg-emerald-50' : 'text-gray-400 hover:bg-red-50 hover:text-red-500'}`}
          title={isBlocked ? "Unblock User" : "Block User"}
        >
          {isBlocked ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
        </button>
        
        <button 
          onClick={() => !isBlocked && onCall(contact, call.isVideo)} 
          disabled={isBlocked}
          className={`p-3 rounded-full transition-all ${isBlocked ? 'text-gray-300 cursor-not-allowed' : 'text-emerald-600 hover:bg-emerald-50'}`}
        >
            {call.isVideo ? <Video size={20} /> : <Phone size={20} />}
        </button>
      </div>
    </div>
  );
};

interface CallsScreenProps {
  calls: Call[];
  contacts: Contact[];
  onInitiateCall: (contact: Contact, isVideo: boolean) => void;
  onRandomCall: (isVideo: boolean) => void;
  blockedUserIds: string[];
  onToggleBlock: (id: string) => void;
}

export const CallsScreen: React.FC<CallsScreenProps> = ({ 
  calls, 
  contacts, 
  onInitiateCall, 
  onRandomCall,
  blockedUserIds,
  onToggleBlock
}) => {
  const [filter, setFilter] = useState<'All' | 'Missed' | 'Incoming' | 'Outgoing'>('All');

  const filteredCalls = calls.filter(call => {
    if (filter === 'All') return true;
    if (filter === 'Missed') return call.type === 'missed';
    if (filter === 'Incoming') return call.type === 'incoming';
    if (filter === 'Outgoing') return call.type === 'outgoing';
    return true;
  });

  return (
    <div className="h-full relative bg-white flex flex-col">
        <div className="p-4 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-10 border-b">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Calls</h2>
              <p className="text-xs text-gray-500">Your recent call history</p>
            </div>
            <div className="flex bg-gray-100 p-1 rounded-xl">
              {(['All', 'Missed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${filter === f ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {f}
                </button>
              ))}
            </div>
        </div>

        {/* Extended Filters */}
        <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar border-b bg-gray-50/50">
          {(['Incoming', 'Outgoing'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(prev => prev === f ? 'All' : f)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-all border ${filter === f ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-200'}`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filteredCalls.length > 0 ? (
              filteredCalls.map(call => (
                  <CallLogItem 
                    key={call.id} 
                    call={call} 
                    contacts={contacts}
                    onCall={onInitiateCall} 
                    isBlocked={blockedUserIds.includes(call.type === 'outgoing' ? call.receiverId : call.callerId)}
                    onToggleBlock={onToggleBlock}
                  />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <PhoneCall size={48} className="mb-4 opacity-20" />
                <p className="text-sm">No {filter !== 'All' ? filter.toLowerCase() : ''} calls found</p>
                {filter !== 'All' && (
                  <button onClick={() => setFilter('All')} className="mt-4 text-emerald-600 font-bold text-sm">View All Calls</button>
                )}
              </div>
            )}
        </div>
        
         <button
            onClick={() => onRandomCall(false)}
            aria-label="Random Call"
            className="fixed bottom-20 right-4 bg-emerald-500 hover:bg-emerald-600 text-white w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 z-30"
            >
            <PhoneCall size={24} />
        </button>
    </div>
  );
};
