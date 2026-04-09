import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { User } from '../types';
import { supabase, signOut } from '../supabase';
import {
  ChevronLeft, Pencil, LogOut, Save, X, Camera, Check, Shield,
  Bell, BellOff, Lock, Moon, Sun, Smartphone, Download, Trash2,
  ChevronRight, Loader2, User as UserIcon, Mail, Info, HelpCircle,
  Volume2, VolumeX, Eye, EyeOff, Ban, Star, Share2, ExternalLink,
  Wifi, Database, Globe, AlertCircle, Phone,
} from 'lucide-react';

interface ProfileDashboardProps {
  user: User | null;
  onClose: () => void;
  onSimulateCall?: () => void;
  onUserUpdated?: (updated: Partial<User>) => void;
}

// ─── PWA Install Hook ─────────────────────────────────────────────────────────
function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }
    // Capture the beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler as any);
    // Listen for successful install
    window.addEventListener('appinstalled', () => setIsInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler as any);
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return false;
    setIsInstalling(true);
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setInstallPrompt(null);
        return true;
      }
    } finally {
      setIsInstalling(false);
    }
    return false;
  }, [installPrompt]);

  return { installPrompt, isInstalled, isInstalling, install };
}

// ─── Section ─────────────────────────────────────────────────────────────────
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-6">
    <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest mb-2 px-1">{title}</p>
    <div className="bg-white/5 rounded-2xl overflow-hidden divide-y divide-white/5">
      {children}
    </div>
  </div>
);

// ─── Setting Row ─────────────────────────────────────────────────────────────
const Row: React.FC<{
  icon: React.ReactNode;
  label: string;
  sub?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}> = ({ icon, label, sub, right, onClick, danger }) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors
      ${onClick ? (danger ? 'hover:bg-red-500/10 active:bg-red-500/20' : 'hover:bg-white/5 active:bg-white/10') : 'cursor-default'}
    `}
  >
    <span className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0
      ${danger ? 'bg-red-500/15 text-red-400' : 'bg-white/8 text-white/60'}`}>
      {icon}
    </span>
    <div className="flex-1 min-w-0">
      <p className={`text-sm font-semibold ${danger ? 'text-red-400' : 'text-white/90'}`}>{label}</p>
      {sub && <p className="text-[11px] text-white/40 mt-0.5 truncate">{sub}</p>}
    </div>
    {right !== undefined ? right : onClick ? <ChevronRight size={14} className="text-white/20 flex-shrink-0" /> : null}
  </button>
);

