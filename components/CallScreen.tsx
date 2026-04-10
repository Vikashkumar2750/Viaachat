
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Volume2, VolumeX, PhoneOff,
  Camera, CameraOff, SignalHigh, Activity, Wifi, Shield, RotateCcw, Loader2,
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

// ─── ICE Config ────────────────────────────────────────────────────────────────
const RTCConfig: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302'] },
    {
      urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

// ─── Ring tone ─────────────────────────────────────────────────────────────────
function useRingTone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ring = useCallback(() => {
    try {
      if (!ctxRef.current || ctxRef.current.state === 'closed') ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(480, ctx.currentTime);
      osc.frequency.setValueAtTime(420, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, []);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearInterval(timerRef.current);
      ctxRef.current?.close().catch(() => {}); ctxRef.current = null; return;
    }
    ring();
    timerRef.current = setInterval(ring, 2500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active, ring]);
}

// ─── Quality monitor ───────────────────────────────────────────────────────────
const CallQualityBadge: React.FC<{ pc: RTCPeerConnection | null }> = ({ pc }) => {
  const [rtt, setRtt] = useState(0);
  const [quality, setQuality] = useState(3);
  useEffect(() => {
    const t = setInterval(async () => {
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        stats.forEach(r => {
          if (r.type === 'remote-inbound-rtp' && r.roundTripTime) {
            const ms = Math.round(r.roundTripTime * 1000);
            setRtt(ms); setQuality(ms < 120 ? 3 : ms < 300 ? 2 : 1);
          }
        });
      } catch {}
    }, 3000);
    return () => clearInterval(t);
  }, [pc]);
  return (
    <div className="flex items-center gap-2 bg-black/30 backdrop-blur-xl px-3 py-1.5 rounded-2xl border border-white/10 text-[10px] font-bold">
      <SignalHigh size={13} className={quality >= 2 ? 'text-emerald-400' : 'text-red-400'} />
      <span className={quality >= 2 ? 'text-emerald-400' : 'text-red-400'}>{quality === 3 ? 'Excellent' : quality === 2 ? 'Good' : 'Poor'}</span>
      {rtt > 0 && <><div className="w-px h-3 bg-white/10" /><Activity size={13} className="text-blue-400" /><span className="text-blue-400">{rtt}ms</span></>}
    </div>
  );
};

