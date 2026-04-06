
import React, { useState, useEffect } from 'react';
import {
  Plus, Users, Search, ArrowRight, Lock, X, Mic, Hash, Radio,
  TrendingUp, Clock, RefreshCw
} from 'lucide-react';
import { supabase, handleSupabaseError } from '../supabase';
import type { Room, User, Contact, Seat } from '../types';

interface RoomsScreenProps {
  user: User;
  contacts: Contact[];
  onRoomSelect: (room: Room) => void;
}

const dbToRoom = (row: any): Room => ({
  id: row.id,
  numericId: row.numeric_id,
  name: row.name,
  ownerId: row.owner_id,
  admins: row.admins || [],
  seats: row.seats || [],
  createdAt: row.created_at,
  participantCount: row.participant_count || 0,
  description: row.description,
  avatarUrl: row.avatar_url,
  isLocked: row.is_locked || false,
  bannedUserIds: row.banned_user_ids || [],
  typingStatus: row.typing_status || {},
});

export const RoomsScreen: React.FC<RoomsScreenProps> = ({ user, contacts, onRoomSelect }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [joinByIdValue, setJoinByIdValue] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [activeView, setActiveView] = useState<'all' | 'mine'>('all');

  // ─── Fetch rooms (real-time) ───────────────────────────────────────────────
  useEffect(() => {
    const fetchRooms = async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) { handleSupabaseError(error, 'rooms/fetch'); return; }
      setRooms((data || []).map(dbToRoom));
    };

    fetchRooms();

    // Real-time updates for room list
    const channel = supabase
      .channel('rooms-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rooms' }, (p) => {
        setRooms(prev => [dbToRoom(p.new), ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms' }, (p) => {
        setRooms(prev => prev.map(r => r.id === p.new.id ? dbToRoom(p.new) : r));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'rooms' }, (p) => {
        setRooms(prev => prev.filter(r => r.id !== (p.old as any).id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── Create room ──────────────────────────────────────────────────────────
  const handleCreateRoom = async () => {
    if (!roomName.trim() || !user) return;
    setIsCreating(true);
    setCreateError(null);

    // Hard timeout: never spin longer than 12s
    const timeoutId = setTimeout(() => {
      setIsCreating(false);
      setCreateError('Room creation timed out. Please check your connection and try again.');
    }, 12000);

    try {
      // ── Step 1: Ensure user profile exists in DB (FK guard) ──────────────
      // Room's owner_id FK references users(id). If the profile hasn't been
      // committed yet (race with auth sync on first load), the insert fails
      // with a foreign key constraint error. We upsert to guarantee it exists.
      const { error: upsertError } = await supabase.from('users').upsert(
        {
          id: user.uid,
          display_name: user.displayName,
          photo_url: user.photoURL,
          email: user.email || null,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      if (upsertError) {
        setCreateError('Could not verify your account. Please sign out and sign back in.');
        return;
      }

      // ── Step 2: Build initial seat structure ─────────────────────────────
      const initialSeats: Seat[] = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        userId: null,
        userName: null,
        userAvatar: null,
        isMuted: false,
        isClosed: false,
        isLocked: false,
        offeredToId: null,
        isVideoOn: false,
      }));

      // Deterministic avatar using user's ID as seed — no external call during insert
      const avatarUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${user.uid}-${Date.now()}`;

      // ── Step 3: Insert the room ──────────────────────────────────────────
      const { data, error } = await supabase.from('rooms').insert({
        name: roomName.trim(),
        description: roomDescription.trim() || null,
        owner_id: user.uid,
        admins: [],
        seats: initialSeats,
        participant_count: 0,
        avatar_url: avatarUrl,
        is_locked: false,
        banned_user_ids: [],
        typing_status: {},
      }).select().single();

      if (error) {
        if (error.code === '23503') {
          setCreateError('Account sync error. Please sign out and sign back in.');
        } else if (error.code === '42501') {
          setCreateError('Permission denied. Make sure you are signed in.');
        } else {
          setCreateError(error.message || 'Failed to create room. Please try again.');
        }
        return;
      }

      // ── Success ──────────────────────────────────────────────────────────
      setRoomName('');
      setRoomDescription('');
      setIsCreateModalOpen(false);
      onRoomSelect(dbToRoom(data));
    } catch (err: any) {
      setCreateError(err?.message || 'Unexpected error. Please try again.');
    } finally {
      clearTimeout(timeoutId);
      setIsCreating(false);
    }
  };

  // ─── Join by numeric ID ───────────────────────────────────────────────────
  const handleJoinById = async () => {
    const numId = parseInt(joinByIdValue.trim(), 10);
    if (isNaN(numId) || numId < 1) {
      setJoinError('Please enter a valid room ID number.');
      return;
    }
    setIsJoining(true);
    setJoinError(null);
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('numeric_id', numId)
        .single();

      if (error || !data) {
        setJoinError(`Room #${numId} not found.`);
        return;
      }
      const room = dbToRoom(data);
      const isAdmin = room.ownerId === user.uid || room.admins.includes(user.uid);
      if (room.isLocked && !isAdmin) {
        setJoinError('This room is currently locked by the owner.');
        return;
      }
      if (room.bannedUserIds.includes(user.uid)) {
        setJoinError('You are banned from this room.');
        return;
      }
      setJoinByIdValue('');
      onRoomSelect(room);
    } finally {
      setIsJoining(false);
    }
  };

  const handleEnterRoom = (room: Room) => {
    const isAdmin = room.ownerId === user.uid || room.admins.includes(user.uid);
    if (room.isLocked && !isAdmin) {
      alert('This room is currently locked by the owner.');
      return;
    }
    if (room.bannedUserIds.includes(user.uid)) {
      alert('You are banned from this room.');
      return;
    }
    onRoomSelect(room);
  };

  const filteredRooms = rooms.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesView = activeView === 'all' || r.ownerId === user.uid;
    return matchesSearch && matchesView;
  });

  const myRoomsCount = rooms.filter(r => r.ownerId === user.uid).length;

  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Live Rooms</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">
              {rooms.filter(r => r.participantCount > 0).length} active now
            </p>
          </div>
          <button
            onClick={() => { setIsCreateModalOpen(true); setCreateError(null); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all active:scale-90 font-bold text-sm"
          >
            <Plus size={18} />
            Create
          </button>
        </div>

        {/* Join by ID */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="number"
              placeholder="Enter Room ID to join..."
              value={joinByIdValue}
              onChange={e => { setJoinByIdValue(e.target.value); setJoinError(null); }}
              onKeyDown={e => e.key === 'Enter' && handleJoinById()}
              className="w-full bg-gray-100 rounded-xl py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
            />
          </div>
          <button
            onClick={handleJoinById}
            disabled={!joinByIdValue.trim() || isJoining}
            className="px-4 py-2.5 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all shadow-sm disabled:opacity-40 active:scale-90"
          >
            {isJoining ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : 'Join'}
          </button>
        </div>
        {joinError && (
          <p className="text-red-500 text-xs font-bold mb-3 px-1 flex items-center gap-1">
            <X size={12} /> {joinError}
          </p>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search rooms..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-gray-100 rounded-2xl py-2.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
          />
        </div>

        {/* Filter pills */}
        <div className="flex gap-2">
          {(['all', 'mine'] as const).map(view => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeView === view ? 'bg-emerald-500 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {view === 'all' ? `All (${rooms.length})` : `My Rooms (${myRoomsCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 no-scrollbar">
        {filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
              <Radio size={28} className="text-gray-300" />
            </div>
            <p className="text-gray-400 font-bold text-sm">No rooms found</p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-3 text-emerald-600 font-black text-sm hover:underline"
            >
              Create the first one →
            </button>
          </div>
        ) : (
          filteredRooms.map(room => {
            const seatedUsers = room.seats.filter(s => s.userId);
            const isMyRoom = room.ownerId === user.uid;

            return (
              <div
                key={room.id}
                onClick={() => handleEnterRoom(room)}
                className="bg-white p-4 rounded-[1.75rem] shadow-sm border border-gray-100 hover:shadow-md hover:border-emerald-100 transition-all cursor-pointer active:scale-[0.98] group"
              >
                <div className="flex items-center gap-3.5">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <img
                      src={room.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${room.id}`}
                      alt={room.name}
                      className="w-14 h-14 rounded-2xl object-cover"
                    />
                    {seatedUsers.length > 0 && (
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-md">
                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      </div>
                    )}
                    {room.isLocked && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow-md">
                        <Lock size={9} className="text-white" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[9px] font-black bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Hash size={8} />
                        {room.numericId}
                      </span>
                      {isMyRoom && (
                        <span className="text-[9px] font-black bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">Owner</span>
                      )}
                    </div>
                    <h3 className="text-base font-black text-gray-900 truncate group-hover:text-emerald-600 transition-colors">
                      {room.name}
                    </h3>
                    {room.description && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{room.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex -space-x-1.5">
                        {seatedUsers.slice(0, 4).map((s, i) => (
                          <img
                            key={i}
                            src={s.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${s.userId}`}
                            className="w-5 h-5 rounded-full border border-white object-cover"
                            alt=""
                          />
                        ))}
                        {seatedUsers.length > 4 && (
                          <div className="w-5 h-5 rounded-full bg-gray-100 border border-white flex items-center justify-center text-[7px] font-black text-gray-500">
                            +{seatedUsers.length - 4}
                          </div>
                        )}
                      </div>
                      {seatedUsers.length > 0 && (
                        <span className="text-[10px] text-gray-400 font-bold">
                          {seatedUsers.length} speaker{seatedUsers.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {seatedUsers.length === 0 && (
                        <span className="text-[10px] text-gray-300 font-bold">Empty · Join first!</span>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="p-2 bg-gray-50 rounded-xl text-gray-300 group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-all flex-shrink-0">
                    <ArrowRight size={18} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create Room Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isCreating && setIsCreateModalOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-t-[2.5rem] shadow-2xl p-7 animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-black text-gray-900">New Room</h3>
                <p className="text-xs text-gray-400 mt-0.5">10 seats for live discussions</p>
              </div>
              <button
                onClick={() => !isCreating && setIsCreateModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={22} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Room Name *</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateRoom()}
                  placeholder="e.g. Tech Talk 🎙️"
                  className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                  autoFocus
                  maxLength={60}
                  disabled={isCreating}
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Description (optional)</label>
                <input
                  type="text"
                  value={roomDescription}
                  onChange={e => setRoomDescription(e.target.value)}
                  placeholder="What's this room about?"
                  className="w-full bg-gray-50 border-none rounded-2xl py-3.5 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                  maxLength={100}
                  disabled={isCreating}
                />
              </div>

              {/* Error message */}
              {createError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
                  <X size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 font-bold">{createError}</p>
                </div>
              )}

              {/* Progress steps when creating */}
              {isCreating && (
                <div className="flex flex-col gap-1.5 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Setting up your room…</p>
                  <div className="w-full bg-emerald-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full animate-pulse" style={{ width: '70%' }} />
                  </div>
                </div>
              )}

              <button
                onClick={handleCreateRoom}
                disabled={!roomName.trim() || isCreating}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 text-base"
              >
                {isCreating ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : <Radio size={20} />}
                {isCreating ? 'Creating room…' : 'Launch Room'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-up { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-up { animation: slide-up 0.35s cubic-bezier(0.16, 1, 0.3,1) forwards; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};
