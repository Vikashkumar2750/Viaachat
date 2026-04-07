import React, { useState, useRef } from 'react';
import type { User } from '../types';
import { supabase, signOut } from '../supabase';
import {
  Pencil, LogOut, Save, X, Camera, Check, Shield,
  Moon, Bell, Lock, ChevronRight, Loader2,
} from 'lucide-react';

interface ProfileDashboardProps {
  user: User | null;
  onClose: () => void;
  onSimulateCall: () => void;
  onUserUpdated?: (updated: Partial<User>) => void;
}

export const ProfileDashboard: React.FC<ProfileDashboardProps> = ({
  user, onClose, onSimulateCall, onUserUpdated,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [about, setAbout] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      // silent: just skip large files — user sees no change
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const updates: Record<string, any> = { display_name: displayName };
      if (avatarPreview) updates.photo_url = avatarPreview;

      await supabase.from('users').update(updates).eq('id', user.uid);

      // Propagate update to App state so the UI refreshes immediately
      if (onUserUpdated) {
        onUserUpdated({
          displayName,
          photoURL: avatarPreview || user.photoURL,
        });
      }

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsEditing(false);
        setAvatarPreview(null);
      }, 1500);
    } catch (err) {
      console.error('Profile save failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    onClose();
  };

  const currentAvatar = avatarPreview || user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30" onClick={onClose} />
      <div className="absolute top-[3.5rem] right-3 w-[22rem] bg-white rounded-3xl shadow-2xl shadow-black/10 z-40 overflow-hidden animate-fade-in-down border border-gray-100/80">

        {/* Profile Header */}
        <div className="relative bg-gradient-to-br from-emerald-500 to-teal-600 px-5 pt-5 pb-10">
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-all">
            <X size={16} />
          </button>

          <div className="flex items-center gap-4">
            {/* Avatar with edit overlay */}
            <div className="relative group">
              <img
                src={currentAvatar}
                alt={user?.displayName}
                className="w-16 h-16 rounded-2xl border-2 border-white/40 object-cover shadow-lg"
                referrerPolicy="no-referrer"
              />
              {isEditing && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Camera size={20} className="text-white" />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImagePick}
              />
              {/* Online dot */}
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white" />
            </div>

            <div className="flex-1 min-w-0">
              {isEditing ? (
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full bg-white/20 text-white placeholder-white/60 border border-white/30 rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:border-white/60"
                  placeholder="Display name"
                  maxLength={40}
                  autoFocus
                />
              ) : (
                <p className="font-black text-white text-base truncate">{user?.displayName || 'User'}</p>
              )}
              <p className="text-white/70 text-xs mt-0.5 truncate">{user?.email || 'Guest Account'}</p>
              <div className="flex items-center gap-1 mt-1">
                <Shield size={11} className="text-emerald-200" />
                <span className="text-emerald-200 text-[10px] font-bold uppercase tracking-wider">E2E Encrypted</span>
              </div>
            </div>
          </div>

          {/* About field in edit mode */}
          {isEditing && (
            <textarea
              value={about}
              onChange={e => setAbout(e.target.value)}
              placeholder="About / Status (optional)"
              maxLength={139}
              rows={2}
              className="w-full mt-3 bg-white/20 text-white placeholder-white/50 border border-white/30 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-white/60"
            />
          )}
        </div>

        {/* Action buttons floating over the gradient */}
        <div className="flex gap-2 px-4 -mt-5 mb-3">
          {isEditing ? (
            <>
              <button
                onClick={() => { setIsEditing(false); setAvatarPreview(null); setDisplayName(user?.displayName || ''); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white text-gray-600 rounded-xl text-xs font-bold shadow border border-gray-200 hover:bg-gray-50 transition-all"
              >
                <X size={14} /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !displayName.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-all disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : saveSuccess ? <Check size={14} /> : <Save size={14} />}
                {isSaving ? 'Saving…' : saveSuccess ? 'Saved!' : 'Save Profile'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-white text-emerald-600 rounded-xl text-xs font-bold shadow border border-gray-100 hover:bg-emerald-50 transition-all"
            >
              <Pencil size={14} /> Edit Profile
            </button>
          )}
        </div>

        {/* Settings Menu */}
        <div className="px-3 pb-3 space-y-0.5">
          {[
            { icon: <Bell size={17} />, label: 'Notifications', sub: 'Alerts & sounds' },
            { icon: <Lock size={17} />, label: 'Privacy', sub: 'Who can contact you' },
            { icon: <Moon size={17} />, label: 'Appearance', sub: 'Theme & display' },
          ].map(item => (
            <button
              key={item.label}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-gray-50 transition-all group text-left"
            >
              <span className="text-gray-400 group-hover:text-emerald-500 transition-colors">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-400">{item.sub}</p>
              </div>
              <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-400" />
            </button>
          ))}

          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-red-50 transition-all group text-left"
            >
              <LogOut size={17} className="text-red-400 group-hover:text-red-500 transition-colors" />
              <span className="text-sm font-bold text-red-500">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

    </>
  );
};
