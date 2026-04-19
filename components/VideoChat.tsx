/**
 * VideoChat.tsx
 * ─────────────────────────────────────────────────────────────
 * Omegle-style 1-on-1 random video chat built on:
 *   • PeerJS (WebRTC peer handshake)
 *   • Supabase Realtime (matchmaking via video_chat_queue table)
 *   • Zero server costs: Google/Mozilla STUN servers + PeerJS public cloud
 *
 * Layout:
 *   Desktop → left: stranger | right: you (50/50 vertical split)
 *   Mobile  → top: stranger  | bottom: you (50/50 horizontal split)
 * ─────────────────────────────────────────────────────────────
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import Peer, { MediaConnection } from 'peerjs';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  SkipForward,
  Radio,
  AlertCircle,
  ArrowLeft,
  Users,
  Wifi,
} from 'lucide-react';
import { supabase } from '../supabase';
import type { User } from '../types';

// ── Types ─────────────────────────────────────────────────────

type ConnectionState =
  | 'idle'          // initial / after disconnect
  | 'waiting'       // in queue, no partner yet
  | 'connecting'    // PeerJS call in-flight
  | 'connected'     // live video feed active
  | 'disconnected'; // partner hung up / error

interface Props {
  user: User;
  onBack: () => void;
}

// ── Free STUN server pool ────────────────────────────────────
// Using Google + Mozilla servers to maximize NAT traversal
// success across mobile data, university Wi-Fi, corporate VPNs.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.services.mozilla.com' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
];

export const VideoChat: React.FC<Props> = ({ user, onBack }) => {
  // ── State ───────────────────────────────────────────────────
  const [connState, setConnState] = useState<ConnectionState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [stranger, setStranger] = useState<{ name: string; avatar: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  // ── Refs (non-reactive) ─────────────────────────────────────
  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentCallRef = useRef<MediaConnection | null>(null);
  const queueSubRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // ── Helpers ─────────────────────────────────────────────────

  /** Attach a stream to a video element */
  const attachStream = (ref: React.RefObject<HTMLVideoElement>, stream: MediaStream | null) => {
    if (!ref.current) return;
    if (stream) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => {}); // autoplay may require user gesture
    } else {
      ref.current.srcObject = null;
    }
  };

  /** Stop all tracks on a stream and detach it from both video elements */
  const stopStream = useCallback((stream: MediaStream | null) => {
    if (!stream) return;
    stream.getTracks().forEach(t => t.stop());
  }, []);

  /** Tear down the current PeerJS connection cleanly */
  const hangUpCall = useCallback(() => {
    if (currentCallRef.current) {
      currentCallRef.current.close();
      currentCallRef.current = null;
    }
    attachStream(remoteVideoRef, null);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setSessionSeconds(0);
    setStranger(null);
  }, []);

  /** Remove this user from the Supabase waiting room */
  const leaveQueue = useCallback(async () => {
    if (queueSubRef.current) {
      await supabase.removeChannel(queueSubRef.current);
      queueSubRef.current = null;
    }
    await supabase.from('video_chat_queue').delete().eq('user_id', user.id);
  }, [user.id]);

  /** Full cleanup: stop camera/mic, kill peer, leave queue */
  const fullCleanup = useCallback(() => {
    hangUpCall();
    stopStream(localStreamRef.current);
    localStreamRef.current = null;

    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    leaveQueue();
    setConnState('idle');
    setError(null);
  }, [hangUpCall, stopStream, leaveQueue]);

  // ── Session timer ───────────────────────────────────────────
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSessionSeconds(0);
    timerRef.current = setInterval(() => setSessionSeconds(s => s + 1), 1000);
  }, []);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Online count (approximate) ──────────────────────────────
  useEffect(() => {
    const fetchCount = async () => {
      const { count } = await supabase
        .from('video_chat_queue')
        .select('*', { count: 'exact', head: true });
      setOnlineCount(count ?? 0);
    };
    fetchCount();
    const id = setInterval(fetchCount, 15000);
    return () => clearInterval(id);
  }, [connState]);

  // ── Cleanup on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => { fullCleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Toggle mute / video ─────────────────────────────────────
  const toggleMute = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = isMuted; });
    setIsMuted(m => !m);
  };

  const toggleVideo = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = isVideoOff; });
    setIsVideoOff(v => !v);
  };

  // ── Wire up an incoming / outgoing call ─────────────────────
  const wireCall = useCallback((call: MediaConnection, partnerName: string, partnerAvatar: string) => {
    setConnState('connecting');
    setStranger({ name: partnerName, avatar: partnerAvatar });

    call.on('stream', (remoteStream) => {
      attachStream(remoteVideoRef, remoteStream);
      setConnState('connected');
      startTimer();
    });

    call.on('close', () => {
      hangUpCall();
      setConnState('disconnected');
    });

    call.on('error', () => {
      hangUpCall();
      setConnState('disconnected');
      setError('Connection lost. Try "Next" to find a new stranger.');
    });

    currentCallRef.current = call;
  }, [hangUpCall, startTimer]);

  // ── Main matchmaking flow ────────────────────────────────────
  const startSearch = useCallback(async () => {
    setError(null);
    setConnState('waiting');
    hangUpCall();

    // ── 1. Get camera/mic (reuse existing stream if alive) ────
    let stream = localStreamRef.current;
    if (!stream || !stream.active) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: true,
        });
        localStreamRef.current = stream;
      } catch {
        setError('Camera/mic access denied. Please allow permissions and try again.');
        setConnState('idle');
        return;
      }
    }
    attachStream(localVideoRef, stream);

    // ── 2. Create PeerJS peer (use existing if alive) ─────────
    let peer = peerRef.current;
    if (!peer || peer.destroyed) {
      peer = new Peer({
        // PeerJS public cloud for signaling (free, no hosting needed)
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        path: '/',
        config: { iceServers: ICE_SERVERS },
        debug: 0,
      });
      peerRef.current = peer;
    }

    // ── 3. Wait for peer to be open, then do matchmaking ──────
    const doMatch = async (myPeerId: string) => {
      // Remove any stale queue entry first
      await leaveQueue();

      // ── 4. Insert self into waiting room ─────────────────────
      const { error: insertErr } = await supabase.from('video_chat_queue').upsert({
        user_id: user.id,
        peer_id: myPeerId,
        display_name: user.displayName,
        avatar_url: user.photoURL,
        joined_at: new Date().toISOString(),
        matched_with: null,
        matched_peer: null,
      }, { onConflict: 'user_id' });

      if (insertErr) {
        setError('Could not reach waiting room. Check that video_chat_schema.sql was run.');
        setConnState('idle');
        return;
      }

      // ── 5. Check for an existing waiting partner ──────────────
      const { data: waiting } = await supabase
        .from('video_chat_queue')
        .select('user_id, peer_id, display_name, avatar_url')
        .neq('user_id', user.id)
        .is('matched_with', null)
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();

      if (waiting) {
        // Found someone — we initiate the call
        // Mark both rows as matched so no third person pairs with either
        await Promise.all([
          supabase.from('video_chat_queue').update({
            matched_with: waiting.user_id,
            matched_peer: waiting.peer_id,
          }).eq('user_id', user.id),
          supabase.from('video_chat_queue').update({
            matched_with: user.id,
            matched_peer: myPeerId,
          }).eq('user_id', waiting.user_id),
        ]);

        // Remove both from the queue table (clean slate)
        await Promise.all([
          supabase.from('video_chat_queue').delete().eq('user_id', user.id),
          supabase.from('video_chat_queue').delete().eq('user_id', waiting.user_id),
        ]);

        if (queueSubRef.current) {
          await supabase.removeChannel(queueSubRef.current);
          queueSubRef.current = null;
        }

        // Call the waiting user
        if (!peer || peer.destroyed || !stream) return;
        const call = peer.call(waiting.peer_id, stream);
        wireCall(call, waiting.display_name || 'Stranger', waiting.avatar_url || '');
        return;
      }

      // ── 6. No one waiting — subscribe to my own row changes ──
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
            // A caller will ring us via PeerJS — wait for the 'call' event on peer.
            // We still display stranger info immediately.
            setStranger({ name: row.display_name || 'Stranger', avatar: row.avatar_url || '' });
          }
        })
        .subscribe();

      queueSubRef.current = ch;

      // ── 7. Listen for incoming PeerJS calls ───────────────────
      peer.removeAllListeners('call');
      peer.on('call', async (call) => {
        // Fetch the caller's display info from the queue before their row is deleted
        const { data: callerRow } = await supabase
          .from('video_chat_queue')
          .select('display_name, avatar_url')
          .eq('peer_id', call.peer)
          .single();

        call.answer(stream as MediaStream);

        if (queueSubRef.current) {
          await supabase.removeChannel(queueSubRef.current);
          queueSubRef.current = null;
        }
        await supabase.from('video_chat_queue').delete().eq('user_id', user.id);

        wireCall(
          call,
          callerRow?.display_name || 'Stranger',
          callerRow?.avatar_url || '',
        );
      });
    };

    if (peer.open) {
      doMatch(peer.id);
    } else {
      peer.removeAllListeners('open');
      peer.on('open', (id) => doMatch(id));
      peer.removeAllListeners('error');
      peer.on('error', (err) => {
        console.error('[PeerJS]', err);
        setError(`Peer error: ${err.type}. Trying again...`);
        setConnState('idle');
      });
    }
  }, [user, leaveQueue, wireCall, hangUpCall]);

  // ── "Next" — skip current stranger ──────────────────────────
  const handleNext = useCallback(async () => {
    hangUpCall();
    await leaveQueue();
    setConnState('idle');
    // Brief pause so the peer connection fully closes
    setTimeout(() => startSearch(), 400);
  }, [hangUpCall, leaveQueue, startSearch]);

  // ── "Stop" — end session entirely ──────────────────────────
  const handleStop = useCallback(() => {
    fullCleanup();
    attachStream(localVideoRef, null);
  }, [fullCleanup]);

  // ── Render helpers ──────────────────────────────────────────

  const ConnectionBadge = () => {
    const map: Record<ConnectionState, { text: string; color: string; dot?: string }> = {
      idle:         { text: 'Ready',              color: 'bg-slate-700/80 text-slate-300' },
      waiting:      { text: 'Searching...',        color: 'bg-amber-500/20 text-amber-400', dot: 'bg-amber-400' },
      connecting:   { text: 'Connecting...',       color: 'bg-blue-500/20 text-blue-400',   dot: 'bg-blue-400' },
      connected:    { text: `${formatTime(sessionSeconds)}`, color: 'bg-emerald-500/20 text-emerald-400', dot: 'bg-emerald-400' },
      disconnected: { text: 'Stranger left',       color: 'bg-red-500/20 text-red-400' },
    };
    const { text, color, dot } = map[connState];
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${color}`}>
        {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot} animate-pulse`} />}
        {text}
      </span>
    );
  };

  // ── Render ──────────────────────────────────────────────────

  const isActive = connState === 'connected' || connState === 'connecting';

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">

      {/* ── Top bar ────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-safe-top pb-3 pt-3 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={18} className="text-white" />
          </button>
          <div>
            <p className="text-white font-black text-sm tracking-tight">Explore Strangers</p>
            <div className="flex items-center gap-2 mt-0.5">
              <ConnectionBadge />
              {stranger && connState !== 'idle' && (
                <span className="text-white/50 text-xs truncate max-w-[100px]">{stranger.name}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-white/50 text-xs font-bold pointer-events-auto">
          <Users size={13} />
          <span>{onlineCount} online</span>
          <Wifi size={13} className="ml-1" />
        </div>
      </div>

      {/* ── Video split-screen ───────────────────────────── */}
      {/* Desktop: flex-row (side by side) | Mobile: flex-col (top/bottom) */}
      <div className="flex flex-col md:flex-row h-full w-full">

        {/* Stranger (top on mobile, left on desktop) */}
        <div className="relative flex-1 overflow-hidden bg-gray-900 border-b md:border-b-0 md:border-r border-white/5">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted={false}
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' /* mirror for natural feel */ }}
          />
          {/* Stranger placeholder when not connected */}
          {!isActive && (
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
                  <p className="text-white/70 text-sm font-bold animate-pulse">Finding a stranger...</p>
                </>
              ) : connState === 'disconnected' ? (
                <>
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                    <AlertCircle size={36} className="text-white/30" />
                  </div>
                  <p className="text-white/50 text-sm font-bold">Stranger disconnected</p>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                    <Users size={36} className="text-white/20" />
                  </div>
                  <p className="text-white/30 text-sm">Stranger's video</p>
                </>
              )}
            </div>
          )}

          {/* Stranger name badge */}
          {isActive && stranger && (
            <div className="absolute bottom-3 left-3 glass-dark rounded-xl px-3 py-1.5 flex items-center gap-2">
              {stranger.avatar ? (
                <img src={stranger.avatar} alt={stranger.name} className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-black">
                  {stranger.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-white text-xs font-bold">{stranger.name}</span>
            </div>
          )}
        </div>

        {/* You (bottom on mobile, right on desktop) */}
        <div className="relative flex-1 overflow-hidden bg-gray-950">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted /* always mute local to prevent echo */
            className={`w-full h-full object-cover transition-opacity duration-300 ${isVideoOff ? 'opacity-0' : 'opacity-100'}`}
            style={{ transform: 'scaleX(-1)' /* selfie mirror */ }}
          />

          {/* Video off placeholder */}
          {isVideoOff && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/20">
                <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
              </div>
              <p className="text-white/50 text-sm font-bold">{user.displayName}</p>
              <div className="flex items-center gap-1.5 text-orange-400 text-xs">
                <VideoOff size={13} />
                <span>Camera off</span>
              </div>
            </div>
          )}

          {/* "You" label */}
          <div className="absolute bottom-3 left-3 glass-dark rounded-xl px-3 py-1.5 flex items-center gap-2">
            <span className="text-white/70 text-xs font-bold">You</span>
            {isMuted && <MicOff size={11} className="text-red-400" />}
          </div>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────── */}
      {error && (
        <div className="absolute top-20 left-4 right-4 z-30 bg-red-500/20 border border-red-500/30 rounded-2xl px-4 py-3 flex items-center gap-3 animate-fade-in backdrop-blur-xl">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm font-semibold flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-xs font-bold">✕</button>
        </div>
      )}

      {/* ── Action bar ───────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pb-safe-bottom pb-4 px-6">
        <div className="flex items-center justify-center gap-4">

          {/* Mute toggle */}
          <button
            onClick={toggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg
              ${isMuted ? 'bg-red-500 shadow-red-500/40' : 'bg-white/10 hover:bg-white/20'}`}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff size={20} className="text-white" /> : <Mic size={20} className="text-white" />}
          </button>

          {/* Video toggle */}
          <button
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg
              ${isVideoOff ? 'bg-orange-500 shadow-orange-500/40' : 'bg-white/10 hover:bg-white/20'}`}
            aria-label={isVideoOff ? 'Turn video on' : 'Turn video off'}
          >
            {isVideoOff ? <VideoOff size={20} className="text-white" /> : <Video size={20} className="text-white" />}
          </button>

          {/* Main CTA: Start / Stop */}
          {connState === 'idle' || connState === 'disconnected' ? (
            <button
              id="video-chat-start-btn"
              onClick={startSearch}
              className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-full font-black text-base shadow-2xl shadow-emerald-500/40 transition-all active:scale-95 flex items-center gap-2"
            >
              <Radio size={20} />
              Start
            </button>
          ) : connState === 'waiting' ? (
            <button
              id="video-chat-cancel-btn"
              onClick={handleStop}
              className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-full font-black text-base border border-white/20 transition-all active:scale-95"
            >
              Cancel
            </button>
          ) : (
            <button
              id="video-chat-stop-btn"
              onClick={handleStop}
              className="w-16 h-16 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center shadow-2xl shadow-red-500/40 transition-all active:scale-95"
              aria-label="End call"
            >
              <PhoneOff size={26} className="text-white" />
            </button>
          )}

          {/* Next button (only during active / disconnected states) */}
          {(isActive || connState === 'disconnected') && (
            <button
              id="video-chat-next-btn"
              onClick={handleNext}
              className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all active:scale-95 border border-white/10"
              aria-label="Next stranger"
              title="Skip to next stranger"
            >
              <SkipForward size={20} className="text-white" />
            </button>
          )}

          {/* Placeholder spacers when Next is hidden, to keep layout balanced */}
          {!isActive && connState !== 'disconnected' && connState !== 'idle' && connState !== 'waiting' && (
            <div className="w-12 h-12" />
          )}
        </div>

        {/* Bottom hint */}
        <p className="text-center text-white/20 text-[10px] font-bold mt-3 uppercase tracking-widest">
          {connState === 'connected'
            ? 'Press ⏭ to find a new stranger instantly'
            : connState === 'waiting'
            ? 'Searching globally — zero server costs'
            : 'Tap Start to meet a random stranger'}
        </p>
      </div>
    </div>
  );
};
