
import React, { useState } from 'react';
import { Users, Plus, ChevronRight, Info, MessageSquare, Globe, Lock, X } from 'lucide-react';
import { supabase } from '../supabase';


const CommunityDetail: React.FC<{ community: any; onClose: () => void }> = ({ community, onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col">
      <div className="p-4 flex items-center border-b bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full mr-2 transition-colors">
          <ChevronRight size={24} className="rotate-180" />
        </button>
        <h2 className="text-lg font-bold text-gray-800 truncate">{community.name}</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="relative h-48 bg-emerald-500">
          {community.avatarUrl && (
            <img src={community.avatarUrl || `https://picsum.photos/seed/${community.id}/400/200`} alt="" className="w-full h-full object-cover opacity-60" />
          )}
          <div className="absolute bottom-0 left-0 p-6 text-white bg-gradient-to-t from-black/60 to-transparent w-full">
            <h1 className="text-2xl font-bold mb-1">{community.name}</h1>
            <div className="flex items-center text-xs opacity-90">
              <Globe size={12} className="mr-1" />
              <span>Public Community</span>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex -space-x-2">
              {[1, 2, 3, 4].map(i => (
                <img key={i} src={`https://i.pravatar.cc/100?u=${community.id}${i}`} className="w-8 h-8 rounded-full border-2 border-white" alt="" />
              ))}
              <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-gray-500">+42</div>
            </div>
            <button className="bg-emerald-500 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all">
              Join Community
            </button>
          </div>
          
          <h3 className="text-sm font-bold text-gray-800 mb-3">About</h3>
          <p className="text-sm text-gray-600 leading-relaxed mb-8">
            {community.description || 'This is a place for people to connect, share ideas, and build something great together. Join us to be part of the conversation!'}
          </p>
          
          <h3 className="text-sm font-bold text-gray-800 mb-3">Groups in this community</h3>
          <div className="space-y-4">
            {[
              { name: 'Announcements', icon: <Info size={18} />, desc: 'Official updates and news' },
              { name: 'General Chat', icon: <MessageSquare size={18} />, desc: 'Talk about anything' },
              { name: 'Resources', icon: <Lock size={18} />, desc: 'Shared files and links' }
            ].map((group, i) => (
              <div key={i} className="flex items-center p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer border border-transparent hover:border-gray-100">
                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 mr-4">
                  {group.icon}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-800">{group.name}</h4>
                  <p className="text-xs text-gray-500">{group.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const CommunityItem: React.FC<{ community: any; onClick: () => void }> = ({ community, onClick }) => (
  <div onClick={onClick} className="bg-white border-b border-gray-100 p-4 hover:bg-gray-50 cursor-pointer transition-colors group">
    <div className="flex items-start">
      <div className="relative">
        <img 
          src={community.avatarUrl || `https://picsum.photos/seed/${community.id}/200`} 
          alt={community.name} 
          className="w-14 h-14 rounded-2xl object-cover shadow-sm" 
          referrerPolicy="no-referrer"
        />
        <div className="absolute -bottom-1 -right-1 bg-emerald-500 p-1 rounded-lg border-2 border-white">
          <Users size={12} className="text-white" />
        </div>
      </div>
      <div className="ml-4 flex-1">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-gray-900">{community.name}</h3>
          <ChevronRight size={18} className="text-gray-300 group-hover:text-emerald-500 transition-colors" />
        </div>
        <p className="text-xs text-gray-500 mt-1 line-clamp-1">{community.description}</p>
        <div className="flex items-center mt-2 text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
          <span>{community.groupsCount || 0} Groups</span>
        </div>
      </div>
    </div>
  </div>
);

interface CommunitiesScreenProps {
  communities: any[];
}

export const CommunitiesScreen: React.FC<CommunitiesScreenProps> = ({ communities }) => {
  const [selectedCommunity, setSelectedCommunity] = useState<any | null>(null);

  const handleCreateCommunity = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const name = prompt('Enter community name:');
    if (!name) return;
    const description = prompt('Enter community description:');
    try {
      await supabase.from('communities').insert({
        name,
        description: description || 'A new community for sharing and connecting.',
        avatar_url: `https://api.dicebear.com/7.x/shapes/svg?seed=community${Date.now()}`,
        groups_count: 3,
        created_by: user.id,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error creating community:', error);
    }
  };

  return (
    <div className="h-full bg-gray-50 overflow-y-auto relative">
      {selectedCommunity && <CommunityDetail community={selectedCommunity} onClose={() => setSelectedCommunity(null)} />}
      
      <div className="p-4 bg-white flex items-center justify-between sticky top-0 z-10 border-b border-gray-100">
        <h2 className="text-2xl font-bold text-gray-800">Communities</h2>
        <button onClick={handleCreateCommunity} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors">
          <Plus size={22} />
        </button>
      </div>

      <div onClick={handleCreateCommunity} className="bg-white mb-3 p-4 flex items-center group cursor-pointer hover:bg-gray-50 transition-colors">
        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
          <Plus size={24} />
        </div>
        <div className="ml-4">
          <h3 className="text-[15px] font-bold text-gray-900">New Community</h3>
          <p className="text-xs text-gray-500">Create your own space</p>
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {communities.length > 0 ? (
          communities.map(community => (
            <CommunityItem 
              key={community.id} 
              community={community}
              onClick={() => setSelectedCommunity(community)}
            />
          ))
        ) : (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mb-4">
              <Users size={32} />
            </div>
            <h3 className="text-sm font-bold text-gray-800 mb-2">No communities yet</h3>
            <p className="text-xs text-gray-500 leading-relaxed max-w-xs">
              Be the first to create a community or wait for an invitation.
            </p>
          </div>
        )}
      </div>

      <div className="p-8 flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mb-4">
          <Info size={32} />
        </div>
        <h3 className="text-sm font-bold text-gray-800 mb-2">What are communities?</h3>
        <p className="text-xs text-gray-500 leading-relaxed max-w-xs">
          Communities bring members together in topic-based groups, and make it easy to get announcements.
        </p>
        <button className="mt-4 text-xs font-bold text-emerald-600 hover:underline">Learn more</button>
      </div>
    </div>
  );
};
