
import React, { useState } from 'react';
import { User } from '../types';
import { supabase, signOut } from '../supabase';
import { Pencil, Star, PhoneIncoming, LogOut, Save, X } from 'lucide-react';


interface ProfileDashboardProps {
  user: User | null;
  onClose: () => void;
  onSimulateCall: () => void;
}

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick?: () => void; variant?: 'default' | 'danger' }> = ({ icon, label, onClick, variant = 'default' }) => (
  <li>
    <button 
      onClick={onClick} 
      className={`w-full flex items-center p-3 rounded-xl transition-all active:scale-95 ${
        variant === 'danger' ? 'text-red-500 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      <span className={`mr-3 ${variant === 'danger' ? 'text-red-500' : 'text-gray-400'}`}>{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  </li>
);

export const ProfileDashboard: React.FC<ProfileDashboardProps> = ({ user, onClose, onSimulateCall }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleLogout = async () => {
    await signOut();
    onClose();
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await supabase.from('users').update({
        display_name: displayName,
        photo_url: photoURL,
      }).eq('id', user.uid);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30" onClick={onClose}></div>
      <div className="absolute top-20 right-4 w-80 bg-white rounded-2xl shadow-2xl z-40 p-4 animate-fade-in-down border border-gray-100">
        {isEditing ? (
          <div className="space-y-4 pb-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">Edit Profile</h3>
              <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col items-center space-y-3">
              <img 
                src={photoURL || "https://picsum.photos/seed/user/200"} 
                alt="Preview" 
                className="w-20 h-20 rounded-full border-4 border-emerald-50 object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="w-full space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Display Name</label>
                <input 
                  type="text" 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="Your name"
                />
              </div>
              <div className="w-full space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Photo URL</label>
                <input 
                  type="text" 
                  value={photoURL}
                  onChange={(e) => setPhotoURL(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="https://example.com/photo.jpg"
                />
              </div>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                {isSaving ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Save size={18} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center pb-4 border-b border-gray-100">
            <img 
              src={user?.photoURL || "https://picsum.photos/seed/user/200"} 
              alt="User Avatar" 
              className="w-14 h-14 rounded-full mr-4 border-2 border-emerald-100 object-cover" 
              referrerPolicy="no-referrer"
            />
            <div className="overflow-hidden">
              <p className="font-bold text-lg text-gray-800 truncate">{user?.displayName || 'User'}</p>
              <p className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full inline-block">Online</p>
            </div>
          </div>
        )}
        <ul className="mt-4 space-y-1">
          {!isEditing && <MenuItem icon={<Pencil size={18} />} label="Edit Profile" onClick={() => setIsEditing(true)} />}
          <MenuItem icon={<Star size={18} />} label="Starred Messages" />
          <MenuItem icon={<PhoneIncoming size={18} />} label="Simulate Call" onClick={onSimulateCall} />
          <MenuItem icon={<LogOut size={18} />} label="Log Out" onClick={handleLogout} variant="danger" />
        </ul>
      </div>
      <style>{`
        @keyframes fade-in-down {
          0% { opacity: 0; transform: translateY(-10px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fade-in-down {
          animation: fade-in-down 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </>
  );
};
