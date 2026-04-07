import React, { useState } from 'react';
import {
  Phone, Video, ArrowDownLeft, ArrowUpRight, PhoneCall,
  ShieldAlert, ShieldCheck, Clock, Shuffle, Mic,
} from 'lucide-react';
import type { Call, Contact } from '../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

const CallTypeIcon: React.FC<{ type: 'incoming' | 'outgoing' | 'missed' }> = ({ type }) => {
  switch (type) {
    case 'incoming': return <ArrowDownLeft size={13} className="text-emerald-500" />;
    case 'outgoing': return <ArrowUpRight size={13} className="text-blue-500" />;
    case 'missed':   return <ArrowDownLeft size={13} className="text-red-500" />;
    default:         return null;
  }
};

const formatCallTime = (timestamp: any): string => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatDuration = (seconds?: number): string => {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

// ── Call Log Item ────────────────────────────────────────────────────────────

const CallLogItem: React.FC<{
  call: Call;
  contacts: Contact[];
  onCall: (contact: Contact, isVideo: boolean) => void;
  isBlocked: boolean;
  onToggleBlock: (id: string) => void;
}> = ({ call, contacts, onCall, isBlocked, onToggleBlock }) => {
  const otherId = call.callerId === contacts[0]?.id ? call.receiverId : call.callerId;
  const contact = contacts.find(c => c.id === (call.type === 'outgoing' ? call.receiverId : call.callerId))
    || call.contact
    || { id: otherId, name: 'Unknown', avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherId}` };

  const isMissed = call.type === 'missed';

  return (
    <div className={`flex items-center px-4 py-3 hover:bg-gray-50 transition-colors group relative ${isMissed ? 'bg-red-50/30' : ''}`}>
      {/* Avatar */}
      <div className="relative flex-shrink-0 mr-3 cursor-pointer" onClick={() => !isBlocked && onCall(contact, call.isVideo)}>
        <img
          src={contact.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${contact.id}`}
          alt={contact.name}
          className={`w-12 h-12 rounded-2xl object-cover border border-gray-100 ${isBlocked ? 'grayscale opacity-50' : ''}`}
          referrerPolicy="no-referrer"
        />
        {isBlocked && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 border-2 border-white">
            <ShieldAlert size={9} />
          </div>
        )}
        {/* Video badge */}
        {call.isVideo && !isBlocked && (
          <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white rounded-full p-0.5 border-2 border-white">
            <Video size={9} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => !isBlocked && onCall(contact, call.isVideo)}>
        <div className="flex items-center gap-2 mb-0.5">
          <p className={`text-[15px] font-bold truncate ${isMissed ? 'text-red-500' : 'text-gray-900'}`}>
            {contact.name}
          </p>
          {isBlocked && (
            <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0">
              Blocked
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <CallTypeIcon type={call.type} />
          <span>{formatCallTime(call.timestamp)}</span>
          {call.duration && (
            <>
              <span className="text-gray-200">·</span>
              <Clock size={10} className="text-gray-300" />
              <span>{formatDuration(call.duration)}</span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onToggleBlock(contact.id)}
          className={`p-2 rounded-xl transition-all ${isBlocked ? 'text-emerald-500 hover:bg-emerald-50' : 'text-gray-400 hover:bg-red-50 hover:text-red-500'}`}
          title={isBlocked ? 'Unblock' : 'Block'}
        >
          {isBlocked ? <ShieldCheck size={17} /> : <ShieldAlert size={17} />}
        </button>
        <button
          onClick={() => !isBlocked && onCall(contact, call.isVideo)}
          disabled={isBlocked}
          className={`p-2.5 rounded-xl transition-all ${isBlocked ? 'text-gray-200 cursor-not-allowed' : 'text-emerald-600 hover:bg-emerald-50'}`}
        >
          {call.isVideo ? <Video size={18} /> : <Phone size={18} />}
        </button>
      </div>
    </div>
  );
};

// ── Random Call Banner ───────────────────────────────────────────────────────

const RandomCallBanner: React.FC<{ onRandomCall: (isVideo: boolean) => void }> = ({ onRandomCall }) => (
  <div className="mx-4 my-3 rounded-3xl overflow-hidden shadow-lg shadow-emerald-500/10 border border-emerald-100">
    {/* Header */}
    <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <Shuffle size={16} className="text-white/80" />
        <span className="text-white/80 text-xs font-bold uppercase tracking-widest">Random Match</span>
      </div>
      <h3 className="text-white font-black text-lg leading-tight">Talk to a stranger</h3>
      <p className="text-white/70 text-xs mt-0.5 leading-relaxed">
        You'll auto-connect when someone else is also searching
      </p>
    </div>

    {/* Buttons */}
    <div className="bg-white grid grid-cols-2 divide-x divide-gray-100">
      <button
        onClick={() => onRandomCall(false)}
        className="flex flex-col items-center gap-2 py-4 hover:bg-emerald-50 transition-colors group active:scale-95"
      >
        <div className="w-11 h-11 rounded-2xl bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center transition-colors">
          <Mic size={20} className="text-emerald-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-black text-gray-800">Voice</p>
          <p className="text-[10px] text-gray-400">Audio only</p>
        </div>
      </button>
      <button
        onClick={() => onRandomCall(true)}
        className="flex flex-col items-center gap-2 py-4 hover:bg-blue-50 transition-colors group active:scale-95"
      >
        <div className="w-11 h-11 rounded-2xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
          <Video size={20} className="text-blue-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-black text-gray-800">Video</p>
          <p className="text-[10px] text-gray-400">Face to face</p>
        </div>
      </button>
    </div>
  </div>
);

// ── Section Header ────────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ label: string; count?: number }> = ({ label, count }) => (
  <div className="px-4 py-2 flex items-center gap-2">
    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
    {count !== undefined && count > 0 && (
      <span className="text-[9px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{count}</span>
    )}
  </div>
);

// ── Main Screen ──────────────────────────────────────────────────────────────

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
  onToggleBlock,
}) => {
  const [filter, setFilter] = useState<'All' | 'Missed' | 'Incoming' | 'Outgoing'>('All');

  const filteredCalls = calls.filter(call => {
    if (filter === 'All')      return true;
    if (filter === 'Missed')   return call.type === 'missed';
    if (filter === 'Incoming') return call.type === 'incoming';
    if (filter === 'Outgoing') return call.type === 'outgoing';
    return true;
  });

  const missedCount = calls.filter(c => c.type === 'missed').length;

  return (
    <div className="h-full bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Calls</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {calls.length > 0 ? `${calls.length} recent calls` : 'No recent calls'}
            </p>
          </div>
          {missedCount > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 text-red-500 px-3 py-1.5 rounded-full border border-red-100">
              <ArrowDownLeft size={12} />
              <span className="text-xs font-black">{missedCount} missed</span>
            </div>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['All', 'Missed', 'Incoming', 'Outgoing'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex-shrink-0 ${
                filter === f
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f}
              {f === 'Missed' && missedCount > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-black ${filter === 'Missed' ? 'bg-white/30 text-white' : 'bg-red-100 text-red-500'}`}>
                  {missedCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Random Call Banner — shown on All tab */}
        {filter === 'All' && <RandomCallBanner onRandomCall={onRandomCall} />}

        {/* Call log */}
        {filteredCalls.length > 0 ? (
          <>
            <SectionLabel label="Recent" count={filteredCalls.length} />
            <div className="bg-white rounded-2xl mx-4 mb-4 overflow-hidden border border-gray-100 shadow-sm divide-y divide-gray-50">
              {filteredCalls.map(call => (
                <CallLogItem
                  key={call.id}
                  call={call}
                  contacts={contacts}
                  onCall={onInitiateCall}
                  isBlocked={blockedUserIds.includes(call.type === 'outgoing' ? call.receiverId : call.callerId)}
                  onToggleBlock={onToggleBlock}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mb-4">
              <PhoneCall size={32} className="text-gray-300" />
            </div>
            <p className="text-sm font-bold text-gray-600 mb-1">
              {filter !== 'All' ? `No ${filter.toLowerCase()} calls` : 'No calls yet'}
            </p>
            <p className="text-xs text-gray-400 max-w-[220px] leading-relaxed mb-4">
              {filter !== 'All'
                ? `Switch to "All" to see your full call history`
                : 'Use Random Match above to start talking with someone right now'}
            </p>
            {filter !== 'All' && (
              <button onClick={() => setFilter('All')} className="text-emerald-600 font-black text-sm">
                View All Calls
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
