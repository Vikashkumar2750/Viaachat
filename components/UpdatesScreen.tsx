

import React, { useState, useEffect } from 'react';
import { Plus, Camera, MoreVertical, X, Send, Image as ImageIcon, Type, Palette } from 'lucide-react';
import { supabase } from '../supabase';
import type { Status, Contact, User } from '../types';


const StatusViewer: React.FC<{ status: Status; onClose: () => void }> = ({ status, onClose }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          onClose();
          return 100;
        }
        return prev + 1;
      });
    }, 50); // 5 seconds total

    return () => clearInterval(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-fade-in">
      <div className="absolute top-0 inset-x-0 p-4 z-10 bg-gradient-to-b from-black/60 to-transparent">
        <div className="w-full bg-white/20 h-1 rounded-full overflow-hidden mb-4">
          <div className="bg-white h-full transition-all duration-100 ease-linear" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <img src={status.avatarUrl || `https://picsum.photos/seed/${status.userId}/200`} alt={status.name} className="w-10 h-10 rounded-full object-cover mr-3 border-2 border-white/20" />
            <div>
              <h3 className="text-white font-bold text-sm">{status.name}</h3>
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">{status.time}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>
      </div>
      
      <div className={`flex-1 flex items-center justify-center relative overflow-hidden ${status.backgroundColor || 'bg-black'}`}>
        {status.contentUrl ? (
          <>
            <img 
              src={status.contentUrl || `https://picsum.photos/seed/${status.id}/800`} 
              alt="Status Content" 
              className="max-w-full max-h-full object-contain z-10" 
              referrerPolicy="no-referrer"
            />
            <img 
              src={status.contentUrl || `https://picsum.photos/seed/${status.id}/800`} 
              alt="" 
              className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-30 scale-110" 
              referrerPolicy="no-referrer"
            />
          </>
        ) : (
          <div className="p-12 text-center z-10">
            <p className="text-white text-3xl font-bold leading-tight drop-shadow-lg">
              {status.text}
            </p>
          </div>
        )}
      </div>
      
      <div className="p-8 text-center bg-gradient-to-t from-black/80 to-transparent">
        <div className="max-w-xs mx-auto">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
            <p className="text-white text-sm font-medium leading-relaxed">
              {status.isMine ? "Your status update" : `Update from ${status.name}`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusComposer: React.FC<{ user: User; onClose: () => void; onPost: (text: string, color: string) => void; isLoading: boolean }> = ({ user, onClose, onPost, isLoading }) => {
  const [text, setText] = useState('');
  const [color, setColor] = useState('bg-emerald-500');
  const colors = [
    'bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 
    'bg-orange-500', 'bg-slate-800', 'bg-rose-500', 'bg-indigo-600'
  ];

  const emojis = ['😊', '😂', '❤️', '🔥', '✨', '🙌', '😎', '🤔', '😢', '🎉'];

  return (
    <div className={`fixed inset-0 z-[110] flex flex-col transition-colors duration-500 ${color}`}>
      <div className="p-4 flex items-center justify-between">
        <button onClick={onClose} className="text-white p-2 hover:bg-white/10 rounded-full transition-colors">
          <X size={24} />
        </button>
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setColor(colors[(colors.indexOf(color) + 1) % colors.length])}
            className="text-white p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <Palette size={24} />
          </button>
          <button 
            onClick={() => onPost(text, color)}
            disabled={!text.trim() || isLoading}
            className={`bg-white text-emerald-600 p-3 rounded-full shadow-lg transition-all active:scale-90 ${(!text.trim() || isLoading) ? 'opacity-50' : 'hover:bg-emerald-50'}`}
          >
            {isLoading ? <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /> : <Send size={24} />}
          </button>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <textarea
          autoFocus
          placeholder="Type a status"
          className="w-full bg-transparent text-white text-3xl font-bold text-center placeholder:text-white/40 focus:outline-none resize-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
        />
        
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {emojis.map(e => (
            <button
              key={e}
              onClick={() => setText(prev => prev + e)}
              className="text-2xl hover:scale-125 transition-transform active:scale-90"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      
      <div className="p-8 flex justify-center space-x-3 overflow-x-auto no-scrollbar">
        {colors.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-8 h-8 rounded-full border-2 transition-all ${c} ${color === c ? 'border-white scale-125' : 'border-transparent'}`}
          />
        ))}
      </div>
    </div>
  );
};

const StatusItem: React.FC<{ status: Status; onClick: () => void }> = ({ status, onClick }) => (
  <div onClick={onClick} className="flex items-center p-4 hover:bg-gray-50 cursor-pointer transition-all active:scale-[0.98] group border-b border-gray-50">
    <div className="relative">
      <div className={`p-0.5 rounded-full border-2 transition-colors duration-500 ${status.viewed ? 'border-gray-200' : 'border-emerald-500'}`}>
        <div className={`w-14 h-14 rounded-full overflow-hidden border-2 border-white shadow-sm flex items-center justify-center ${status.backgroundColor || 'bg-gray-100'}`}>
          {status.contentUrl ? (
            <img 
              src={status.contentUrl || `https://picsum.photos/seed/${status.id}/200`} 
              alt={status.name} 
              className="w-full h-full object-cover" 
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-[8px] text-white font-bold p-1 text-center line-clamp-2">
              {status.text}
            </span>
          )}
        </div>
      </div>
      {status.isMine && (
        <div className="absolute bottom-0 right-0 bg-emerald-500 text-white rounded-full p-1 border-2 border-white shadow-lg">
          <Plus size={12} strokeWidth={4} />
        </div>
      )}
    </div>
    <div className="ml-4 flex-1">
      <h3 className="text-[16px] font-bold text-gray-800 group-hover:text-emerald-600 transition-colors">{status.isMine ? "My status" : status.name}</h3>
      <p className="text-xs text-gray-500 font-medium">{status.time}</p>
    </div>
  </div>
);

interface UpdatesScreenProps {
  statuses: Status[];
  user: User;
  contacts: Contact[];
}

export const UpdatesScreen: React.FC<UpdatesScreenProps> = ({ statuses, user, contacts }) => {
  const [viewingStatus, setViewingStatus] = useState<Status | null>(null);
  const [isAddingStatus, setIsAddingStatus] = useState(false);
  const [isComposingText, setIsComposingText] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  // Filter statuses to only show mine and my contacts'
  const contactIds = contacts.map(c => c.id);
  const filteredStatuses = statuses.filter(s => s.userId === user.uid || contactIds.includes(s.userId));

  const myStatus = filteredStatuses.find(s => s.userId === user.uid);
  const recentStatuses = filteredStatuses.filter(s => s.userId !== user.uid && !s.viewed);
  const viewedStatuses = filteredStatuses.filter(s => s.userId !== user.uid && s.viewed);

  const handleViewStatus = async (status: Status) => {
    setViewingStatus(status);
    if (!status.viewed && status.userId !== user.uid) {
      await supabase.from('statuses').update({ viewed: true }).eq('id', status.id);
    }
  };

  const handlePostTextStatus = async (text: string, color: string) => {
    if (!user) return;
    setIsAddingStatus(true);
    try {
      await supabase.from('statuses').insert({
        user_id: user.uid,
        name: user.displayName,
        avatar_url: user.photoURL,
        text,
        background_color: color,
        timestamp: new Date().toISOString(),
        viewed: false,
      });
      setIsComposingText(false);
    } catch (error) {
      alert('Failed to post status. Please try again.');
    } finally {
      setIsAddingStatus(false);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 800000) {
      alert('Image is too large. Please select an image smaller than 800KB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setIsAddingStatus(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        const { error } = await supabase.from('statuses').insert({
          user_id: user.uid,
          name: user.displayName,
          avatar_url: user.photoURL,
          content_url: base64String,
          timestamp: new Date().toISOString(),
          viewed: false,
        });
        if (error) alert('Failed to upload image status.');
        setIsAddingStatus(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
    } catch {
      setIsAddingStatus(false);
    }
  };

  return (
    <div className="h-full bg-white flex flex-col">
      {viewingStatus && <StatusViewer status={viewingStatus} onClose={() => setViewingStatus(null)} />}
      {isComposingText && <StatusComposer user={user} onClose={() => setIsComposingText(false)} onPost={handlePostTextStatus} isLoading={isAddingStatus} />}
      
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleImageSelect}
      />

      <div className="p-6 flex items-center justify-between bg-white border-b border-gray-100">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Updates</h2>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Status & Channels</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setIsComposingText(true)}
            className="p-3 hover:bg-gray-100 rounded-2xl text-gray-600 transition-all active:scale-90"
            title="Text Status"
          >
            <Type size={24} />
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isAddingStatus}
            className={`p-3 hover:bg-emerald-50 rounded-2xl text-emerald-600 transition-all active:scale-90 ${isAddingStatus ? 'animate-pulse opacity-50' : ''}`}
            title="Image Status"
          >
            <Camera size={24} />
          </button>
          <button className="p-3 hover:bg-gray-100 rounded-2xl text-gray-600 transition-all active:scale-90">
            <MoreVertical size={24} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="mb-8">
          <div className="px-6 py-4">
            <h3 className="text-[11px] font-black text-emerald-600 uppercase tracking-[0.2em]">My Status</h3>
          </div>
          <div>
            {myStatus ? (
              <StatusItem status={myStatus} onClick={() => handleViewStatus(myStatus)} />
            ) : (
              <div onClick={() => fileInputRef.current?.click()} className="flex items-center p-4 hover:bg-gray-50 cursor-pointer transition-all active:scale-[0.98] group">
                <div className="relative">
                  <div className="p-0.5 rounded-full border-2 border-dashed border-gray-300">
                    <img 
                      src={user?.photoURL || `https://picsum.photos/seed/${user?.uid}/200`} 
                      alt="My Status" 
                      className="w-14 h-14 rounded-full object-cover grayscale opacity-40 border-2 border-white" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="absolute bottom-0 right-0 bg-emerald-500 text-white rounded-full p-1 border-2 border-white shadow-lg">
                    <Plus size={12} strokeWidth={4} />
                  </div>
                </div>
                <div className="ml-4 flex-1">
                  <h3 className="text-[16px] font-bold text-gray-800">My status</h3>
                  <p className="text-xs text-gray-400 font-medium">Tap to add status update</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {recentStatuses.length > 0 && (
          <div className="mb-8">
            <div className="px-6 py-2">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Recent updates</h3>
            </div>
            {recentStatuses.map(status => <StatusItem key={status.id} status={status} onClick={() => handleViewStatus(status)} />)}
          </div>
        )}

        {viewedStatuses.length > 0 && (
          <div className="mb-8">
            <div className="px-6 py-2">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Viewed updates</h3>
            </div>
            {viewedStatuses.map(status => <StatusItem key={status.id} status={status} onClick={() => handleViewStatus(status)} />)}
          </div>
        )}

        {filteredStatuses.length === 0 && !myStatus && (
          <div className="p-12 text-center">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ImageIcon size={32} className="text-gray-300" />
            </div>
            <p className="text-sm text-gray-400 font-medium">No status updates from friends yet.</p>
          </div>
        )}

        <div className="p-6 bg-gray-50/50 border-t border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Channels</h3>
            <button className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors">Find channels</button>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed font-medium">
            Stay updated on topics that matter to you. Find channels to follow below and get the latest news directly.
          </p>
        </div>
      </div>
    </div>
  );
};
