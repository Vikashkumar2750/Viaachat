
import React, { useState } from 'react';
import { signInWithGoogle, signInAsGuest, signInWithEmail, signUpWithEmail } from '../supabase';
import { LogIn, UserCircle, Mail, Eye, EyeOff, Loader2, Shield } from 'lucide-react';

type AuthMode = 'landing' | 'email-login' | 'email-signup';

export const Login: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      // Supabase redirects back to the app after OAuth
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed.');
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInAsGuest();
    } catch (err: any) {
      setError(err.message || 'Guest sign-in failed. Anonymous auth may not be enabled in Supabase.');
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed.');
      setLoading(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !displayName) return;
    setLoading(true);
    setError(null);
    try {
      await signUpWithEmail(email, password, displayName);
      setError('Check your email to confirm your account!');
    } catch (err: any) {
      setError(err.message || 'Sign-up failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-gray-950 via-emerald-950 to-gray-950 text-white p-6 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-[-20%] left-[-20%] w-[60vw] h-[60vw] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-3xl flex items-center justify-center mb-4 shadow-2xl shadow-emerald-500/30">
            <span className="text-white text-4xl font-black">V</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            ViaaChat
          </h1>
          <p className="text-white/50 text-sm mt-2 text-center">
            Secure, encrypted messaging & live rooms
          </p>
        </div>

        {/* E2EE badge */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <Shield size={14} className="text-emerald-400" />
          <span className="text-emerald-400 text-xs font-bold uppercase tracking-widest">End-to-End Encrypted</span>
        </div>

        {mode === 'landing' && (
          <div className="space-y-3">
            {/* Google Sign In */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-white text-gray-900 font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 hover:bg-gray-100 transition-all shadow-xl active:scale-95 disabled:opacity-70"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Continue with Google
            </button>

            {/* Email Sign In */}
            <button
              onClick={() => setMode('email-login')}
              className="w-full bg-white/10 hover:bg-white/15 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all border border-white/10 active:scale-95"
            >
              <Mail size={20} />
              Continue with Email
            </button>

            {/* Guest */}
            <button
              onClick={handleGuestLogin}
              disabled={loading}
              className="w-full bg-transparent text-white/60 font-medium py-3 px-6 rounded-2xl flex items-center justify-center gap-3 hover:text-white/90 transition-all active:scale-95 disabled:opacity-50"
            >
              <UserCircle size={18} />
              Continue as Guest
            </button>

            {error && (
              <p className="text-red-400 text-sm text-center bg-red-500/10 rounded-xl p-3 border border-red-500/20">
                {error}
              </p>
            )}

            <p className="text-center text-xs text-white/30 pt-2">
              By continuing, you agree to our Terms of Service
            </p>
          </div>
        )}

        {(mode === 'email-login' || mode === 'email-signup') && (
          <form onSubmit={mode === 'email-login' ? handleEmailLogin : handleEmailSignup} className="space-y-3">
            <h2 className="text-xl font-black text-center mb-4">
              {mode === 'email-login' ? 'Welcome back' : 'Create account'}
            </h2>

            {mode === 'email-signup' && (
              <div>
                <label className="text-xs font-bold text-white/50 uppercase tracking-widest ml-1 block mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="w-full bg-white/10 border border-white/10 rounded-2xl py-4 px-5 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 focus:bg-white/15 transition-all"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-white/50 uppercase tracking-widest ml-1 block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-white/10 border border-white/10 rounded-2xl py-4 px-5 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 focus:bg-white/15 transition-all"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-white/50 uppercase tracking-widest ml-1 block mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full bg-white/10 border border-white/10 rounded-2xl py-4 px-5 pr-12 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 focus:bg-white/15 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <p className={`text-sm text-center rounded-xl p-3 border ${error.includes('Check your email') ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-emerald-500/20 hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : null}
              {mode === 'email-login' ? 'Sign In' : 'Create Account'}
            </button>

            <div className="flex items-center justify-center gap-4 pt-2">
              <button type="button" onClick={() => { setMode('landing'); setError(null); }} className="text-white/40 text-sm hover:text-white/70 transition-colors">
                ← Back
              </button>
              <div className="w-px h-4 bg-white/10" />
              <button
                type="button"
                onClick={() => { setMode(mode === 'email-login' ? 'email-signup' : 'email-login'); setError(null); }}
                className="text-emerald-400 text-sm font-bold hover:text-emerald-300 transition-colors"
              >
                {mode === 'email-login' ? 'New here? Sign up' : 'Already have an account?'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