// ─── MAIN CALL SCREEN ──────────────────────────────────────────────────────────
export const CallScreen: React.FC<CallScreenProps> = ({ call, onEndCall }) => {
  const [callStatus, setCallStatus]     = useState(call.isCaller ? 'Calling...' : 'Connecting...');
  const [duration, setDuration]         = useState(0);
  const [isMuted, setIsMuted]           = useState(false);
  const [isSpeakerOn, setIsSpeakerOn]   = useState(true); // speaker ON by default
  const [isCameraOn, setIsCameraOn]     = useState(call.isVideo);
  const [connectionError, setConnectionError] = useState('');
  const [isReconnecting, setIsReconnecting]   = useState(false);
  const [needsUnlock, setNeedsUnlock]   = useState(false); // autoplay blocked
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);

  // DOM refs
  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  // NOTE: audio element rendered at bottom of body area — never hidden (display:none kills audio)
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // WebRTC refs
  const localStreamRef     = useRef<MediaStream | null>(null);
  const remoteStreamRef    = useRef<MediaStream | null>(null);
  const pcRef              = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates  = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet      = useRef(false);
  const callStartTime      = useRef<number | null>(null);
  const channelsRef        = useRef<any[]>([]);
  const endedRef           = useRef(false);

  useRingTone(call.isCaller && callStatus === 'Calling...');

  // ── Play remote audio safely ────────────────────────────────────────────────
  const playAudio = useCallback(async () => {
    const el = remoteAudioRef.current;
    if (!el) return;
    el.volume = 1.0;
    try { await el.play(); setNeedsUnlock(false); }
    catch { setNeedsUnlock(true); }
  }, []);

  // ── Attach remote stream to output elements ─────────────────────────────────
  const attachRemoteStream = useCallback((stream: MediaStream) => {
    if (!stream) return;
    remoteStreamRef.current = stream;

    // Ensure all tracks are enabled
    stream.getTracks().forEach(t => { t.enabled = true; });

    // Audio: attach full stream directly to <audio> element
    const el = remoteAudioRef.current;
    if (el) {
      el.srcObject = stream;
      playAudio();
    }

    // Video: attach to <video> element (retry until mounted)
    if (call.isVideo) {
      const tryVideo = () => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(() => {});
          setRemoteVideoReady(true);
        } else { setTimeout(tryVideo, 80); }
      };
      tryVideo();
    }
  }, [call.isVideo, playAudio]);

  // ── ICE buffering ───────────────────────────────────────────────────────────
  const drainPendingCandidates = useCallback(async () => {
    if (!pcRef.current || !pendingCandidates.current.length) return;
    const q = [...pendingCandidates.current]; pendingCandidates.current = [];
    for (const c of q) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  }, []);

  const bufferOrAddCandidate = useCallback(async (c: RTCIceCandidateInit) => {
    if (!c?.candidate) return;
    if (remoteDescSet.current && pcRef.current) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    } else { pendingCandidates.current.push(c); }
  }, []);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  const cleanup = useCallback(async (sendEnd = true) => {
    if (endedRef.current) return; endedRef.current = true;
    if (sendEnd) {
      const secs = callStartTime.current ? Math.floor((Date.now() - callStartTime.current) / 1000) : 0;
      // Broadcast end signal instantly
      channelsRef.current.forEach(ch => {
        try { ch.send?.({ type: 'broadcast', event: 'call-end', payload: {} }); } catch {}
      });
      try { await supabase.from('call_signals').update({ status: 'ended' }).eq('id', call.callId); } catch {}
      if (secs > 0) {
        try { await supabase.from('calls').update({ duration: secs }).eq('id', call.callId); } catch {}
      }
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    if (remoteAudioRef.current) { remoteAudioRef.current.pause(); remoteAudioRef.current.srcObject = null; }
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    channelsRef.current.forEach(ch => { try { supabase.removeChannel(ch); } catch {}; });
    channelsRef.current = [];
  }, [call.callId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // MAIN WebRTC SETUP
  // KEY ARCHITECTURE: Uses Supabase Realtime BROADCAST for signaling
  // (not DB polling) → sub-100ms latency instead of 400ms+ polling
  // DB is used only for: initial call record + fallback offer retrieval
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const run = async () => {
      // ── Step 1: Get mic (and camera) ──────────────────────────────────────
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
          video: call.isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
        });
      } catch {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch {
          if (mounted) { setCallStatus('Call Failed'); setConnectionError('Microphone denied. Allow mic permission and try again.'); }
          return;
        }
      }
      if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }

      // Ensure audio track is enabled and not muted
      stream.getAudioTracks().forEach(t => { t.enabled = true; });
      localStreamRef.current = stream;

      if (localVideoRef.current) { localVideoRef.current.srcObject = stream; localVideoRef.current.play().catch(() => {}); }

      // ── Step 2: Create peer connection ────────────────────────────────────
      const pc = new RTCPeerConnection(RTCConfig);
      pcRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach(t => { t.enabled = true; pc.addTrack(t, stream); });

      // ontrack — receive remote media
      pc.ontrack = (event) => {
        if (!mounted) return;
        let rs = event.streams?.[0];
        if (!rs) {
          if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
          remoteStreamRef.current.addTrack(event.track);
          rs = remoteStreamRef.current;
        }
        event.track.enabled = true;
        attachRemoteStream(rs);
        setCallStatus('Connected');
        if (!callStartTime.current) callStartTime.current = Date.now();
        setIsReconnecting(false); setConnectionError('');
      };

      pc.oniceconnectionstatechange = () => {
        if (!mounted) return;
        const s = pc.iceConnectionState;
        if (s === 'connected' || s === 'completed') {
          setCallStatus('Connected'); setIsReconnecting(false); setConnectionError('');
          if (!callStartTime.current) callStartTime.current = Date.now();
        } else if (s === 'failed') {
          setIsReconnecting(true); setCallStatus('Reconnecting...');
          if (call.isCaller) pc.restartIce();
        } else if (s === 'disconnected') { setIsReconnecting(true); setCallStatus('Reconnecting...'); }
        else if (s === 'closed' && !endedRef.current) { setCallStatus('Ended'); setTimeout(onEndCall, 1000); }
      };

      pc.onconnectionstatechange = () => {
        if (!mounted) return;
        if (pc.connectionState === 'failed') setConnectionError('Connection failed. Check your network.');
      };

      // ── Step 3: Supabase Realtime BROADCAST channel ───────────────────────
      // Single channel used for ALL signaling — offer, answer, ICE, end
      const CH = `vc-${call.callId}`;
      const bcast = supabase.channel(CH, { config: { broadcast: { self: false, ack: false } } });
      channelsRef.current.push(bcast);

      // ICE: send via broadcast (instant)
      pc.onicecandidate = (e) => {
        if (!mounted || !e.candidate) return;
        bcast.send({ type: 'broadcast', event: 'ice', payload: { c: e.candidate.toJSON(), r: call.isCaller ? 0 : 1 } })
          .catch(() => {
            // Fallback: DB insert
            supabase.from('ice_candidates').insert({
              signal_id: call.callId, candidate: e.candidate!.toJSON(),
              role: call.isCaller ? 'caller' : 'receiver',
            }).catch(() => {});
          });
      };

      // ── CALLER FLOW ───────────────────────────────────────────────────────
      if (call.isCaller) {
        const uid = (await supabase.auth.getUser()).data.user?.id || '';

        // Create DB record (for receiver DB fallback)
        await supabase.from('call_signals').upsert({
          id: call.callId, caller_id: uid, receiver_id: call.contact.id,
          is_video: call.isVideo, status: 'calling',
        }, { onConflict: 'id' }).catch(() => {});

        // Create offer
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);

        // Save offer to DB (receiver fallback if they miss broadcast)
        await supabase.from('call_signals').update({
          offer: { sdp: offer.sdp, type: offer.type },
        }).eq('id', call.callId).catch(() => {});

        // Subscribe and broadcast offer
        bcast
          .on('broadcast', { event: 'answer' }, async ({ payload }) => {
            if (!mounted || pc.currentRemoteDescription) return;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              remoteDescSet.current = true;
              await drainPendingCandidates();
              setCallStatus('Connected');
              if (!callStartTime.current) callStartTime.current = Date.now();
            } catch (e) { console.error('[Caller] setRemoteDesc:', e); }
          })
          .on('broadcast', { event: 'ice' }, async ({ payload }) => {
            if (!mounted) return;
            if (payload.r === 1) await bufferOrAddCandidate(payload.c); // r=1 means receiver
          })
          .on('broadcast', { event: 'call-end' }, () => {
            if (!mounted) return;
            setCallStatus('Ended'); setTimeout(onEndCall, 1000);
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              // Broadcast offer immediately after subscribed
              await bcast.send({ type: 'broadcast', event: 'offer', payload: { sdp: { sdp: offer.sdp, type: offer.type } } });
            }
          });

        // DB fallback listener for answer (in case receiver missed broadcast)
        const dbFallback = supabase.channel(`dbf-${call.callId}`)
          .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'call_signals', filter: `id=eq.${call.callId}`,
          }, async (payload) => {
            if (!mounted) return;
            const d = payload.new as any;
            if (!pc.currentRemoteDescription && d.answer) {
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
                remoteDescSet.current = true;
                await drainPendingCandidates();
              } catch {}
            }
            if (d.status === 'ended' || d.status === 'rejected') { setCallStatus('Ended'); setTimeout(onEndCall, 1000); }
          })
          .subscribe();
        channelsRef.current.push(dbFallback);

        // Also listen for DB-saved ICE candidates (fallback)
        const iceFallback = supabase.channel(`icef-${call.callId}`)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'ice_candidates', filter: `signal_id=eq.${call.callId}`,
          }, async (payload) => {
            if (!mounted) return;
            const c = payload.new as any;
            if (c.role === 'receiver') await bufferOrAddCandidate(c.candidate);
          })
          .subscribe();
        channelsRef.current.push(iceFallback);

      } else {
        // ── RECEIVER FLOW ─────────────────────────────────────────────────
        setCallStatus('Connecting...');
        let offerSdp: any = null;
        let offerResolve: () => void;
        const offerReceived = new Promise<void>(res => { offerResolve = res; });

        bcast
          .on('broadcast', { event: 'offer' }, ({ payload }) => {
            if (mounted && !offerSdp) { offerSdp = payload.sdp; offerResolve(); }
          })
          .on('broadcast', { event: 'ice' }, async ({ payload }) => {
            if (!mounted) return;
            if (payload.r === 0) await bufferOrAddCandidate(payload.c); // r=0 means caller
          })
          .on('broadcast', { event: 'call-end' }, () => {
            if (!mounted) return;
            setCallStatus('Ended'); setTimeout(onEndCall, 1000);
          })
          .subscribe();

        // DB poll fallback — 200ms × 30 = 6s max (runs in parallel with broadcast wait)
        const pollDb = (async () => {
          for (let i = 0; i < 30 && mounted && !offerSdp; i++) {
            if (i > 0) await new Promise(r => setTimeout(r, 200));
            const { data } = await supabase.from('call_signals')
              .select('offer, status').eq('id', call.callId).single();
            if (data?.offer) { offerSdp = data.offer; offerResolve(); break; }
            if (data?.status === 'ended') {
              if (mounted) { setCallStatus('Missed'); setTimeout(onEndCall, 1500); }
              return;
            }
          }
        })();

        // Wait: whichever arrives first (broadcast wins — sub-100ms vs DB 200ms+)
        await Promise.race([offerReceived, pollDb, new Promise(r => setTimeout(r, 12000))]);

        if (!mounted) return;
        if (!offerSdp) {
          setCallStatus('Call Failed');
          setConnectionError('No call signal received. The caller may have cancelled.');
          return;
        }

        // Process offer → create answer
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
          remoteDescSet.current = true;
          await drainPendingCandidates();

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          // Broadcast answer instantly
          await bcast.send({ type: 'broadcast', event: 'answer', payload: { sdp: { sdp: answer.sdp, type: answer.type } } });

          // Also save to DB (caller fallback)
          await supabase.from('call_signals').update({
            answer: { type: answer.type, sdp: answer.sdp }, status: 'connected',
          }).eq('id', call.callId).catch(() => {});

          setCallStatus('Connecting...');
        } catch (err) {
          console.error('[Receiver] SDP error:', err);
          setCallStatus('Call Failed'); setConnectionError('Could not establish connection.');
          return;
        }

        // DB fallback: ICE from caller
        const iceFallback = supabase.channel(`icef2-${call.callId}`)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'ice_candidates', filter: `signal_id=eq.${call.callId}`,
          }, async (payload) => {
            if (!mounted) return;
            const c = payload.new as any;
            if (c.role === 'caller') await bufferOrAddCandidate(c.candidate);
          })
          .subscribe();
        channelsRef.current.push(iceFallback);
      }
    };

    run().catch(err => {
      console.error('[CallScreen] Fatal error:', err);
      if (mounted) { setCallStatus('Call Failed'); setConnectionError('Call could not start. ' + err?.message); }
    });

    return () => { mounted = false; cleanup(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Duration counter ────────────────────────────────────────────────────────
  useEffect(() => {
    if (callStatus !== 'Connected') return;
    const t = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, [callStatus]);

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ── Controls ────────────────────────────────────────────────────────────────
  const handleEnd = useCallback(async () => { await cleanup(true); onEndCall(); }, [cleanup, onEndCall]);

  const handleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = isMuted; }); // toggle
    setIsMuted(p => !p);
  };

  const handleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsCameraOn(p => !p);
  };

  const handleSpeaker = async () => {
    const next = !isSpeakerOn; setIsSpeakerOn(next);
    const el = remoteAudioRef.current;
    if (!el || !('setSinkId' in HTMLAudioElement.prototype)) return;
    try {
      if (next) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const sp = devices.find(d => d.kind === 'audiooutput' && d.label.toLowerCase().includes('speaker'));
        await (el as any).setSinkId(sp?.deviceId || '');
      } else { await (el as any).setSinkId('default'); }
    } catch {}
  };

  const handleAudioUnlock = async () => {
    const el = remoteAudioRef.current;
    if (!el) return;
    if (!el.srcObject && remoteStreamRef.current) el.srcObject = remoteStreamRef.current;
    try { await el.play(); setNeedsUnlock(false); } catch {}
  };

  const isConnected = callStatus === 'Connected';
  const isFailed = callStatus.includes('Failed') || callStatus === 'Ended';

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col items-center text-white overflow-hidden">

      {/* ── CRITICAL: Remote audio element ────────────────────────────────────
          Must NOT be display:none or visibility:hidden (browser kills audio engine).
          Use opacity:0 + position off-screen instead. Always mounted unconditionally.
      ─────────────────────────────────────────────────────────────────────────── */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{ position: 'fixed', bottom: 0, right: 0, width: '1px', height: '1px', opacity: 0.01 }}
      />

      {/* Tap to enable audio (autoplay blocked) */}
      {needsUnlock && (
        <button onClick={handleAudioUnlock}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-amber-500 text-white text-sm font-black px-5 py-3 rounded-2xl shadow-2xl animate-bounce">
          <Volume2 size={18} /> Tap to hear audio
        </button>
      )}

      {/* Background */}
      <div className="absolute inset-0 z-0">
        {call.isVideo ? (
          <div className="w-full h-full relative bg-slate-900">
            <video ref={remoteVideoRef} autoPlay playsInline
              className={`w-full h-full object-cover transition-opacity duration-500 ${remoteVideoReady ? 'opacity-100' : 'opacity-0'}`} />
            {!remoteVideoReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <img src={call.contact.avatarUrl} alt="" className="w-36 h-36 rounded-full object-cover opacity-40 blur-sm" referrerPolicy="no-referrer" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-transparent to-slate-950/80" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center relative">
            <div className="absolute inset-0 overflow-hidden">
              <img src={call.contact.avatarUrl} alt="" className="w-full h-full object-cover blur-[80px] opacity-25 scale-125" referrerPolicy="no-referrer" />
            </div>
            <div className="absolute inset-0 bg-slate-950/60" />
            {!isConnected && (
              <div className="relative">
                <div className="absolute w-72 h-72 -top-36 -left-36 border border-emerald-500/15 rounded-full animate-ping [animation-duration:2.5s]" />
                <div className="absolute w-96 h-96 -top-48 -left-48 border border-emerald-500/10 rounded-full animate-ping [animation-duration:3.5s]" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full w-full items-center px-6 pt-safe-top pb-safe-bottom">

        {/* Top bar */}
        <div className="w-full flex justify-between items-start pt-4">
          <CallQualityBadge pc={pcRef.current} />
          {call.isVideo && (
            <div className="w-28 h-44 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 relative">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              {!isCameraOn && (
                <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
                  <CameraOff size={18} className="text-white/40" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Contact info */}
        <div className="text-center">
          {!call.isVideo && (
            <div className="relative mb-8">
              <div className="absolute -inset-6 bg-emerald-500/15 rounded-full blur-3xl" />
              <img src={call.contact.avatarUrl} alt={call.contact.name}
                className="relative w-36 h-36 rounded-full border-4 border-white/10 mx-auto shadow-2xl object-cover" referrerPolicy="no-referrer" />
              {isConnected && (
                <div className="absolute bottom-1 right-1/2 translate-x-1/2 translate-y-1/2 bg-emerald-500 p-2 rounded-full border-4 border-slate-950">
                  <Wifi size={13} className="text-white" />
                </div>
              )}
            </div>
          )}
          <h2 className="text-4xl font-black tracking-tight drop-shadow-2xl mb-2">{call.contact.name}</h2>
          <div className={`inline-flex px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${isConnected ? 'bg-emerald-500 text-white' : isFailed ? 'bg-red-500 text-white' : isReconnecting ? 'bg-amber-500 text-white' : 'bg-white/10 text-white/70'}`}>
            {isConnected ? fmt(duration) : callStatus}
          </div>
          {isConnected && (
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <Shield size={10} className="text-emerald-400" />
              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">End-to-End Encrypted</p>
            </div>
          )}
          {isReconnecting && (
            <div className="flex items-center justify-center gap-2 mt-2 text-amber-400">
              <RotateCcw size={13} className="animate-spin" />
              <span className="text-xs font-bold">Reconnecting...</span>
            </div>
          )}
          {connectionError && <p className="text-xs text-red-400 mt-2 px-4 text-center">{connectionError}</p>}
        </div>

        <div className="flex-1" />

        {/* Controls */}
        <div className="w-full max-w-sm mb-8">
          <div className="flex items-center justify-center gap-4">

            {/* Mute */}
            <button onClick={handleMute}
              className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl ${isMuted ? 'bg-red-500 shadow-red-500/30' : 'bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10'}`}>
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>

            {/* Camera (video only) */}
            {call.isVideo && (
              <button onClick={handleCamera}
                className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl ${!isCameraOn ? 'bg-red-500 shadow-red-500/30' : 'bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10'}`}>
                {isCameraOn ? <Camera size={24} /> : <CameraOff size={24} />}
              </button>
            )}

            {/* Speaker */}
            <button onClick={handleSpeaker}
              className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl ${isSpeakerOn ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10'}`}>
              {isSpeakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
            </button>

            {/* End call */}
            <button onClick={handleEnd}
              className="w-20 h-20 bg-red-500 hover:bg-red-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-red-500/40 transition-all active:scale-90">
              <PhoneOff size={30} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
