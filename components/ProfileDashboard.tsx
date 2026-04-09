import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { User } from '../types';
import { supabase, signOut } from '../supabase';
import {
  ChevronLeft, Pencil, LogOut, Save, X, Camera, Check, Shield,
  Bell, Lock, Smartphone, Download, Trash2,
  ChevronRight, Loader2, User as UserIcon, Mail, Info, HelpCircle,
  Volume2, Eye, Ban, Star, Share2, ExternalLink,
  Wifi, Globe, AlertCircle, Phone, RefreshCw,
} from 'lucide-react';

interface ProfileDashboardProps {
  user: User | null;
  onClose: () => void;
  onSimulateCall?: () => void;
  onUserUpdated?: (updated: Partial<User>) => void;
}

// ─── PWA Install Hook (reads from global capture in index.html) ───────────────
// The beforeinstallprompt event fires BEFORE React loads.
// index.html captures it on window.__viaaInstallPrompt immediately.
// This hook simply reads that global and listens for the custom event
// in case React was already mounted when it fired.
function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<any>(
    () => (window as any).__viaaInstallPrompt ?? null   // read-from-global on mount
  );
  const [isInstalled, setIsInstalled] = useState(() =>
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // Listen for the custom event dispatched by index.html global listener
    const onInstallable = () => {
      const prompt = (window as any).__viaaInstallPrompt;
      if (prompt) setInstallPrompt(prompt);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('viaachat-installable', onInstallable);
    window.addEventListener('viaachat-installed', onInstalled);
    // Also listen for system appinstalled
    window.addEventListener('appinstalled', onInstalled);

    // Re-check global in case it fired between page load and this effect
    const globalPrompt = (window as any).__viaaInstallPrompt;
    if (globalPrompt && !installPrompt) setInstallPrompt(globalPrompt);

    return () => {
      window.removeEventListener('viaachat-installable', onInstallable);
      window.removeEventListener('viaachat-installed', onInstalled);
      window.removeEventListener('appinstalled', onInstalled);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = useCallback(async () => {
    const prompt = installPrompt ?? (window as any).__viaaInstallPrompt;
    if (!prompt) return false;
    setIsInstalling(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setInstallPrompt(null);
        (window as any).__viaaInstallPrompt = null;
        return true;
      }
    } catch (err) {
      console.warn('Install prompt error:', err);
    } finally {
      setIsInstalling(false);
    }
    return false;
  }, [installPrompt]);

  // canInstall: true if prompt available OR global has it
  const canInstall =
    !isInstalled && !!(installPrompt ?? (window as any).__viaaInstallPrompt);

  return { canInstall, isInstalled, isInstalling, install };
}

// ─── Settings persistence via localStorage ───────────────────────────────────
const SETTINGS_KEY = 'viaachat-settings';
const loadSettings = () => {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
};
const saveSettings = (s: Record<string, any>) => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
};

