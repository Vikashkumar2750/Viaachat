/**
 * VideoChat.tsx — Omegle-style 1-on-1 random video chat
 * ─────────────────────────────────────────────────────────────
 * Fixed issues:
 *  1. callerRow lookup fails because queue rows were already deleted before
 *     peer.on('call') fires — now we cache caller info BEFORE deleting rows.
 *  2. Two separate video elements share ONE ref — fixed by using a single
 *     <video> element that is always in the DOM, with absolute positioning
 *     that switches between PiP (connected) and full-half (idle/waiting).
 *  3. Remote video not playing — added explicit .play() calls with autoplay unlock.
 *  4. IsCaller/isAnswerer race — still uses deterministic lower-uid=caller.
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import Peer, { MediaConnection } from 'peerjs';
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, SkipForward,
  Radio, AlertCircle, ArrowLeft, Users, FlipHorizontal, Volume2,
} from 'lucide-react';
import { supabase } from '../supabase';
import type { User } from '../types';

type ConnState = 'idle' | 'waiting' | 'connecting' | 'connected' | 'disconnected';

interface Props {
  user: User;
  onBack: () => void;
}

const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.services.mozilla.com' },
];

export const VideoChat: React.FC<Props> = ({ user, onBack }) => {
  const [connState, setConnState] = useState<ConnState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [stranger, setStranger] = useState<{ name: string; avatar: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [secs, setSecs] = useState(0);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  // Single ref for each video — NEVER duplicated
  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const peerRef          = useRef<Peer | null>(null);
  const localStreamRef   = useRef<MediaStream | null>(null);
  const currentCallRef   = useRef<MediaConnection | null>(null);
  const queueSubRef      = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const connStateRef     = useRef<ConnState>('idle');

  // Keep ref in sync with state for use inside closures
  useEffect(() => { connStateRef.current = connState; }, [connState]);

  // ── Helpers ──────────────────────────────────────────────────
  const safePlay = async (el: HTMLVideoElement | null) => {
    if (!el || !el.srcObject) return;
    try {
      await el.play();
      setNeedsUnlock(false);
    } catch {
      // Autoplay blocked — user must tap to unlock
      setNeedsUnlock(true);
    }
  };

  const attachLocal = useCallback((stream: MediaStream | null) => {
    const el = localVideoRef.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) safePlay(el);
  }, []);

  const attachRemote = useCallback((stream: MediaStream | null) => {
    const el = remoteVideoRef.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) safePlay(el);
  }, []);

  const stopStream = (stream: MediaStream | null) => {
    stream?.getTracks().forEach(t => t.stop());
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const startTimer = useCallback(() => {
    stopTimer();
    setSecs(0);
    timerRef.current = setInterval(() => setSecs(s => s + 1), 1000);
  }, []);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Hang up current call ─────────────────────────────────────
  const hangUpCall = useCallback(() => {
    currentCallRef.current?.close();
    currentCallRef.current = null;
    attachRemote(null);
    stopTimer();
    setSecs(0);
    setStranger(null);
    setNeedsUnlock(false);
  }, [attachRemote]);

  // ── Leave queue ──────────────────────────────────────────────
  const leaveQueue = useCallback(async () => {
    if (queueSubRef.current) {
      await supabase.removeChannel(queueSubRef.current);
      queueSubRef.current = null;
    }
    await supabase.from('video_chat_queue').delete().eq('user_id', user.id);
  }, [user.id]);

  // ── Full cleanup ─────────────────────────────────────────────
  const fullCleanup = useCallback(() => {
    hangUpCall();
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    attachLocal(null);
    peerRef.current?.destroy();
    peerRef.current = null;
    leaveQueue();
    setConnState('idle');
    setError(null);
  }, [hangUpCall, attachLocal, leaveQueue]);

  useEffect(() => () => { fullCleanup(); }, []);

  // ── Online count ─────────────────────────────────────────────
  useEffect(() => {
    const fn = async () => {
      const { count } = await supabase.from('video_chat_queue').select('*', { count: 'exact', head: true });
      setOnlineCount(count ?? 0);
    };
    fn();
    const id = setInterval(fn, 15000);
    return () => clearInterval(id);
  }, [connState]);

  // ── Toggle mute / video ──────────────────────────────────────
  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = isMuted; });
    setIsMuted(m => !m);
  };
  const toggleVideo = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = isVideoOff; });
    setIsVideoOff(v => !v);
  };

  // Flip camera
  const flipCamera = useCallback(async () => {
    if (!localStreamRef.current) return;
    const oldTrack = localStreamRef.current.getVideoTracks()[0];
    const facingMode = oldTrack?.getSettings?.()?.facingMode === 'user' ? 'environment' : 'user';
    oldTrack?.stop();
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
      const newTrack = newStream.getVideoTracks()[0];
      const sender = (currentCallRef.current as any)?.peerConnection?.getSenders?.()?.find((s: RTCRtpSender) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newTrack);
      localStreamRef.current.removeTrack(oldTrack!);
      localStreamRef.current.addTrack(newTrack);
      attachLocal(localStreamRef.current);
    } catch { setError('Could not flip camera.'); }
  }, [attachLocal]);

  // ── Wire a PeerJS call ───────────────────────────────────────
  const wireCall = useCallback((
    call: MediaConnection,
    partnerName: string,
    partnerAvatar: string,
  ) => {
    setConnState('connecting');
    setStranger({ name: partnerName, avatar: partnerAvatar });

    call.on('stream', (remoteStream: MediaStream) => {
      console.log('[VC] Got remote stream tracks:', remoteStream.getTracks().map(t => t.kind));
      // Enable all tracks
      remoteStream.getTracks().forEach(t => { t.enabled = true; });
      attachRemote(remoteStream);
      setConnState('connected');
      startTimer();
    });

    call.on('close', () => {
      hangUpCall();
      // Only change to disconnected if we were connected/connecting
      setConnState(s => (s === 'connected' || s === 'connecting') ? 'disconnected' : s);
    });

    call.on('error', (err) => {
      console.error('[VC] call error:', err);
      hangUpCall();
      setConnState('disconnected');
      setError('Connection lost — tap Next to find someone new.');
    });

    currentCallRef.current = call;
  }, [attachRemote, hangUpCall, startTimer]);

  // ── Main matchmaking ─────────────────────────────────────────
  const startSearch = useCallback(async () => {
    setError(null);
    setConnState('waiting');
    hangUpCall();

    // ── 1. Get local media ───────────────────────────────────────
    let stream = localStreamRef.current;
    if (!stream || !stream.active || stream.getTracks().some(t => t.readyState === 'ended')) {
      stopStream(stream);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        localStreamRef.current = stream;
      } catch {
        setError('Camera/mic access denied. Allow permissions and try again.');
        setConnState('idle');
        return;
      }
    }
    attachLocal(stream);

    // ── 2. Create / reuse Peer ───────────────────────────────────
    let peer = peerRef.current;
    if (!peer || peer.destroyed) {
      peer = new Peer({
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        path: '/',
        config: { iceServers: ICE },
        debug: 0,
      });
      peerRef.current = peer;
    }

    const doMatch = async (myPeerId: string) => {
      await leaveQueue();

      const { error: qErr } = await supabase.from('video_chat_queue').upsert({
        user_id:      user.id,
        peer_id:      myPeerId,
        display_name: user.displayName,
        avatar_url:   user.photoURL,
        joined_at:    new Date().toISOString(),
        matched_with: null,
        matched_peer: null,
      }, { onConflict: 'user_id' });

      if (qErr) {
        setError(`Queue error: ${qErr.message}. Make sure video_chat_schema.sql was run.`);
        setConnState('idle');
        return;
      }

      // ── 3. Look for unmatched partner ────────────────────────
      const { data: waiting } = await supabase
        .from('video_chat_queue')
        .select('user_id, peer_id, display_name, avatar_url')
        .neq('user_id', user.id)
        .is('matched_with', null)
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();

      if (waiting) {
        // Cache partner info NOW before deleting rows
        const partnerName   = waiting.display_name || 'Stranger';
        const partnerAvatar = waiting.avatar_url || '';
        const partnerPeerId = waiting.peer_id;
        const partnerUserId = waiting.user_id;

        // Mark both as matched
        await Promise.allSettled([
          supabase.from('video_chat_queue').update({ matched_with: partnerUserId, matched_peer: partnerPeerId }).eq('user_id', user.id),
          supabase.from('video_chat_queue').update({ matched_with: user.id,        matched_peer: myPeerId       }).eq('user_id', partnerUserId),
        ]);

        // Delete both from queue
        await Promise.allSettled([
          supabase.from('video_chat_queue').delete().eq('user_id', user.id),
          supabase.from('video_chat_queue').delete().eq('user_id', partnerUserId),
        ]);

        if (queueSubRef.current) {
          await supabase.removeChannel(queueSubRef.current);
          queueSubRef.current = null;
        }

        if (!peer || peer.destroyed || !stream?.active) return;

        const isCaller = user.id < partnerUserId; // deterministic

        if (isCaller) {
          console.log('[VC] I am CALLER → calling', partnerPeerId);
          const call = peer.call(partnerPeerId, stream);
          wireCall(call, partnerName, partnerAvatar);
        } else {
          // We are the answerer — set up peer.on('call') FIRST, set UI state
          console.log('[VC] I am ANSWERER → waiting for call from', partnerPeerId);
          setStranger({ name: partnerName, avatar: partnerAvatar });
          setConnState('connecting');

          // Register one-shot call handler specifically for this partner
          peer.removeAllListeners('call');
          peer.on('call', (incomingCall) => {
            if (incomingCall.peer !== partnerPeerId) {
              incomingCall.close(); // reject unexpected calls
              return;
            }
            console.log('[VC] ANSWERER received call from', incomingCall.peer);
            incomingCall.answer(stream as MediaStream);
            wireCall(incomingCall, partnerName, partnerAvatar);
          });

          // Timeout: if no call arrives within 12s, restart search
          setTimeout(() => {
            if (connStateRef.current === 'connecting') {
              console.warn('[VC] Call timeout — restarting search');
              setConnState('disconnected');
              peer?.removeAllListeners('call');
            }
          }, 12000);
        }
        return;
      }

      // ── 4. No match — subscribe to our queue row for updates ─
      const ch = supabase
        .channel(`vcq-${user.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_chat_queue',
          filter: `user_id=eq.${user.id}`,
        }, (payload) => {
          const row = payload.new as any;
          if (row.matched_peer && row.matched_with) {
            // Someone matched us — they will call us. Set up handler.
            const name   = row.matched_name   || 'Stranger';
            const avatar = row.matched_avatar || '';
            setStranger({ name, avatar });
          }
        })
        .subscribe();
      queueSubRef.current = ch;

      // ── 5. Listen for any incoming PeerJS call ───────────────
      peer.removeAllListeners('call');
      peer.on('call', async (incomingCall) => {
        console.log('[VC] Incoming call from', incomingCall.peer);

        // Fetch caller info — try by peer_id (may already be deleted from queue)
        // so we use the stranger state that was set by the subscription update
        const { data: callerRow } = await supabase
          .from('video_chat_queue')
          .select('display_name, avatar_url')
          .eq('peer_id', incomingCall.peer)
          .maybeSingle();

        const name   = callerRow?.display_name || stranger?.name   || 'Stranger';
        const avatar = callerRow?.avatar_url   || stranger?.avatar || '';

        incomingCall.answer(stream as MediaStream);

        if (queueSubRef.current) {
          await supabase.removeChannel(queueSubRef.current);
          queueSubRef.current = null;
        }
        await supabase.from('video_chat_queue').delete().eq('user_id', user.id);

        wireCall(incomingCall, name, avatar);
      });
    };

    if (peer.open) {
      doMatch(peer.id);
    } else {
      peer.removeAllListeners('open');
      peer.on('open', (id) => doMatch(id));
      peer.removeAllListeners('error');
      peer.on('error', (err) => {
        console.error('[PeerJS error]', err);
        setError(`Peer error: ${err.type}. Please try again.`);
        setConnState('idle');
      });
    }
  }, [user, leaveQueue, wireCall, hangUpCall, attachLocal, stranger]);

  const handleNext = useCallback(async () => {
    hangUpCall();
    await leaveQueue();
    peerRef.current?.removeAllListeners('call');
    setConnState('idle');
    setTimeout(() => startSearch(), 300);
  }, [hangUpCall, leaveQueue, startSearch]);

  const handleStop = useCallback(() => fullCleanup(), [fullCleanup]);

  const isActive = connState === 'connected' || connState === 'connecting';
  const isConnected = connState === 'connected';

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col" style={{ height: '100dvh' }}>

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pb-3 bg-gradient-to-b from-black/80 to-transparent pointer-events-none"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3 pointer-events-auto">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <div>
            <p className="text-white font-black text-sm tracking-tight">Explore</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                connState === 'connected'    ? 'bg-emerald-500/20 text-emerald-400'
                : connState === 'connecting' ? 'bg-blue-500/20 text-blue-400'
                : connState === 'waiting'    ? 'bg-amber-500/20 text-amber-400'
                : 'bg-slate-700/80 text-slate-300'
              }`}>
                {(connState === 'waiting' || connState === 'connecting' || connState === 'connected') && (
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    connState === 'connected' ? 'bg-emerald-400' : connState === 'connecting' ? 'bg-blue-400' : 'bg-amber-400'
                  }`} />
                )}
                {connState === 'connected'    ? fmt(secs)
                  : connState === 'connecting' ? 'Connecting…'
                  : connState === 'waiting'    ? 'Searching…'
                  : connState === 'disconnected' ? 'Stranger left'
                  : 'Ready'}
              </span>
              {stranger && connState !== 'idle' && (
                <span className="text-white/50 text-xs truncate max-w-[100px]">{stranger.name}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-white/50 text-xs font-bold pointer-events-auto">
          <Users size={13} />
          <span>{onlineCount} online</span>
        </div>
      </div>

      {/* ── Video area ──────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 overflow-hidden">

        {/* STRANGER (remote) — full screen, always rendered, no transform */}
        <div className="absolute inset-0 bg-gray-900">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            /* never mirror remote video */
          />
          {/* Stranger placeholder overlays */}
          {!isConnected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              {connState === 'waiting' ? (
                <>
                  <div className="relative w-20 h-20">
                    <div className="absolute inset-0 rounded-full border-2 border-emerald-500/30 animate-ping" style={{ animationDuration: '1.6s' }} />
                    <div className="absolute inset-3 rounded-full border-2 border-emerald-500/40 animate-ping" style={{ animationDuration: '2.2s' }} />
                    <div className="w-20 h-20 bg-gradient-to-br from-emerald-600 to-teal-500 rounded-full flex items-center justify-center shadow-2xl shadow-emerald-500/40">
                      <Radio size={32} className="text-white" />
                    </div>
                  </div>
                  <p className="text-white/70 text-sm font-bold animate-pulse">Finding a stranger…</p>
                </>
              ) : connState === 'connecting' ? (
                <>
                  <div className="relative w-20 h-20">
                    <div className="absolute inset-0 rounded-full border-2 border-blue-500/40 animate-ping" />
                    {stranger?.avatar
                      ? <img src={stranger.avatar} alt="" className="w-20 h-20 rounded-full object-cover absolute inset-0 opacity-70" />
                      : <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-500 rounded-full flex items-center justify-center shadow-2xl shadow-blue-500/40">
                          <Users size={32} className="text-white" />
                        </div>
                    }
                  </div>
                  <p className="text-white/70 text-sm font-bold animate-pulse">Connecting to {stranger?.name || 'stranger'}…</p>
                </>
              ) : connState === 'disconnected' ? (
                <>
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                    <AlertCircle size={36} className="text-white/30" />
                  </div>
                  <p className="text-white/50 text-sm font-bold">Stranger disconnected</p>
                  <p className="text-white/30 text-xs">Tap Next to meet someone new</p>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                    <Users size={36} className="text-white/20" />
                  </div>
                  <p className="text-white/30 text-sm">Tap Start to meet someone</p>
                </div>
              )}
            </div>
          )}
          {/* Stranger name badge */}
          {isActive && stranger && (
            <div className="absolute top-20 left-3 bg-black/40 backdrop-blur-md rounded-xl px-3 py-1.5 flex items-center gap-2 border border-white/10">
              {stranger.avatar
                ? <img src={stranger.avatar} alt={stranger.name} className="w-6 h-6 rounded-full object-cover" />
                : <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-black">{stranger.name.charAt(0).toUpperCase()}</div>
              }
              <span className="text-white text-xs font-bold">{stranger.name}</span>
            </div>
          )}
        </div>

        {/* LOCAL VIDEO — always rendered, positioned differently based on state */}
        <div
          className={`absolute z-10 overflow-hidden transition-all duration-500 ${
            isActive
              /* PiP: bottom-right corner when connected */
              ? 'bottom-4 right-4 w-28 h-40 rounded-2xl border-2 border-white/25 shadow-2xl'
              /* Half-screen: bottom half on mobile when idle/waiting */
              : 'left-0 right-0 bottom-0 rounded-t-none border-t border-white/10'
          }`}
          style={isActive ? {} : { height: '45%' }}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isVideoOff ? 'opacity-0' : 'opacity-100'}`}
            style={{ transform: 'scaleX(-1)' /* selfie mirror — local only */ }}
          />
          {isVideoOff && (
            <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center gap-2">
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/20">
                <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
              </div>
              <VideoOff size={16} className="text-white/40" />
            </div>
          )}
          {/* You label */}
          <div className="absolute bottom-1.5 left-1.5 bg-black/50 backdrop-blur-sm rounded-lg px-2 py-0.5 flex items-center gap-1">
            <span className="text-white/80 text-[9px] font-bold">You</span>
            {isMuted && <MicOff size={8} className="text-red-400" />}
          </div>
          {/* Flip camera button */}
          <button
            onClick={flipCamera}
            className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center"
          >
            <FlipHorizontal size={12} className="text-white/70" />
          </button>
        </div>
      </div>

      {/* Tap to unlock audio (autoplay policy) */}
      {needsUnlock && (
        <button
          onClick={() => {
            safePlay(remoteVideoRef.current);
            safePlay(localVideoRef.current);
          }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex items-center gap-2 bg-amber-500 text-white text-sm font-black px-5 py-3 rounded-2xl shadow-2xl animate-bounce"
        >
          <Volume2 size={18} /> Tap to enable video
        </button>
      )}

      {/* Error banner */}
      {error && (
        <div className="absolute top-20 left-4 right-4 z-30 bg-red-500/20 border border-red-500/30 rounded-2xl px-4 py-3 flex items-center gap-3 animate-fade-in backdrop-blur-xl">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm font-semibold flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 text-xs font-bold">✕</button>
        </div>
      )}

      {/* ── Controls bar ────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-6 pt-5 flex flex-col gap-4"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.80) 60%, transparent 100%)',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        }}
      >
        {/* Next button */}
        <div className="flex justify-center">
          {connState !== 'idle' ? (
            <button
              id="video-chat-next-btn"
              onClick={handleNext}
              className="flex items-center gap-2 px-8 py-2.5 rounded-full border border-white/25 font-bold text-sm text-white transition-all active:scale-95 hover:bg-white/10"
              style={{ backdropFilter: 'blur(12px)' }}
            >
              <SkipForward size={16} /> Next
            </button>
          ) : <div className="h-10" />}
        </div>

        {/* Main button row */}
        <div className="flex items-center justify-center gap-4">
          {/* Mute */}
          <button
            onClick={toggleMute}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{ background: isMuted ? '#ef4444' : 'rgba(255,255,255,0.12)' }}
          >
            {isMuted ? <MicOff size={20} className="text-white" /> : <Mic size={20} className="text-white" />}
          </button>

          {/* Primary CTA */}
          {connState === 'idle' ? (
            <button
              id="video-chat-start-btn"
              onClick={startSearch}
              className="px-9 py-3.5 rounded-full font-black text-base text-white flex items-center gap-2 transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #10b981, #0d9488)', boxShadow: '0 0 28px rgba(16,185,129,0.45)' }}
            >
              <Radio size={20} /> Start
            </button>
          ) : connState === 'waiting' ? (
            <button
              id="video-chat-cancel-btn"
              onClick={handleStop}
              className="px-9 py-3.5 rounded-full font-black text-base text-white border border-white/20 transition-all active:scale-95"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              Cancel
            </button>
          ) : connState === 'disconnected' ? (
            <button
              id="video-chat-newchat-btn"
              onClick={startSearch}
              className="px-9 py-3.5 rounded-full font-black text-base text-white flex items-center gap-2 transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #10b981, #0d9488)', boxShadow: '0 0 28px rgba(16,185,129,0.45)' }}
            >
              <Radio size={20} /> New Chat
            </button>
          ) : (
            <button
              id="video-chat-stop-btn"
              onClick={handleStop}
              className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95"
              style={{ background: '#ef4444', boxShadow: '0 0 28px rgba(239,68,68,0.5)' }}
            >
              <PhoneOff size={26} className="text-white" />
            </button>
          )}

          {/* Video toggle */}
          <button
            onClick={toggleVideo}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{ background: isVideoOff ? '#f97316' : 'rgba(255,255,255,0.12)' }}
          >
            {isVideoOff ? <VideoOff size={20} className="text-white" /> : <Video size={20} className="text-white" />}
          </button>
        </div>

        <p className="text-center text-white/20 text-[10px] font-bold uppercase tracking-widest">
          {connState === 'connected'    ? 'Tap Next ⏭ to find a new stranger'
            : connState === 'waiting'    ? 'Searching globally…'
            : connState === 'disconnected' ? 'Stranger left — tap Next or New Chat'
            : connState === 'connecting' ? 'Establishing secure P2P connection…'
            : 'Tap Start to meet a random stranger'}
        </p>
      </div>
    </div>
  );
};
