
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Volume2, VolumeX, PhoneOff, Share2, MessageSquare,
  Camera, CameraOff, SignalHigh, Activity, Wifi, Shield, RotateCcw,
} from 'lucide-react';
import { supabase } from '../supabase';
import type { Contact } from '../types';

interface CallScreenProps {
  call: {
    contact: Contact;
    isVideo: boolean;
    callId: string;
    isCaller: boolean;
  };
  onEndCall: () => void;
}

// ─── ICE / STUN / TURN Configuration ─────────────────────────────────────────
const RTCServers: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302', 'stun:stun4.l.google.com:19302'] },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:80?transport=tcp',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    { urls: 'stun:stun.relay.metered.ca:80' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

// ─── Call Quality Monitor ─────────────────────────────────────────────────────
const CallQuality: React.FC<{ pc: RTCPeerConnection | null }> = ({ pc }) => {
  const [quality, setQuality] = useState(3);
  const [latency, setLatency] = useState(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        stats.forEach(report => {
          if (report.type === 'remote-inbound-rtp' && report.roundTripTime !== undefined) {
            const rtt = Math.round(report.roundTripTime * 1000);
            setLatency(rtt);
            const loss = report.fractionLost ? Math.round(report.fractionLost * 100) : 0;
            setQuality(rtt < 100 && loss < 5 ? 3 : rtt < 300 && loss < 15 ? 2 : 1);
          }
        });
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [pc]);

  return (
    <div className="flex items-center gap-3 bg-black/30 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/10 text-[10px] font-bold uppercase tracking-widest">
      <div className="flex items-center gap-1.5">
        <SignalHigh size={14} className={quality >= 2 ? 'text-emerald-400' : 'text-red-400'} />
        <span className={quality >= 2 ? 'text-emerald-400' : 'text-red-400'}>
          {quality === 3 ? 'Excellent' : quality === 2 ? 'Good' : 'Poor'}
        </span>
      </div>
      <div className="w-px h-4 bg-white/10" />
      <div className="flex items-center gap-1.5 text-blue-400">
        <Activity size={14} />
        <span>{latency > 0 ? `${latency}ms` : '---'}</span>
      </div>
    </div>
  );
};

// ─── Ring tone ────────────────────────────────────────────────────────────────
function useRingTone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playRing = useCallback(() => {
    try {
      if (!ctxRef.current || ctxRef.current.state === 'closed') ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(480, ctx.currentTime);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, []);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      return;
    }
    playRing();
    intervalRef.current = setInterval(playRing, 2500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [active, playRing]);
}

// ─── MAIN CALL SCREEN ─────────────────────────────────────────────────────────
export const CallScreen: React.FC<CallScreenProps> = ({ call, onEndCall }) => {
  const [callStatus, setCallStatus] = useState<string>(call.isCaller ? 'Calling...' : 'Connecting...');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true); // DEFAULT speaker ON for mobile UX
  const [isCameraOn, setIsCameraOn] = useState(call.isVideo);
  const [connectionError, setConnectionError] = useState('');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false); // track if remote video arrived

  // ── Media element refs ──────────────────────────────────────────────────────
  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  // ALWAYS rendered hidden <audio> for remote audio — guaranteed to be in DOM
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // ── WebRTC refs ─────────────────────────────────────────────────────────────
  const localStreamRef     = useRef<MediaStream | null>(null);
  const remoteStreamRef    = useRef<MediaStream | null>(null); // keep track of remote stream
  const pcRef              = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates  = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet      = useRef(false);
  const callStartTime      = useRef<number | null>(null);
  const channelsRef        = useRef<any[]>([]);
  const endedRef           = useRef(false);

  useRingTone(call.isCaller && callStatus === 'Calling...');

  // ── Helper: play audio safely handling autoplay policy ─────────────────────
  const playRemoteAudio = useCallback(async () => {
    const el = remoteAudioRef.current;
    if (!el || !el.srcObject) return;
    el.volume = 1.0;
    try {
      await el.play();
      setNeedsAudioUnlock(false);
    } catch {
      // Autoplay blocked — user must interact first
      setNeedsAudioUnlock(true);
    }
  }, []);

  // ── Helper: attach remote stream to all output elements ────────────────────
  const attachRemoteStream = useCallback((stream: MediaStream) => {
    remoteStreamRef.current = stream;

    // 1. Always attach audio tracks to the dedicated <audio> element
    const audioOnly = new MediaStream(stream.getAudioTracks());
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = audioOnly;
      playRemoteAudio();
    }

    // 2. For video calls, attach full stream to <video> element
    if (call.isVideo) {
      const attachVideo = () => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(() => {});
          setRemoteVideoReady(true);
        } else {
          // Video element not mounted yet — retry after next render
          setTimeout(attachVideo, 100);
        }
      };
      attachVideo();
    }
  }, [call.isVideo, playRemoteAudio]);

  // ── Pending ICE candidate drain ─────────────────────────────────────────────
  const applyPendingCandidates = useCallback(async () => {
    if (!pcRef.current || !pendingCandidates.current.length) return;
    const queue = [...pendingCandidates.current];
    pendingCandidates.current = [];
    for (const c of queue) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  }, []);

  const addOrBufferCandidate = useCallback(async (cdata: RTCIceCandidateInit) => {
    if (!cdata || !cdata.candidate) return; // skip empty/null candidates
    if (remoteDescSet.current && pcRef.current) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(cdata)); } catch {}
    } else {
      pendingCandidates.current.push(cdata);
    }
  }, []);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  const endCallCleanup = useCallback(async (updateStatus = true) => {
    if (endedRef.current) return;
    endedRef.current = true;

    if (callStartTime.current) {
      const secs = Math.floor((Date.now() - callStartTime.current) / 1000);
      try {
        await supabase.from('calls').update({ duration: secs, type: secs > 0 ? 'incoming' : 'missed' }).eq('id', call.callId);
      } catch {}
    }
    if (updateStatus) {
      try { await supabase.from('call_signals').update({ status: 'ended' }).eq('id', call.callId); } catch {}
    }

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) { remoteAudioRef.current.pause(); remoteAudioRef.current.srcObject = null; }
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    channelsRef.current.forEach(ch => { try { supabase.removeChannel(ch); } catch {} });
    channelsRef.current = [];
  }, [call.callId]);

  // ── Main WebRTC setup ───────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const startCall = async () => {
      if (!mounted) return;

      // ── Step 1: Get microphone (+ camera for video calls) ──────────────────
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
          },
          video: call.isVideo ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            facingMode: 'user',
            frameRate: { ideal: 30 },
          } : false,
        });
      } catch (e1) {
        // Retry with just audio
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (e2) {
          setCallStatus('Call Failed');
          setConnectionError('Microphone access denied. Please allow mic permission.');
          return;
        }
      }

      if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
      localStreamRef.current = stream;

      // Show local video preview
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      // ── Step 2: Create PeerConnection ──────────────────────────────────────
      const pc = new RTCPeerConnection(RTCServers);
      pcRef.current = pc;

      // ── CRITICAL FIX 1: Add ALL local tracks to the peer connection ────────
      // Each track must be added individually with the full stream reference
      // so the receiver gets both audio AND video streams in the same bundle
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
        console.log('[WebRTC] Added local track:', track.kind, track.label);
      });

      // ── CRITICAL FIX 2: ontrack handler ───────────────────────────────────
      // BUG WAS: used event.streams[0] which is undefined on some mobile browsers
      // FIX: Build the remote stream from individual track events
      // Also handle the case where multiple ontrack events arrive (one per track)
      pc.ontrack = (event) => {
        if (!mounted) return;
        console.log('[WebRTC] ontrack fired:', event.track.kind, 'streams:', event.streams.length);

        // Use event.streams[0] if available; otherwise build from tracks
        let remoteStream = event.streams[0] ?? remoteStreamRef.current ?? new MediaStream();

        if (!event.streams[0]) {
          // Mobile fallback: manually add track to the stream
          if (!remoteStreamRef.current) {
            remoteStreamRef.current = new MediaStream();
          }
          remoteStreamRef.current.addTrack(event.track);
          remoteStream = remoteStreamRef.current;
        }

        // Attach to output elements (retries if video element not yet mounted)
        attachRemoteStream(remoteStream);

        setCallStatus('Connected');
        if (!callStartTime.current) callStartTime.current = Date.now();
        setIsReconnecting(false);
        setConnectionError('');
      };

      // ── ICE connection monitoring ─────────────────────────────────────────
      pc.oniceconnectionstatechange = () => {
        if (!mounted) return;
        const state = pc.iceConnectionState;
        console.log('[WebRTC] ICE state:', state);
        if (state === 'connected' || state === 'completed') {
          setCallStatus('Connected');
          if (!callStartTime.current) callStartTime.current = Date.now();
          setIsReconnecting(false);
          setConnectionError('');
        } else if (state === 'failed') {
          setIsReconnecting(true);
          setCallStatus('Reconnecting...');
          if (call.isCaller) pc.restartIce();
        } else if (state === 'disconnected') {
          setCallStatus('Reconnecting...');
          setIsReconnecting(true);
        } else if (state === 'closed') {
          if (!endedRef.current) { setCallStatus('Ended'); setTimeout(onEndCall, 1000); }
        }
      };

      pc.onconnectionstatechange = () => {
        if (!mounted) return;
        console.log('[WebRTC] Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          setConnectionError('Connection failed. Check your network.');
        }
      };

      // ── ICE candidate → Supabase ──────────────────────────────────────────
      pc.onicecandidate = async (event) => {
        if (!mounted || !event.candidate) return;
        try {
          await supabase.from('ice_candidates').insert({
            signal_id: call.callId,
            candidate: event.candidate.toJSON(),
            role: call.isCaller ? 'caller' : 'receiver',
          });
        } catch {}
      };

      // ── CALLER FLOW ───────────────────────────────────────────────────────
      if (call.isCaller) {
        const myUserId = (await supabase.auth.getUser()).data.user?.id || '';

        await supabase.from('call_signals').upsert({
          id: call.callId,
          caller_id: myUserId,
          receiver_id: call.contact.id,
          is_video: call.isVideo,
          status: 'calling',
        }, { onConflict: 'id' });

        if (!mounted) return;
        if (pc.signalingState === 'closed') return;

        const offerDesc = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true, // always true — receiver decides what to send
        });
        await pc.setLocalDescription(offerDesc);

        await supabase.from('call_signals').update({
          offer: { sdp: offerDesc.sdp, type: offerDesc.type },
        }).eq('id', call.callId);

        // Listen for answer via realtime
        const answerCh = supabase
          .channel(`signal-answer-${call.callId}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'call_signals',
            filter: `id=eq.${call.callId}`,
          }, async (payload) => {
            if (!mounted) return;
            const data = payload.new as any;
            if (!pc.currentRemoteDescription && data.answer) {
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                remoteDescSet.current = true;
                await applyPendingCandidates();
                setCallStatus('Ringing...');
              } catch (e) { console.error('[WebRTC] setRemoteDescription error:', e); }
            }
            if (data.status === 'ended' || data.status === 'rejected') {
              setCallStatus('Ended'); setTimeout(onEndCall, 1200);
            }
          })
          .subscribe();
        channelsRef.current.push(answerCh);

        // Listen for receiver's ICE candidates
        const iceCh = supabase
          .channel(`ice-recv-${call.callId}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'ice_candidates',
            filter: `signal_id=eq.${call.callId}`,
          }, async (payload) => {
            if (!mounted) return;
            const c = payload.new as any;
            // ── CRITICAL FIX 3: Filter correctly — caller wants RECEIVER candidates ──
            if (c.role === 'receiver') {
              await addOrBufferCandidate(c.candidate);
            }
          })
          .subscribe();
        channelsRef.current.push(iceCh);

      } else {
        // ── RECEIVER FLOW ────────────────────────────────────────────────────
        setCallStatus('Connecting...');
        let signalData: any = null;

        // Subscribe realtime first to not miss the offer
        const offerWaitCh = supabase
          .channel(`offer-wait-${call.callId}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'call_signals',
            filter: `id=eq.${call.callId}`,
          }, async (payload) => {
            if (!mounted || signalData) return;
            const incoming = payload.new as any;
            if (incoming.offer) signalData = incoming;
          })
          .subscribe();
        channelsRef.current.push(offerWaitCh);

        // Poll alongside (belt-and-suspenders): 400ms × 30 = 12s max
        for (let attempt = 0; attempt < 30; attempt++) {
          if (!mounted) return;
          if (signalData) break;
          const { data } = await supabase
            .from('call_signals')
            .select('offer, status')
            .eq('id', call.callId)
            .single();
          if (data?.offer) { signalData = data; break; }
          if (data?.status === 'ended') {
            setCallStatus('Missed Call'); setTimeout(onEndCall, 1500); return;
          }
          if (attempt > 0) await new Promise(r => setTimeout(r, 400));
        }

        if (!mounted) return;
        if (!signalData?.offer) {
          setCallStatus('Call Failed');
          setConnectionError('Could not receive call signal. Caller may have cancelled.');
          return;
        }

        try {
          if (pc.signalingState === 'closed') return;
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.offer));
          remoteDescSet.current = true;
          await applyPendingCandidates();

          const answerDesc = await pc.createAnswer();
          if (!mounted) return;
          await pc.setLocalDescription(answerDesc);

          await supabase.from('call_signals').update({
            answer: { type: answerDesc.type, sdp: answerDesc.sdp },
            status: 'connected',
          }).eq('id', call.callId);

        } catch (err) {
          console.error('[WebRTC] Receiver SDP error:', err);
          setCallStatus('Call Failed');
          setConnectionError('Could not establish connection.');
          return;
        }

        // Watch for ended
        const statusCh = supabase
          .channel(`signal-status-${call.callId}`)
          .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'call_signals',
            filter: `id=eq.${call.callId}`,
          }, (payload) => {
            if (!mounted) return;
            const data = payload.new as any;
            if (data.status === 'ended') { setCallStatus('Ended'); setTimeout(onEndCall, 1200); }
          })
          .subscribe();
        channelsRef.current.push(statusCh);

        // Listen for caller's ICE candidates
        const iceCh = supabase
          .channel(`ice-caller-${call.callId}`)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'ice_candidates',
            filter: `signal_id=eq.${call.callId}`,
          }, async (payload) => {
            if (!mounted) return;
            const c = payload.new as any;
            // ── CRITICAL FIX 3: Filter correctly — receiver wants CALLER candidates ──
            if (c.role === 'caller') {
              await addOrBufferCandidate(c.candidate);
            }
          })
          .subscribe();
        channelsRef.current.push(iceCh);
      }
    };

    startCall().catch(err => {
      console.error('[WebRTC] startCall error:', err);
      setCallStatus('Call Failed');
      setConnectionError('Could not start call. Check mic/camera permissions.');
    });

    return () => {
      mounted = false;
      endCallCleanup(true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Duration timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (callStatus !== 'Connected') return;
    const interval = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [callStatus]);

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ── Control handlers ────────────────────────────────────────────────────────
  const handleEndCall = useCallback(async () => {
    await endCallCleanup(true);
    onEndCall();
  }, [endCallCleanup, onEndCall]);

  const handleToggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => (t.enabled = !t.enabled));
    setIsMuted(p => !p);
  };

  const handleToggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => (t.enabled = !t.enabled));
    setIsCameraOn(p => !p);
  };

  const handleToggleSpeaker = async () => {
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    const audioEl = remoteAudioRef.current;
    if (!audioEl) return;
    if ('setSinkId' in HTMLAudioElement.prototype) {
      try {
        if (next) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const speaker = devices.filter(d => d.kind === 'audiooutput')
            .find(d => d.label.toLowerCase().includes('speaker')) || { deviceId: '' };
          await (audioEl as any).setSinkId(speaker.deviceId);
        } else {
          await (audioEl as any).setSinkId('default');
        }
      } catch {}
    }
  };

  const handleAudioUnlock = async () => {
    const el = remoteAudioRef.current;
    if (!el) return;
    // If srcObject was lost, re-attach
    if (!el.srcObject && remoteStreamRef.current) {
      const audioOnly = new MediaStream(remoteStreamRef.current.getAudioTracks());
      el.srcObject = audioOnly;
    }
    try { await el.play(); setNeedsAudioUnlock(false); } catch {}
  };

  const isConnected = callStatus === 'Connected';
  const isFailed = callStatus === 'Call Failed' || callStatus === 'Ended';

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col items-center text-white overflow-hidden">

      {/* ── ALWAYS-RENDERED hidden audio element for remote audio ──────────────
          This is mounted unconditionally so remoteAudioRef.current is NEVER null
          when ontrack fires. Audio works for BOTH voice-only and video calls.
      ────────────────────────────────────────────────────────────────────────── */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        controls={false}
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
      />

      {/* Tap to hear audio — autoplay unlock */}
      {needsAudioUnlock && (
        <button
          onClick={handleAudioUnlock}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-amber-500/95 backdrop-blur-sm text-white text-sm font-black px-5 py-3 rounded-2xl shadow-2xl animate-bounce border border-amber-400/30"
        >
          <Volume2 size={18} />
          Tap to enable audio
        </button>
      )}

      {/* Background */}
      <div className="absolute inset-0 z-0">
        {call.isVideo ? (
          <div className="w-full h-full relative bg-slate-900">
            {/* Remote video — ALWAYS rendered in video mode so ref is always populated */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover transition-opacity duration-500 ${remoteVideoReady ? 'opacity-100' : 'opacity-0'}`}
            />
            {/* Poster / placeholder until remote video arrives */}
            {!remoteVideoReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <img src={call.contact.avatarUrl} alt={call.contact.name}
                  className="w-40 h-40 rounded-full object-cover border-4 border-white/10 shadow-2xl blur-sm opacity-50"
                  referrerPolicy="no-referrer" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-transparent to-slate-950/80" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center relative">
            <div className="absolute inset-0 overflow-hidden">
              <img src={call.contact.avatarUrl} alt=""
                className="w-full h-full object-cover blur-[80px] opacity-30 scale-125"
                referrerPolicy="no-referrer" />
            </div>
            <div className="absolute inset-0 bg-slate-950/60" />
            {!isConnected && (
              <div className="relative flex items-center justify-center">
                <div className="absolute w-64 h-64 border border-emerald-500/20 rounded-full animate-ping [animation-duration:2.5s]" />
                <div className="absolute w-80 h-80 border border-emerald-500/10 rounded-full animate-ping [animation-duration:3.5s]" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative z-10 flex flex-col h-full w-full items-center p-8">
        {/* Top Bar */}
        <div className="w-full flex justify-between items-start">
          <CallQuality pc={pcRef.current} />
          {call.isVideo && (
            <div className="w-28 h-44 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 relative">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              {!isCameraOn && (
                <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
                  <CameraOff size={20} className="text-white/40" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Contact Info */}
        <div className="text-center">
          {!call.isVideo && (
            <div className="relative mb-8">
              <div className="absolute -inset-4 bg-emerald-500/20 rounded-full blur-2xl" />
              <img src={call.contact.avatarUrl} alt={call.contact.name}
                className="relative w-36 h-36 rounded-full border-4 border-white/10 mx-auto shadow-2xl object-cover"
                referrerPolicy="no-referrer" />
              {isConnected && (
                <div className="absolute bottom-2 right-1/2 translate-x-1/2 translate-y-1/2 bg-emerald-500 p-2 rounded-full border-4 border-slate-950">
                  <Wifi size={14} className="text-white" />
                </div>
              )}
            </div>
          )}
          <h2 className="text-4xl font-black tracking-tight drop-shadow-2xl mb-2">{call.contact.name}</h2>
          <div className="flex flex-col items-center gap-1">
            <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${isConnected ? 'bg-emerald-500 text-white' : isFailed ? 'bg-red-500 text-white' : isReconnecting ? 'bg-amber-500 text-white' : 'bg-white/10 text-slate-300'}`}>
              {isConnected ? formatDuration(duration) : callStatus}
            </div>
            {isConnected && (
              <div className="flex items-center gap-1.5 mt-2">
                <Shield size={10} className="text-emerald-400" />
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">End-to-End Encrypted</p>
              </div>
            )}
            {connectionError && (
              <p className="text-[11px] text-red-400 mt-2 font-medium px-4 text-center">{connectionError}</p>
            )}
          </div>
        </div>

        <div className="flex-1" />

        {/* Controls */}
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center space-x-5 mb-6">
            <button onClick={handleToggleMute}
              className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl ${isMuted ? 'bg-red-500 shadow-red-500/30' : 'bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10'}`}>
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>

            {call.isVideo && (
              <button onClick={handleToggleCamera}
                className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl ${!isCameraOn ? 'bg-red-500 shadow-red-500/30' : 'bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10'}`}>
                {isCameraOn ? <Camera size={24} /> : <CameraOff size={24} />}
              </button>
            )}

            <button onClick={handleToggleSpeaker}
              className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl ${isSpeakerOn ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10'}`}>
              {isSpeakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
            </button>

            <button onClick={handleEndCall}
              className="w-20 h-20 bg-red-500 hover:bg-red-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-red-500/40 transition-all active:scale-90">
              <PhoneOff size={32} />
            </button>
          </div>

          <div className="w-full bg-white/5 backdrop-blur-2xl rounded-[2rem] py-4 px-6 flex items-center justify-between text-slate-300 text-[10px] border border-white/10">
            <button className="p-3 rounded-2xl hover:bg-white/10 transition-all" title="Share screen (coming soon)">
              <Share2 size={20} />
            </button>
            {isReconnecting && (
              <div className="flex items-center gap-2 text-amber-400">
                <RotateCcw size={14} className="animate-spin" />
                <span className="text-xs font-bold">Reconnecting...</span>
              </div>
            )}
            <button className="px-6 py-3 rounded-2xl hover:bg-white/10 transition-all flex items-center gap-2 hover:text-white" title="In-call chat">
              <MessageSquare size={18} />
              <span className="uppercase tracking-widest font-bold">Chat</span>
            </button>
            <button className="p-3 rounded-2xl hover:bg-white/10 transition-all">
              <Shield size={20} className="text-emerald-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
