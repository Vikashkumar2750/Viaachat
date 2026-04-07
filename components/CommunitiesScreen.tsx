import React, { useState, useEffect } from 'react';
import { Users, Plus, ChevronRight, Info, MessageSquare, Globe, Lock, X, Search, Loader2 } from 'lucide-react';
import { supabase } from '../supabase';

interface Community {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  groupsCount?: number;
  createdBy?: string;
  createdAt?: string;
}

interface CommunityGroup {
  id: string;
  name: string;
  description?: string;
  participantCount: number;
  avatarUrl?: string;
}

const CommunityDetail: React.FC<{ community: Community; onClose: () => void }> = ({ community, onClose }) => {
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  useEffect(() => {
    const fetchGroups = async () => {
      setLoadingGroups(true);
      // Groups that belong to this community (description contains community ID or named with community prefix)
      const { data } = await supabase
        .from('chats')
        .select('id, name, description, participants, avatar_url')
        .eq('is_group', true)
        .ilike('description', `%community:${community.id}%`)
        .limit(20);

      if (data && data.length > 0) {
        setGroups(data.map(g => ({
          id: g.id,
          name: g.name,
          description: g.description?.replace(`community:${community.id}`, '').trim() || '',
          participantCount: (g.participants || []).length,
          avatarUrl: g.avatar_url,
        })));
      } else {
        // Fallback placeholder groups for communities with no linked chats yet
        setGroups([
          { id: '1', name: 'Announcements 📢', description: 'Official updates', participantCount: 0 },
          { id: '2', name: 'General Chat 💬', description: 'Talk about anything', participantCount: 0 },
          { id: '3', name: 'Resources 📚', description: 'Shared files and links', participantCount: 0 },
        ]);
      }
      setLoadingGroups(false);
    };
    fetchGroups();
  }, [community.id]);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-fade-in">
      <div className="p-4 flex items-center border-b bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full mr-2 transition-colors">
          <ChevronRight size={24} className="rotate-180" />
        </button>
        <h2 className="text-lg font-bold text-gray-800 truncate">{community.name}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="relative h-52 bg-gradient-to-br from-emerald-400 to-teal-600">
          {community.avatarUrl && (
            <img src={community.avatarUrl} alt="" className="w-full h-full object-cover opacity-30 mix-blend-overlay" />
          )}
          <div className="absolute inset-0 flex flex-col justify-end p-6 text-white">
            <h1 className="text-3xl font-black mb-1">{community.name}</h1>
            <div className="flex items-center text-sm opacity-90 gap-1.5">
              <Globe size={14} />
              <span>Public Community</span>
              <span className="opacity-50">·</span>
              <Users size={14} />
              <span>{(community.groupsCount || groups.length)} Groups</span>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Placeholder member avatars */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex -space-x-2">
              {[1, 2, 3, 4].map(i => (
                <img key={i} src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${community.id}${i}`} className="w-9 h-9 rounded-full border-2 border-white" alt="" />
              ))}
            </div>
            <button className="bg-emerald-500 text-white px-6 py-2.5 rounded-full text-sm font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all active:scale-95">
              Join Community
            </button>
          </div>

          <div className="bg-gray-50 rounded-2xl p-4 mb-6">
            <h3 className="text-sm font-black text-gray-800 mb-2 uppercase tracking-wider">About</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              {community.description || 'A vibrant community for people to connect, share ideas, and build something great together.'}
            </p>
          </div>

          <h3 className="text-sm font-black text-gray-800 mb-3 uppercase tracking-wider">Groups</h3>
          {loadingGroups ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-emerald-500" />
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <div key={group.id} className="flex items-center p-4 rounded-2xl hover:bg-gray-50 transition-colors cursor-pointer border border-gray-100 hover:border-emerald-100 hover:shadow-sm">
                  <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-xl mr-4 font-black text-emerald-600">
                    {group.name.slice(0, 1)}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-gray-800">{group.name}</h4>
                    <p className="text-xs text-gray-500">{group.description || 'Community group'}</p>
                  </div>
                  {group.participantCount > 0 && (
                    <div className="text-right">
                      <p className="text-xs font-bold text-emerald-600">{group.participantCount}</p>
                      <p className="text-[10px] text-gray-400">members</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CommunityItem: React.FC<{ community: Community; onClick: () => void }> = ({ community, onClick }) => (
  <div onClick={onClick} className="bg-white border-b border-gray-100 p-4 hover:bg-gray-50 cursor-pointer transition-colors group">
    <div className="flex items-start gap-4">
      <div className="relative flex-shrink-0">
        <img
          src={community.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${community.id}`}
          alt={community.name}
          className="w-16 h-16 rounded-2xl object-cover shadow-sm"
          referrerPolicy="no-referrer"
        />
        <div className="absolute -bottom-1 -right-1 bg-emerald-500 p-1.5 rounded-lg border-2 border-white">
          <Users size={10} className="text-white" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-gray-900 group-hover:text-emerald-600 transition-colors truncate">{community.name}</h3>
          <ChevronRight size={18} className="text-gray-300 group-hover:text-emerald-500 transition-colors flex-shrink-0 ml-2" />
        </div>
        <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{community.description || 'A community space to connect and collaborate.'}</p>
        <div className="flex items-center mt-2 gap-3">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
            <MessageSquare size={10} />
            {community.groupsCount || 3} Groups
          </span>
          <span className="text-[10px] text-gray-300">·</span>
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <Globe size={9} />
            Public
          </span>
        </div>
      </div>
    </div>
  </div>
);

// ─── Create Community Modal ───────────────────────────────────────────────────
const CreateCommunityModal: React.FC<{ onClose: () => void; onCreated: (c: Community) => void }> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Please enter a community name'); return; }
    setIsLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Not authenticated'); return; }

      const { data, error: insertError } = await supabase.from('communities').insert({
        name: name.trim(),
        description: description.trim() || 'A new community for sharing and connecting.',
        avatar_url: `https://api.dicebear.com/7.x/shapes/svg?seed=community-${Date.now()}`,
        groups_count: 3,
        created_by: user.id,
        created_at: new Date().toISOString(),
      }).select().single();

      if (insertError) {
        setError(insertError.message);
        return;
      }
      if (data) {
        onCreated({
          id: data.id,
          name: data.name,
          description: data.description,
          avatarUrl: data.avatar_url,
          groupsCount: data.groups_count,
        });
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create community');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-[2.5rem] shadow-2xl p-7 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-2xl font-black text-gray-900">New Community</h3>
            <p className="text-xs text-gray-400 mt-0.5">Create a space for your people</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={22} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Community avatar preview */}
          <div className="flex justify-center mb-2">
            <div className="w-20 h-20 rounded-[1.5rem] bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg">
              <Users size={32} className="text-white" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Community Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Tech Enthusiasts 🚀"
              className="w-full bg-gray-50 rounded-2xl py-4 px-5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
              autoFocus
              maxLength={60}
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this community about?"
              className="w-full bg-gray-50 rounded-2xl py-3.5 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all resize-none h-20"
              maxLength={200}
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
              <X size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-600 font-bold">{error}</p>
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={!name.trim() || isLoading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 text-base"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : <Users size={20} />}
            {isLoading ? 'Creating...' : 'Create Community'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface CommunitiesScreenProps {
  communities: Community[];
}

export const CommunitiesScreen: React.FC<CommunitiesScreenProps> = ({ communities: initialCommunities }) => {
  const [communities, setCommunities] = useState<Community[]>(initialCommunities);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync when prop updates
  React.useEffect(() => {
    setCommunities(initialCommunities);
  }, [initialCommunities]);

  const filtered = communities.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full bg-gray-50 flex flex-col overflow-hidden">
      {selectedCommunity && <CommunityDetail community={selectedCommunity} onClose={() => setSelectedCommunity(null)} />}
      {isCreateOpen && (
        <CreateCommunityModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={(c) => setCommunities(prev => [c, ...prev])}
        />
      )}

      {/* Header */}
      <div className="px-5 pt-5 pb-4 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Communities</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">{communities.length} communities</p>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all active:scale-90 font-bold text-sm"
          >
            <Plus size={18} />
            Create
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search communities..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-gray-100 rounded-2xl py-2.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {/* Create new banner */}
        <div onClick={() => setIsCreateOpen(true)} className="bg-white border-b border-gray-100 p-4 flex items-center gap-4 cursor-pointer hover:bg-emerald-50 transition-colors group">
          <div className="w-16 h-16 bg-emerald-100 group-hover:bg-emerald-200 rounded-2xl flex items-center justify-center transition-colors">
            <Plus size={24} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-gray-900 group-hover:text-emerald-600 transition-colors">Create New Community</h3>
            <p className="text-xs text-gray-500">Start your own group space</p>
          </div>
        </div>

        {filtered.length > 0 ? (
          filtered.map(community => (
            <CommunityItem
              key={community.id}
              community={community}
              onClick={() => setSelectedCommunity(community)}
            />
          ))
        ) : (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-gray-100 text-gray-300 rounded-full flex items-center justify-center mb-4">
              <Users size={36} />
            </div>
            <h3 className="text-sm font-bold text-gray-800 mb-2">
              {searchQuery ? 'No communities found' : 'No communities yet'}
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed max-w-xs mb-4">
              {searchQuery
                ? 'Try a different search term'
                : 'Be the first to create a community where people can connect and collaborate.'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="text-emerald-600 font-black text-sm hover:underline"
              >
                Create the first one →
              </button>
            )}
          </div>
        )}

        {/* Info footer */}
        <div className="p-6 bg-gradient-to-b from-transparent to-gray-100/50 border-t border-gray-100 mt-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Info size={18} className="text-blue-500" />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-800 mb-1">What are communities?</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Communities help groups of people organize shared interests. Create topic-based groups, broadcast announcements, and connect with like-minded people.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
