import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, Users, Crown, Shield, MessageSquare, UserPlus,
  Settings, Lock, Globe, X, Camera, Check, Loader2, ChevronRight,
  Image as ImageIcon, UserMinus, LogOut, Trash2, Edit2, Bell, BellOff,
} from 'lucide-react';
import { supabase } from '../supabase';
import type { User, Chat, Contact } from '../types';
import { AdBanner } from './AdBanner';

interface GroupsScreenProps {
  user: User;
  contacts: Contact[];
  chats: Chat[];
  onOpenChat: (chat: Chat) => void;
  onCreateGroup: () => void;
}

// ─── Group Card ───────────────────────────────────────────────────────────────
const GroupCard: React.FC<{
  group: Chat;
  userId: string;
  onTap: () => void;
}> = ({ group, userId, onTap }) => {
  const isOwner = group.createdBy === userId;
  const isAdmin = (group.admins || []).includes(userId);
  const memberCount = (group.participants || []).length;

  return (
    <button
      onClick={onTap}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 active:bg-white/5 transition-all text-left"
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {group.avatarUrl ? (
          <img src={group.avatarUrl} alt={group.name}
            className="w-14 h-14 rounded-2xl object-cover border border-white/10" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center border border-white/10">
            <span className="text-white font-black text-xl">{group.name?.[0]?.toUpperCase() || 'G'}</span>
          </div>
        )}
        {/* Role badge */}
        {(isOwner || isAdmin) && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border border-gray-950
            bg-amber-500">
            {isOwner ? <Crown size={9} className="text-white" /> : <Shield size={9} className="text-white" />}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="font-bold text-white text-[15px] truncate">{group.name}</p>
          {group.lastMessageTime && (
            <p className="text-[10px] text-white/30 flex-shrink-0 ml-2">
              {new Date(group.lastMessageTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Users size={11} className="text-white/30" />
          <span className="text-xs text-white/40">{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
          {group.lastMessage && (
            <>
              <span className="text-white/15">·</span>
              <p className="text-xs text-white/40 truncate">{group.lastMessage}</p>
            </>
          )}
        </div>
      </div>

      {/* Unread */}
      {(group.unreadCount || 0) > 0 && (
        <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-[9px] text-white font-black">{group.unreadCount}</span>
        </div>
      )}
    </button>
  );
};

// ─── Create Group Modal ───────────────────────────────────────────────────────
const CreateGroupModal: React.FC<{
  user: User;
  contacts: Contact[];
  onClose: () => void;
  onCreated: (chat: Chat) => void;
}> = ({ user, contacts, onClose, onCreated }) => {
  const [step, setStep] = useState<'info' | 'members'>('info');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'open' | 'private'>('open');
  const [selected, setSelected] = useState<string[]>([]);
  const [searching, setSearching] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searching.toLowerCase()) ||
    c.email?.toLowerCase().includes(searching.toLowerCase())
  );

  const toggleMember = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.size > 3 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const [createError, setCreateError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const userId = user.id || (user as any).uid;
      const participants = [userId, ...selected];

      // Only insert columns that exist in the chats schema
      const { data, error } = await supabase.from('chats').insert({
        name: name.trim(),
        description: description.trim() || null,
        is_group: true,
        participants,
        created_by: userId,
        admins: [userId],
        avatar_url: avatarPreview || null,
        last_message: '',
        last_message_time: new Date().toISOString(),
        unread_count: 0,
        is_pinned: false,
        message_type: 'text',
        pinned_message_ids: [],
        is_muted: false,
        typing_status: {},
      }).select().single();

      if (error) {
        console.error('Create group DB error:', error);
        setCreateError(error.message || 'Failed to create group. Try again.');
        return;
      }

      if (data) {
        onCreated({
          id: data.id,
          name: data.name,
          avatarUrl: data.avatar_url || '',
          lastMessage: '',
          lastMessageTime: data.last_message_time,
          unreadCount: 0,
          isPinned: false,
          messageType: 'text',
          isGroup: true,
          participants: data.participants || [],
          memberCount: participants.length,
          createdBy: data.created_by,
          createdAt: data.created_at,
          description: data.description,
          admins: data.admins || [],
          pinnedMessageIds: [],
          isMuted: false,
          typingStatus: {},
        });
        onClose();
      }
    } catch (err: any) {
      console.error('Create group failed:', err);
      setCreateError(err?.message || 'Unexpected error. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gray-950 flex flex-col overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex-shrink-0 bg-gray-900/80 backdrop-blur-xl border-b border-white/10 px-4 pt-safe-top">
        <div className="flex items-center gap-3 py-3">
          <button onClick={step === 'info' ? onClose : () => setStep('info')}
            className="p-2 -ml-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all">
            <X size={20} />
          </button>
          <h2 className="text-base font-black text-white flex-1">
            {step === 'info' ? 'New Group' : 'Add Members'}
          </h2>
          <button onClick={handleCreate} disabled={creating || !name.trim()}
            className="flex items-center gap-1 text-emerald-400 font-bold text-sm disabled:text-white/20 transition-colors">
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Create
          </button>
        </div>
      </div>

      {/* Error banner */}
      {createError ? (
        <div className="flex-shrink-0 mx-4 mt-3 bg-red-500/15 border border-red-500/30 rounded-2xl px-4 py-3">
          <p className="text-sm text-red-400 font-semibold">{createError}</p>
        </div>
      ) : null}

      {step === 'info' ? (
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
          {/* Avatar picker */}
          <div className="flex justify-center">
            <button onClick={() => fileRef.current?.click()} className="relative group">
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="w-24 h-24 rounded-3xl object-cover border-2 border-emerald-500/30" />
              ) : (
                <div className="w-24 h-24 rounded-3xl bg-white/8 border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-1 hover:border-emerald-500/40 transition-all">
                  <Camera size={24} className="text-white/30" />
                  <span className="text-[10px] text-white/30">Add Photo</span>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            </button>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest mb-1.5 block">Group Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Friends Trip 2025, Study Group..."
              maxLength={50}
              className="w-full bg-white/8 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-emerald-500/50 text-sm font-semibold"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this group about?"
              maxLength={200}
              rows={3}
              className="w-full bg-white/8 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-emerald-500/50 text-sm resize-none"
            />
          </div>

          {/* Privacy */}
          <div>
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest mb-1.5 block">Privacy</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: 'open', icon: <Globe size={16} />, label: 'Open', sub: 'Anyone can join' },
                { val: 'private', icon: <Lock size={16} />, label: 'Private', sub: 'Invite only' },
              ].map(({ val, icon, label, sub }) => (
                <button key={val} onClick={() => setPrivacy(val as any)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-2xl border transition-all ${
                    privacy === val
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                      : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'
                  }`}>
                  {icon}
                  <p className="text-sm font-bold">{label}</p>
                  <p className="text-[10px] opacity-70">{sub}</p>
                </button>
              ))}
            </div>
          </div>
          {/* Add members shortcut */}
          <button
            onClick={() => name.trim() && setStep('members')}
            disabled={!name.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-white/10 bg-white/5 text-white/60 text-sm font-bold hover:bg-white/8 active:scale-95 transition-all disabled:opacity-30"
          >
            <Users size={16} /> Add members (optional)
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Selected preview */}
          {selected.length > 0 && (
            <div className="flex-shrink-0 px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar border-b border-white/10">
              {selected.map(id => {
                const c = contacts.find(ct => ct.id === id);
                return c ? (
                  <button key={id} onClick={() => toggleMember(id)} className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div className="relative">
                      <img src={c.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`}
                        alt={c.name} className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                        <X size={8} className="text-white" />
                      </div>
                    </div>
                    <span className="text-[9px] text-white/50 w-10 text-center truncate">{c.name.split(' ')[0]}</span>
                  </button>
                ) : null;
              })}
            </div>
          )}

          {/* Search */}
          <div className="flex-shrink-0 px-4 py-2">
            <div className="flex items-center gap-2 bg-white/8 border border-white/10 rounded-2xl px-3 py-2.5">
              <Search size={16} className="text-white/30" />
              <input value={searching} onChange={e => setSearching(e.target.value)}
                placeholder="Search contacts..."
                className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none" />
            </div>
          </div>

          {/* Contact list */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 pt-16 text-white/30">
                <Users size={40} />
                <p className="text-sm">No contacts found</p>
              </div>
            ) : filteredContacts.map(c => {
              const isSelected = selected.includes(c.id);
              return (
                <button key={c.id} onClick={() => toggleMember(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-all">
                  <img src={c.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.id}`}
                    alt={c.name} className="w-11 h-11 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold text-white truncate">{c.name}</p>
                    <p className="text-xs text-white/40 truncate">{c.email || 'ViaaChat user'}</p>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0
                    ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-white/20'}`}>
                    {isSelected && <Check size={12} className="text-white" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── GROUPS SCREEN (replaces Communities) ────────────────────────────────────
export const GroupsScreen: React.FC<GroupsScreenProps> = ({
  user, contacts, chats, onOpenChat, onCreateGroup,
}) => {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [localChats, setLocalChats] = useState<Chat[]>(chats);
  const [filter, setFilter] = useState<'all' | 'mine' | 'admin'>('all');

  // Sync with parent chats  
  useEffect(() => { setLocalChats(chats); }, [chats]);

  const myGroups = localChats.filter(c => c.isGroup && c.participants?.includes(user.id));
  const myOwnedGroups = myGroups.filter(c => c.createdBy === user.id);
  const myAdminGroups = myGroups.filter(c => (c.admins || []).includes(user.id) && c.createdBy !== user.id);

  const filtered = (filter === 'mine' ? myOwnedGroups
    : filter === 'admin' ? myAdminGroups
    : myGroups
  ).filter(g =>
    !search || g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleGroupCreated = (chat: Chat) => {
    setLocalChats(prev => [chat, ...prev]);
    onOpenChat(chat);
  };

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-2 pb-3 border-b border-white/8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-black text-white">Groups</h2>
            <p className="text-xs text-white/40">{myGroups.length} group{myGroups.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white text-sm font-black rounded-2xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 active:scale-95 transition-all">
            <Plus size={16} /> New Group
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-white/8 border border-white/10 rounded-2xl px-3 py-2.5 mb-3">
          <Search size={15} className="text-white/30 flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search groups..."
            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none" />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {[
            { key: 'all', label: `All (${myGroups.length})` },
            { key: 'mine', label: `My Groups (${myOwnedGroups.length})` },
            { key: 'admin', label: `Admin (${myAdminGroups.length})` },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filter === key
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white/8 text-white/50 hover:bg-white/12'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 pt-16 px-8">
            <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center">
              <Users size={36} className="text-white/20" />
            </div>
            <div className="text-center">
              <p className="text-white/60 font-bold">
                {search ? 'No groups found' : filter === 'mine' ? 'No groups created yet' : 'No groups yet'}
              </p>
              <p className="text-white/30 text-sm mt-1">
                {search ? 'Try a different search term' : 'Create a group with your friends!'}
              </p>
            </div>
            {!search && (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-5 py-3 bg-emerald-500 text-white font-black rounded-2xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-all">
                <Plus size={18} /> Create Group
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {/* Ad placement — between header and list, non-intrusive */}
            <div className="px-4 py-2">
              <AdBanner format="banner" variant="chatlist" />
            </div>

            {filtered.map(group => (
              <GroupCard
                key={group.id}
                group={group}
                userId={user.id}
                onTap={() => onOpenChat(group)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create group modal */}
      {showCreate && (
        <CreateGroupModal
          user={user}
          contacts={contacts}
          onClose={() => setShowCreate(false)}
          onCreated={handleGroupCreated}
        />
      )}
    </div>
  );
};