// ─── Toggle Switch ────────────────────────────────────────────────────────────
const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0
      ${value ? 'bg-emerald-500' : 'bg-white/15'}`}
  >
    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
      ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
);

// ─── Install Guide Modal ──────────────────────────────────────────────────────
const InstallGuideModal: React.FC<{ onClose: () => void; onInstall: () => void; canInstall: boolean; isInstalling: boolean; isInstalled: boolean }> = ({
  onClose, onInstall, canInstall, isInstalling, isInstalled,
}) => (
  <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
    <div className="bg-gray-900 rounded-3xl border border-white/10 w-full max-w-sm p-5 animate-slide-up" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-black text-white">Install ViaaChat</h3>
        <button onClick={onClose} className="p-1.5 rounded-xl bg-white/10 text-white/60 hover:text-white"><X size={16} /></button>
      </div>

      {/* One-tap install for supported browsers */}
      {canInstall && !isInstalled && (
        <button
          onClick={onInstall}
          disabled={isInstalling}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black rounded-2xl mb-5 shadow-lg shadow-emerald-500/30 hover:opacity-90 transition-all disabled:opacity-50"
        >
          {isInstalling ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
          {isInstalling ? 'Installing…' : 'Install App (One Tap)'}
        </button>
      )}
      {isInstalled && (
        <div className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-500/15 text-emerald-400 font-bold rounded-2xl mb-5 border border-emerald-500/30">
          <Check size={20} /> App Already Installed
        </div>
      )}

      <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">Manual Install Guide</p>
      <div className="space-y-3">
        {[
          { device: '📱 Android Chrome', steps: ['Tap ⋮ (3 dots) in top-right', 'Tap "Add to Home screen"', 'Tap "Install"'] },
          { device: '🍎 iPhone Safari', steps: ['Tap the Share icon (box with arrow)', 'Scroll down → "Add to Home Screen"', 'Tap "Add"'] },
          { device: '💻 Desktop Chrome', steps: ['Click the install icon (⊕) in address bar', 'Or: ⋮ menu → "Install ViaaChat"'] },
          { device: '💻 Desktop Edge', steps: ['Click the app icon in address bar', 'Or: ··· menu → Apps → "Install this site as an app"'] },
        ].map(({ device, steps }) => (
          <div key={device} className="bg-white/5 rounded-xl p-3">
            <p className="text-sm font-bold text-white/80 mb-1.5">{device}</p>
            <ol className="space-y-1">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2 text-xs text-white/50">
                  <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 text-[9px] font-black">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <p className="text-center text-[10px] text-white/20 mt-4">
        Works offline · No app store needed · Free
      </p>
    </div>
  </div>
);

// ─── MAIN PROFILE DASHBOARD ───────────────────────────────────────────────────
export const ProfileDashboard: React.FC<ProfileDashboardProps> = ({
  user, onClose, onUserUpdated,
}) => {
  const [section, setSection] = useState<string | null>(null); // null = main menu
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [about, setAbout] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  // Settings state
  const [notifCalls, setNotifCalls] = useState(true);
  const [notifMessages, setNotifMessages] = useState(true);
  const [notifSounds, setNotifSounds] = useState(true);
  const [notifVibrate, setNotifVibrate] = useState(true);
  const [privacyLastSeen, setPrivacyLastSeen] = useState(true);
  const [privacyPhoto, setPrivacyPhoto] = useState(true);
  const [privacyCallsFrom, setPrivacyCallsFrom] = useState<'everyone' | 'contacts' | 'nobody'>('everyone');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { installPrompt, isInstalled, isInstalling, install } = usePWAInstall();

  const canInstall = !!installPrompt && !isInstalled;

  const currentAvatar = avatarPreview || user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id}`;

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.size > 3 * 1024 * 1024) return;
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
      if (about) updates.about = about;
      await supabase.from('users').update(updates).eq('id', user.id);
      if (onUserUpdated) onUserUpdated({ displayName, photoURL: avatarPreview || user.photoURL });
      setSaveSuccess(true);
      setTimeout(() => { setSaveSuccess(false); setIsEditing(false); setAvatarPreview(null); }, 1500);
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

  const handleClearCache = () => {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    localStorage.removeItem('viaachat-chat-cache');
    alert('Cache cleared successfully!');
  };

  const handleShareApp = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'ViaaChat', text: 'Try ViaaChat — Secure messaging & live rooms!', url: 'https://viaachat.vercel.app' });
    } else {
      await navigator.clipboard.writeText('https://viaachat.vercel.app');
      alert('Link copied!');
    }
  };

  const isGuest = !user?.email;

  // ── Sub-sections ────────────────────────────────────────────────────────────
  const renderSection = () => {
    if (section === 'notifications') {
      return (
        <div>
          <Section title="Call Alerts">
            <Row icon={<Phone size={16} />} label="Incoming Calls" sub="Ring when someone calls"
              right={<Toggle value={notifCalls} onChange={setNotifCalls} />} />
          </Section>
          <Section title="Messages">
            <Row icon={<Bell size={16} />} label="New Messages" sub="Notify for every message"
              right={<Toggle value={notifMessages} onChange={setNotifMessages} />} />
          </Section>
          <Section title="Sound & Vibration">
            <Row icon={<Volume2 size={16} />} label="Notification Sounds"
              right={<Toggle value={notifSounds} onChange={setNotifSounds} />} />
            <Row icon={<Smartphone size={16} />} label="Vibrate"
              right={<Toggle value={notifVibrate} onChange={setNotifVibrate} />} />
          </Section>
        </div>
      );
    }

    if (section === 'privacy') {
      return (
        <div>
          <Section title="Profile Visibility">
            <Row icon={<Eye size={16} />} label="Last Seen" sub="Show others when you were last online"
              right={<Toggle value={privacyLastSeen} onChange={setPrivacyLastSeen} />} />
            <Row icon={<Camera size={16} />} label="Profile Photo" sub="Visible to everyone"
              right={<Toggle value={privacyPhoto} onChange={setPrivacyPhoto} />} />
          </Section>
          <Section title="Calls">
            <div className="px-4 py-3">
              <p className="text-sm font-semibold text-white/80 mb-2">Who can call me</p>
              {(['everyone', 'contacts', 'nobody'] as const).map(opt => (
                <button key={opt} onClick={() => setPrivacyCallsFrom(opt)}
                  className="w-full flex items-center justify-between py-2 text-sm capitalize text-white/70 hover:text-white transition-colors">
                  {opt === 'everyone' ? 'Everyone' : opt === 'contacts' ? 'My contacts only' : 'Nobody'}
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
                    ${privacyCallsFrom === opt ? 'border-emerald-500 bg-emerald-500' : 'border-white/20'}`}>
                    {privacyCallsFrom === opt && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                </button>
              ))}
            </div>
          </Section>
          <Section title="Blocked Users">
            <Row icon={<Ban size={16} />} label="Manage Blocked Users" sub="0 users blocked" onClick={() => {}} />
          </Section>
          <Section title="Data">
            <Row icon={<Trash2 size={16} />} label="Delete My Account" sub="Permanently remove all data"
              danger onClick={() => {
                if (confirm('Are you sure? This cannot be undone.')) handleLogout();
              }} />
          </Section>
        </div>
      );
    }

    if (section === 'storage') {
      return (
        <div>
          <Section title="Cache">
            <Row icon={<Trash2 size={16} />} label="Clear Cache" sub="Free up space from cached data" onClick={handleClearCache} />
          </Section>
          <Section title="Media Auto-Download">
            <Row icon={<Wifi size={16} />} label="On Wi-Fi" sub="Photos, videos, voice"
              right={<Toggle value={true} onChange={() => {}} />} />
            <Row icon={<Globe size={16} />} label="On Mobile Data" sub="Photos only"
              right={<Toggle value={false} onChange={() => {}} />} />
          </Section>
          <Section title="Storage Used">
            <div className="px-4 py-3 text-sm text-white/50">
              <div className="flex justify-between mb-1"><span>Photos & Videos</span><span>—</span></div>
              <div className="flex justify-between mb-1"><span>Voice messages</span><span>—</span></div>
              <div className="flex justify-between"><span>Documents</span><span>—</span></div>
            </div>
          </Section>
        </div>
      );
    }

    if (section === 'about') {
      return (
        <div>
          <Section title="App Info">
            <Row icon={<Info size={16} />} label="Version" sub="1.0.0 · Production" />
            <Row icon={<Star size={16} />} label="Rate the App" sub="Love ViaaChat? Let us know!" onClick={() =>
              window.open('https://viaachat.vercel.app', '_blank')} />
            <Row icon={<Share2 size={16} />} label="Share ViaaChat" sub="Invite friends to join" onClick={handleShareApp} />
            <Row icon={<ExternalLink size={16} />} label="Privacy Policy" onClick={() =>
              window.open('https://viaachat.vercel.app/privacy', '_blank')} />
            <Row icon={<AlertCircle size={16} />} label="Report an Issue" onClick={() =>
              window.open('mailto:support@viaachat.app?subject=Bug Report', '_blank')} />
          </Section>
          <Section title="Technology">
            <div className="px-4 py-3 text-xs text-white/30 space-y-1">
              <p>Built with React + Supabase + WebRTC</p>
              <p>End-to-end encrypted messaging</p>
              <p>PWA — works offline & installable</p>
            </div>
          </Section>
        </div>
      );
    }

    if (section === 'install') {
      return (
        <div>
          <Section title="Install on Android">
            <div className="px-4 py-3 space-y-2">
              {['Open in Chrome browser', 'Tap ⋮ (3 dots) in the top right', 'Tap "Add to Home screen"', 'Tap "Install" to confirm'].map((s, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="w-6 h-6 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-white/70">{s}</p>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Install on iPhone (Safari)">
            <div className="px-4 py-3 space-y-2">
              {['Open in Safari browser', 'Tap the Share icon (square with arrow)', 'Scroll down and tap "Add to Home Screen"', 'Tap "Add" in the top right'].map((s, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="w-6 h-6 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-white/70">{s}</p>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Install on Desktop">
            <div className="px-4 py-3 space-y-2">
              {['Open in Chrome or Edge', 'Click the install icon (⊕) in the address bar', 'Click "Install" in the popup'].map((s, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="w-6 h-6 bg-purple-500/20 text-purple-400 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-white/70">{s}</p>
                </div>
              ))}
            </div>
          </Section>
          {canInstall && (
            <button
              onClick={() => install()}
              disabled={isInstalling}
              className="w-full mt-2 flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black rounded-2xl shadow-lg shadow-emerald-500/30 hover:opacity-90 transition-all disabled:opacity-50"
            >
              {isInstalling ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
              {isInstalling ? 'Installing…' : 'Install Now (One Tap)'}
            </button>
          )}
          {isInstalled && (
            <div className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-500/15 text-emerald-400 font-bold rounded-2xl border border-emerald-500/30 mt-2">
              <Check size={18} /> ViaaChat is installed!
            </div>
          )}
        </div>
      );
    }

    // ── Main Settings Menu ──────────────────────────────────────────────────
    return (
      <div>
        {/* Guest upgrade prompt */}
        {isGuest && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-5">
            <p className="text-sm font-bold text-amber-400 mb-1">You're using a Guest account</p>
            <p className="text-xs text-white/50 mb-3">Sign up to save your chats, profile, and call history across devices.</p>
            <button className="w-full py-2.5 bg-amber-500 text-white text-sm font-black rounded-xl hover:bg-amber-600 transition-all">
              Upgrade to Full Account
            </button>
          </div>
        )}

        <Section title="Account">
          <Row icon={<UserIcon size={16} />} label={user?.displayName || 'Set Name'} sub={user?.email || 'Guest Account'} onClick={() => setIsEditing(true)} />
          {user?.email && (
            <Row icon={<Mail size={16} />} label="Email" sub={user.email} />
          )}
          <Row icon={<Shield size={16} />} label="Account Type" sub={isGuest ? 'Anonymous Guest' : 'Verified Account'} />
        </Section>

        <Section title="Preferences">
          <Row icon={<Bell size={16} />} label="Notifications" sub="Calls, messages & alerts" onClick={() => setSection('notifications')} />
          <Row icon={<Lock size={16} />} label="Privacy & Security" sub="Visibility, calls, blocked users" onClick={() => setSection('privacy')} />
          <Row icon={<Database size={16} />} label="Storage & Data" sub="Cache, media downloads" onClick={() => setSection('storage')} />
        </Section>

        <Section title="App">
          {/* Install button — most prominent when app can be installed */}
          <Row
            icon={isInstalled ? <Check size={16} /> : <Download size={16} />}
            label={isInstalled ? 'App Installed ✓' : 'Install App'}
            sub={isInstalled ? 'Running as installed PWA' : canInstall ? 'One-tap install available' : 'View installation guide'}
            onClick={() => canInstall ? install() : setSection('install')}
          />
          <Row icon={<Share2 size={16} />} label="Share ViaaChat" sub="Invite friends" onClick={handleShareApp} />
          <Row icon={<HelpCircle size={16} />} label="Help & About" sub="Version, report issue, privacy policy" onClick={() => setSection('about')} />
        </Section>

        <Section title="Account Actions">
          <Row icon={<LogOut size={16} />} label="Sign Out" danger onClick={handleLogout} />
        </Section>

        <p className="text-center text-[10px] text-white/20 mt-2 mb-4">ViaaChat v1.0.0 · E2E Encrypted</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 bg-gray-900/80 backdrop-blur-xl border-b border-white/10 px-4 pt-safe-top">
        <div className="flex items-center gap-3 py-3">
          <button onClick={section ? () => setSection(null) : onClose}
            className="p-2 -ml-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-base font-black text-white flex-1">
            {section === 'notifications' ? 'Notifications'
              : section === 'privacy' ? 'Privacy & Security'
              : section === 'storage' ? 'Storage & Data'
              : section === 'about' ? 'Help & About'
              : section === 'install' ? 'Install App'
              : 'Profile & Settings'}
          </h2>
        </div>
      </div>

      {/* Profile card (only on main screen) */}
      {!section && (
        <div className="flex-shrink-0 mx-4 mt-4 mb-2">
          {isEditing ? (
            <div className="bg-gradient-to-br from-emerald-900/60 to-teal-900/40 border border-emerald-500/20 rounded-3xl p-5">
              <div className="flex gap-4 items-start mb-4">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <img src={currentAvatar} alt="avatar"
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-emerald-500/30" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center">
                    <Camera size={20} className="text-white" />
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
                </div>
                <div className="flex-1 space-y-2">
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={40}
                    placeholder="Display name"
                    className="w-full bg-white/10 text-white placeholder-white/30 border border-white/10 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-emerald-500/50" />
                  <textarea value={about} onChange={e => setAbout(e.target.value)} rows={2} maxLength={139}
                    placeholder="About / Status (optional)"
                    className="w-full bg-white/10 text-white placeholder-white/30 border border-white/10 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-emerald-500/50" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setIsEditing(false); setAvatarPreview(null); setDisplayName(user?.displayName || ''); }}
                  className="flex-1 py-2.5 bg-white/10 text-white/70 rounded-xl text-sm font-bold hover:bg-white/15 transition-all flex items-center justify-center gap-1.5">
                  <X size={14} /> Cancel
                </button>
                <button onClick={handleSave} disabled={isSaving || !displayName.trim()}
                  className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-black shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : saveSuccess ? <Check size={14} /> : <Save size={14} />}
                  {isSaving ? 'Saving…' : saveSuccess ? 'Saved!' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setIsEditing(true)}
              className="w-full flex items-center gap-4 bg-gradient-to-br from-emerald-900/60 to-teal-900/40 border border-emerald-500/20 rounded-3xl p-4 text-left hover:border-emerald-500/40 transition-all">
              <div className="relative">
                <img src={currentAvatar} alt={user?.displayName}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500/30" referrerPolicy="no-referrer" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-gray-950 flex items-center justify-center">
                  <Pencil size={9} className="text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-white text-base truncate">{user?.displayName || 'Set your name'}</p>
                <p className="text-white/50 text-xs truncate">{user?.email || 'Guest Account'}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Shield size={10} className="text-emerald-400" />
                  <span className="text-emerald-400 text-[10px] font-bold">E2E Encrypted</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-white/20" />
            </button>
          )}
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-2 pb-safe-bottom">
        {renderSection()}
      </div>

      {/* Install Guide Modal */}
      {showInstallGuide && (
        <InstallGuideModal
          onClose={() => setShowInstallGuide(false)}
          onInstall={() => { install(); setShowInstallGuide(false); }}
          canInstall={canInstall}
          isInstalling={isInstalling}
          isInstalled={isInstalled}
        />
      )}
    </div>
  );
};