// ─── UI Primitives ────────────────────────────────────────────────────────────
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-5">
    <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest mb-2 px-1">{title}</p>
    <div className="bg-white/5 rounded-2xl overflow-hidden divide-y divide-white/5">
      {children}
    </div>
  </div>
);

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
    disabled={!onClick && right === undefined}
    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors
      ${onClick ? (danger ? 'hover:bg-red-500/10 active:bg-red-500/20' : 'hover:bg-white/5 active:bg-white/10') : 'cursor-default'}`}
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

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <button
    onClick={e => { e.stopPropagation(); onChange(!value); }}
    className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0
      ${value ? 'bg-emerald-500' : 'bg-white/15'}`}
  >
    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
      ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export const ProfileDashboard: React.FC<ProfileDashboardProps> = ({
  user, onClose, onUserUpdated,
}) => {
  const [section, setSection] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [about, setAbout] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Settings — loaded from localStorage
  const [settings, setSettingsState] = useState(() => ({
    notifCalls: true,
    notifMessages: true,
    notifSounds: true,
    notifVibrate: true,
    privacyLastSeen: true,
    privacyPhoto: true,
    privacyCallsFrom: 'everyone' as 'everyone' | 'contacts' | 'nobody',
    ...loadSettings(),
  }));

  const updateSetting = useCallback(<K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    setSettingsState(prev => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { canInstall, isInstalled, isInstalling, install } = usePWAInstall();

  const isGuest = !user?.email;
  const userId = user?.id || (user as any)?.uid;
  const currentAvatar = avatarPreview || user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`;

  // Load about/bio from DB on mount
  useEffect(() => {
    if (!userId) return;
    supabase.from('users').select('about').eq('id', userId).single().then(({ data }) => {
      if (data?.about) setAbout(data.about);
    });
  }, [userId]);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setSaveError('Image too large (max 3MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!userId || !displayName.trim()) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const updates: Record<string, any> = {
        display_name: displayName.trim(),
        about: about.trim() || null,
      };
      if (avatarPreview) updates.photo_url = avatarPreview;

      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId);

      if (error) throw error;

      if (onUserUpdated) {
        onUserUpdated({
          displayName: displayName.trim(),
          photoURL: avatarPreview || user?.photoURL,
        });
      }
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsEditing(false);
        setAvatarPreview(null);
      }, 1500);
    } catch (err: any) {
      setSaveError(err?.message || 'Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try { await signOut(); } catch {}
    onClose();
  };

  const handleClearCache = async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      localStorage.removeItem('viaachat-chat-cache');
    } catch {}
    alert('Cache cleared!');
  };

  const handleShareApp = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'ViaaChat', text: 'Try ViaaChat — Secure messaging & live rooms!', url: 'https://viaachat.vercel.app' });
      } else {
        await navigator.clipboard.writeText('https://viaachat.vercel.app');
        alert('Link copied to clipboard!');
      }
    } catch {}
  };

  // ── Install section content ──────────────────────────────────────────────
  const renderInstall = () => {
    const ua = navigator.userAgent;
    const isAndroid = /android/i.test(ua);
    const isIOS = /iphone|ipad|ipod/i.test(ua) || ((ua.includes('Mac')) && navigator.maxTouchPoints > 1);
    const isDesktop = !isAndroid && !isIOS;

    const InstallButton = ({ color, label, onClick, isAction = true }: {
      color: string; label: string; onClick?: () => void; isAction?: boolean;
    }) => (
      <button
        onClick={onClick}
        disabled={isInstalling || !isAction}
        className={`w-full flex items-center justify-center gap-2.5 py-3.5 mt-3 rounded-2xl font-black text-white text-sm shadow-lg active:scale-95 transition-all disabled:opacity-60 ${color}`}
      >
        {isInstalling ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
        {isInstalling ? 'Installing…' : label}
      </button>
    );

    const InstalledBadge = () => (
      <div className="mt-3 flex items-center justify-center gap-2 py-3 bg-emerald-500/15 text-emerald-400 font-bold rounded-2xl border border-emerald-500/30 text-sm">
        <Check size={16} /> App installed on this device!
      </div>
    );

    const StepList = ({ steps, color }: { steps: string[]; color: string }) => (
      <div className="px-4 pt-3 pb-1 space-y-2.5">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-3 items-start">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5 ${color}`}>{i + 1}</span>
            <p className="text-sm text-white/70 leading-relaxed">{s}</p>
          </div>
        ))}
      </div>
    );

    // ── Device card factory ──
    const DeviceCard = ({
      emoji, title, badge, borderColor, steps, stepColor, buttonArea,
    }: any) => (
      <div className={`bg-white/5 rounded-2xl border-2 overflow-hidden ${borderColor}`}>
        <div className="flex items-center gap-2 px-4 pt-4">
          <span className="text-xl">{emoji}</span>
          <p className="font-black text-white">{title}</p>
          {badge && <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>Your device</span>}
        </div>
        <StepList steps={steps} color={stepColor} />
        <div className="px-4 pb-4">{buttonArea}</div>
      </div>
    );

    return (
      <div className="space-y-4 pb-6">
        {/* Status banner */}
        <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex gap-3 items-center">
          <span className="text-2xl">{isAndroid ? '📱' : isIOS ? '🍎' : '💻'}</span>
          <div>
            <p className="text-sm font-bold text-white">
              {isAndroid ? 'Android detected' : isIOS ? 'iPhone/iPad detected' : 'Desktop detected'}
            </p>
            <p className="text-xs text-white/40">
              {isInstalled ? '✅ App is already installed'
                : canInstall ? '🟢 Install button is ready below ↓'
                : isIOS ? 'ℹ️ Use Safari Share Sheet to install'
                : '⏳ Open this page in Chrome/Edge to enable install'}
            </p>
          </div>
          {!isInstalled && !isIOS && (
            <button onClick={() => {
              setInstallPromptFromGlobal();
            }} className="ml-auto p-2 rounded-xl bg-white/8 text-white/50 hover:text-white transition-all flex-shrink-0" title="Refresh install button">
              <RefreshCw size={14} />
            </button>
          )}
        </div>

        {/* Android */}
        <DeviceCard
          emoji="📱" title="Android (Chrome)"
          badge={isAndroid ? 'bg-emerald-500/20 text-emerald-400' : null}
          borderColor={isAndroid ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/5' : 'border-white/8'}
          steps={['Open viaachat.vercel.app in Chrome', 'Tap ⋮ (3-dot menu) in the top-right corner', 'Tap "Add to Home screen"', 'Tap "Install" to confirm']}
          stepColor="bg-emerald-500/20 text-emerald-400"
          buttonArea={
            isInstalled ? <InstalledBadge /> :
            canInstall ? <InstallButton color="bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/30" label="📲 Install on Android" onClick={() => install()} /> :
            isAndroid ? (
              <div className="mt-3 space-y-2">
                <div className="px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-xs text-amber-400 font-semibold mb-1">Install button loading or not showing?</p>
                  <ul className="text-xs text-amber-300/70 space-y-1 list-disc list-inside">
                    <li>Make sure you're using <strong>Chrome</strong> (not Samsung Internet, Firefox, or Edge on Android)</li>
                    <li>Wait a few seconds and tap <RefreshCw size={10} className="inline" /> above to retry</li>
                    <li>You may have already dismissed the install prompt before — clear browser data and try again</li>
                  </ul>
                </div>
                <InstallButton color="bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/30" label="📲 Try Install Anyway" onClick={() => install()} />
              </div>
            ) : <InstallButton color="bg-emerald-500/30" label="Open on Android to install" isAction={false} />
          }
        />

        {/* iPhone */}
        <DeviceCard
          emoji="🍎" title="iPhone / iPad (Safari)"
          badge={isIOS ? 'bg-blue-500/20 text-blue-400' : null}
          borderColor={isIOS ? 'border-blue-500/50 shadow-lg shadow-blue-500/5' : 'border-white/8'}
          steps={['Open viaachat.vercel.app in Safari (not Chrome)', 'Tap the Share icon (□↑) at the bottom of Safari', 'Scroll the share sheet and tap "Add to Home Screen"', 'Tap "Add" in the top-right corner']}
          stepColor="bg-blue-500/20 text-blue-400"
          buttonArea={
            isInstalled ? <InstalledBadge /> :
            isIOS ? (
              <>
                <button
                  onClick={async () => {
                    try {
                      if (navigator.share) await navigator.share({ title: 'ViaaChat', url: window.location.href });
                    } catch {}
                  }}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 mt-3 rounded-2xl font-black text-white text-sm bg-gradient-to-r from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                >
                  <Download size={18} /> Open Share Sheet → Add to Home Screen
                </button>
                <p className="text-center text-[10px] text-white/25 mt-2">Apple doesn't allow auto-install — you must use Safari's Share Sheet</p>
              </>
            ) : <InstallButton color="bg-blue-500/30" label="Open on iPhone/iPad to install" isAction={false} />
          }
        />

        {/* Desktop */}
        <DeviceCard
          emoji="💻" title="Desktop (Chrome / Edge)"
          badge={isDesktop ? 'bg-purple-500/20 text-purple-400' : null}
          borderColor={isDesktop ? 'border-purple-500/50 shadow-lg shadow-purple-500/5' : 'border-white/8'}
          steps={['Open viaachat.vercel.app in Chrome or Edge', 'Look for the install icon (⊕) in the address bar', 'Click it and select "Install" in the popup', 'The app opens as a standalone window']}
          stepColor="bg-purple-500/20 text-purple-400"
          buttonArea={
            isInstalled ? <InstalledBadge /> :
            canInstall ? <InstallButton color="bg-gradient-to-r from-violet-500 to-purple-600 shadow-purple-500/30" label="⬇ Install on this Computer" onClick={() => install()} /> :
            isDesktop ? (
              <div className="mt-3 space-y-2">
                <div className="px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-xs text-amber-400 font-semibold mb-1">Not seeing the install button?</p>
                  <ul className="text-xs text-amber-300/70 space-y-1 list-disc list-inside">
                    <li>Use Chrome or Edge (not Firefox, Safari, or Opera)</li>
                    <li>Look for ⊕ install icon in the address bar</li>
                    <li>Or use Chrome ⋮ menu → "Install ViaaChat"</li>
                  </ul>
                </div>
                <InstallButton color="bg-gradient-to-r from-violet-500 to-purple-600 shadow-purple-500/30" label="⬇ Try Install Anyway" onClick={() => install()} />
              </div>
            ) : <InstallButton color="bg-purple-500/30" label="Open on Desktop to install" isAction={false} />
          }
        />

        <p className="text-center text-[10px] text-white/20">ViaaChat PWA · Works offline · No app store · Free</p>
      </div>
    );
  };

  // Helper to re-read global install prompt
  const setInstallPromptFromGlobal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('viaachat-installable'));
  }, []);

  // ── Section renderer ──────────────────────────────────────────────────────
  const renderSection = () => {
    if (section === 'notifications') return (
      <div>
        <Section title="Call Alerts">
          <Row icon={<Phone size={16} />} label="Incoming Calls" sub="Ring when someone calls"
            right={<Toggle value={settings.notifCalls} onChange={v => updateSetting('notifCalls', v)} />} />
        </Section>
        <Section title="Messages">
          <Row icon={<Bell size={16} />} label="New Messages" sub="Notify for new messages"
            right={<Toggle value={settings.notifMessages} onChange={v => updateSetting('notifMessages', v)} />} />
        </Section>
        <Section title="Sound & Vibration">
          <Row icon={<Volume2 size={16} />} label="Sounds"
            right={<Toggle value={settings.notifSounds} onChange={v => updateSetting('notifSounds', v)} />} />
          <Row icon={<Smartphone size={16} />} label="Vibration"
            right={<Toggle value={settings.notifVibrate} onChange={v => updateSetting('notifVibrate', v)} />} />
        </Section>
      </div>
    );

    if (section === 'privacy') return (
      <div>
        <Section title="Profile Visibility">
          <Row icon={<Eye size={16} />} label="Last Seen" sub="Show when you were last active"
            right={<Toggle value={settings.privacyLastSeen} onChange={v => updateSetting('privacyLastSeen', v)} />} />
          <Row icon={<Camera size={16} />} label="Profile Photo" sub="Show to everyone"
            right={<Toggle value={settings.privacyPhoto} onChange={v => updateSetting('privacyPhoto', v)} />} />
        </Section>
        <Section title="Who Can Call Me">
          <div className="px-4 py-3 space-y-1">
            {([
              { val: 'everyone', label: 'Everyone' },
              { val: 'contacts', label: 'My contacts only' },
              { val: 'nobody', label: 'Nobody' },
            ] as const).map(({ val, label }) => (
              <button key={val} onClick={() => updateSetting('privacyCallsFrom', val)}
                className="w-full flex items-center justify-between py-2.5 px-1 rounded-xl hover:bg-white/5 transition-colors">
                <span className="text-sm text-white/80">{label}</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
                  ${settings.privacyCallsFrom === val ? 'border-emerald-500 bg-emerald-500' : 'border-white/20'}`}>
                  {settings.privacyCallsFrom === val && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
              </button>
            ))}
          </div>
        </Section>
        <Section title="Blocked Users">
          <Row icon={<Ban size={16} />} label="Blocked Users" sub="Manage who you've blocked" onClick={() => {}} />
        </Section>
        <Section title="Danger Zone">
          <Row icon={<Trash2 size={16} />} label="Delete My Account" sub="Permanently remove all your data" danger
            onClick={() => { if (confirm('Delete your account? This cannot be undone.')) handleLogout(); }} />
        </Section>
      </div>
    );

    if (section === 'storage') return (
      <div>
        <Section title="Cache">
          <Row icon={<Trash2 size={16} />} label="Clear App Cache" sub="Frees up space from temporary files" onClick={handleClearCache} />
        </Section>
        <Section title="Media Auto-Download">
          <Row icon={<Wifi size={16} />} label="On Wi-Fi" sub="Photos, videos, voice"
            right={<Toggle value={true} onChange={() => {}} />} />
          <Row icon={<Globe size={16} />} label="On Mobile Data" sub="Photos only"
            right={<Toggle value={false} onChange={() => {}} />} />
        </Section>
        <Section title="Usage">
          <div className="px-4 py-3 space-y-2 text-sm text-white/50">
            <div className="flex justify-between"><span>Photos & Videos</span><span>~</span></div>
            <div className="flex justify-between"><span>Voice messages</span><span>~</span></div>
            <div className="flex justify-between"><span>Documents</span><span>~</span></div>
          </div>
        </Section>
      </div>
    );

    if (section === 'about') return (
      <div>
        <Section title="App">
          <Row icon={<Info size={16} />} label="Version" sub="1.0.0 · Production (PWA)" />
          <Row icon={<Star size={16} />} label="Rate ViaaChat" sub="Enjoying the app? Let us know!" onClick={() => window.open('https://viaachat.vercel.app', '_blank')} />
          <Row icon={<Share2 size={16} />} label="Share ViaaChat" sub="Invite friends to join" onClick={handleShareApp} />
          <Row icon={<ExternalLink size={16} />} label="Privacy Policy" onClick={() => window.open('https://viaachat.vercel.app/privacy', '_blank')} />
          <Row icon={<AlertCircle size={16} />} label="Report a Bug" onClick={() => window.open('mailto:support@viaachat.app?subject=Bug Report', '_blank')} />
        </Section>
        <Section title="Built with">
          <div className="px-4 py-3 text-xs text-white/30 space-y-1">
            <p>React + TypeScript + Vite</p>
            <p>Supabase (Auth, Realtime, PostgreSQL)</p>
            <p>WebRTC (P2P Audio/Video)</p>
            <p>PWA · End-to-end encrypted</p>
          </div>
        </Section>
      </div>
    );

    if (section === 'install') return renderInstall();

    // ── Main menu ──
    return (
      <div>
        {/* Guest banner */}
        {isGuest && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-5">
            <p className="text-sm font-bold text-amber-400 mb-1">👤 Guest Account</p>
            <p className="text-xs text-white/50 mb-3">Your data is temporary. Sign up to save everything across devices.</p>
            <button className="w-full py-2.5 bg-amber-500 text-white text-sm font-black rounded-xl hover:bg-amber-600 transition-all">
              Upgrade — Create Free Account
            </button>
          </div>
        )}

        <Section title="Account">
          <Row icon={<UserIcon size={16} />} label={user?.displayName || 'Set your name'}
            sub={user?.email || 'Guest · tap to edit profile'}
            onClick={() => { setIsEditing(true); setSection(null); }} />
          {user?.email && <Row icon={<Mail size={16} />} label="Email" sub={user.email} />}
          <Row icon={<Shield size={16} />} label="Account Type" sub={isGuest ? 'Anonymous Guest' : 'Verified Account'} />
        </Section>

        <Section title="Settings">
          <Row icon={<Bell size={16} />} label="Notifications" sub="Calls, messages, sounds" onClick={() => setSection('notifications')} />
          <Row icon={<Lock size={16} />} label="Privacy & Security" sub="Last seen, calls, blocked users" onClick={() => setSection('privacy')} />
          <Row icon={<Info size={16} />} label="Storage & Data" sub="Cache, media downloads" onClick={() => setSection('storage')} />
        </Section>

        <Section title="App">
          <Row
            icon={isInstalled ? <Check size={16} /> : <Download size={16} />}
            label={isInstalled ? 'App Installed ✓' : 'Install App'}
            sub={isInstalled ? 'Running as installed PWA' : canInstall ? '🟢 One-tap install ready!' : 'Install guide for all devices'}
            onClick={() => canInstall ? install() : setSection('install')}
          />
          <Row icon={<Share2 size={16} />} label="Share ViaaChat" sub="Invite friends" onClick={handleShareApp} />
          <Row icon={<HelpCircle size={16} />} label="Help & About" sub="Version, report issue, privacy" onClick={() => setSection('about')} />
        </Section>

        <Section title="Account">
          <Row icon={<LogOut size={16} />} label="Sign Out" danger onClick={handleLogout} />
        </Section>

        <p className="text-center text-[10px] text-white/20 mt-2 mb-6">ViaaChat v1.0.0 · E2E Encrypted</p>
      </div>
    );
  };

  const sectionTitle = section === 'notifications' ? 'Notifications'
    : section === 'privacy' ? 'Privacy & Security'
    : section === 'storage' ? 'Storage & Data'
    : section === 'about' ? 'Help & About'
    : section === 'install' ? 'Install App'
    : 'Profile & Settings';

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 bg-gray-900/80 backdrop-blur-xl border-b border-white/10 px-4 pt-safe-top">
        <div className="flex items-center gap-2 py-3">
          <button onClick={section ? () => setSection(null) : isEditing ? () => { setIsEditing(false); setAvatarPreview(null); } : onClose}
            className="p-2 -ml-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-base font-black text-white flex-1">{isEditing ? 'Edit Profile' : sectionTitle}</h2>
          {isEditing && (
            <button onClick={handleSave} disabled={isSaving || !displayName.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 text-white rounded-xl text-sm font-black disabled:opacity-50 hover:bg-emerald-600 transition-all">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : saveSuccess ? <Check size={14} /> : <Save size={14} />}
              {isSaving ? 'Saving…' : saveSuccess ? 'Saved!' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Edit profile */}
      {isEditing ? (
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
          {saveError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-sm text-red-400">{saveError}</div>
          )}
          <div className="flex justify-center">
            <button onClick={() => fileInputRef.current?.click()} className="relative group">
              <img src={currentAvatar} alt="avatar"
                className="w-28 h-28 rounded-3xl object-cover border-2 border-emerald-500/30" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 rounded-3xl bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera size={24} className="text-white" />
                <span className="text-white text-xs mt-1 font-bold">Change Photo</span>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            </button>
          </div>
          <div>
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2 block">Display Name *</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={40}
              placeholder="Your name"
              className="w-full bg-white/8 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-emerald-500/50 text-sm font-semibold" />
          </div>
          <div>
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2 block">About / Status</label>
            <textarea value={about} onChange={e => setAbout(e.target.value)} rows={3} maxLength={139}
              placeholder="Hey there! I'm using ViaaChat."
              className="w-full bg-white/8 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-emerald-500/50 text-sm resize-none" />
            <p className="text-right text-xs text-white/25 mt-1">{about.length}/139</p>
          </div>
          {user?.email && (
            <div>
              <label className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2 block">Email (read-only)</label>
              <div className="w-full bg-white/5 border border-white/8 rounded-2xl px-4 py-3 text-white/40 text-sm">{user.email}</div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Profile card on main menu */}
          {!section && (
            <div className="flex-shrink-0 mx-4 mt-4 mb-2">
              <button onClick={() => setIsEditing(true)}
                className="w-full flex items-center gap-4 bg-gradient-to-br from-emerald-900/60 to-teal-900/40 border border-emerald-500/20 rounded-3xl p-4 text-left hover:border-emerald-500/40 transition-all active:scale-[0.99]">
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
                  {about && <p className="text-white/30 text-xs truncate mt-0.5">"{about}"</p>}
                </div>
                <ChevronRight size={16} className="text-white/20" />
              </button>
            </div>
          )}

          {/* Scrollable settings */}
          <div className="flex-1 overflow-y-auto px-4 py-2 pb-safe-bottom">
            {renderSection()}
          </div>
        </>
      )}
    </div>
  );
};
