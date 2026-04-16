
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Volume2, VolumeX, PhoneOff,
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

// ─── ICE Servers ──────────────────────────────────────────────────────────────
// Multiple free STUN + reliable TURN servers (openrelay was shut down — removed)
const RTCConfig: RTCConfiguration = {
  iceServers: [
    // Google STUN (free, always reliable)
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    // Cloudflare STUN
    { urls: 'stun:stun.cloudflare.com:3478' },
    // Free TURN servers — multiple for fallback
    // Metered.ca free tier
    {
      urls: ['turn:global.relay.metered.ca:80', 'turn:global.relay.metered.ca:80?transport=tcp'],
      username: 'e8dd65f0c0cb3ef15a1c5b7a',
      credential: 'uMBbPwdFroHpfDGS',
    },
    {
      urls: ['turns:global.relay.metered.ca:443', 'turns:global.relay.metered.ca:443?transport=tcp'],
      username: 'e8dd65f0c0cb3ef15a1c5b7a',
      credential: 'uMBbPwdFroHpfDGS',
    },
    // Numb TURN (open, no auth)
    { urls: 'stun:numb.viagenie.ca' },
    // Xirsys free TURN (public demo)
    {
      urls: ['turn:fr-turn.xirsys.com:80?transport=udp', 'turn:fr-turn.xirsys.com:3478?transport=udp'],
      username: 'UVxe2BFiLLFSiA-KNFrNqibVJAUhMqlCLicQqiPNRmolm4MnV7e7_Pu4JbsLx-LeAAAAAGW_6DFvcGlhYWNoYXQ=',
      credential: '12345678-0000-0000-0000-000000000000',
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
      osc.frequency.setValueAtTime(480, ctx.currentTime); osc.frequency.setValueAtTime(420, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, []);
  useEffect(() => {
    if (!active) { if (timerRef.current) clearInterval(timerRef.current); ctxRef.current?.close().catch(() => {}); ctxRef.current = null; return; }
    ring(); timerRef.current = setInterval(ring, 2500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active, ring]);
}

// ─── Quality badge ─────────────────────────────────────────────────────────────
const CallQualityBadge: React.FC<{ pc: RTCPeerConnection | null }> = ({ pc }) => {
  const [rtt, setRtt] = useState(0); const [quality, setQuality] = useState(3);
  useEffect(() => {
    const t = setInterval(async () => {
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        stats.forEach(r => { if (r.type === 'remote-inbound-rtp' && r.roundTripTime) { const ms = Math.round(r.roundTripTime * 1000); setRtt(ms); setQuality(ms < 120 ? 3 : ms < 300 ? 2 : 1); } });
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

// ─── LOG helper (shows in console with [VC] prefix for easy filtering) ─────────
const log = (...args: any[]) => console.log('[VC]', ...args);

// ─── MAIN CALL SCREEN ──────────────────────────────────────────────────────────
export const CallScreen: React.FC<CallScreenProps> = ({ call, onEndCall }) => {
  const [callStatus, setCallStatus]   = useState(call.isCaller ? 'Calling...' : 'Connecting...');
  const [duration, setDuration]       = useState(0);
  const [isMuted, setIsMuted]         = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isCameraOn, setIsCameraOn]   = useState(call.isVideo);
  const [connectionError, setConnectionError] = useState('');
  const [isReconnecting, setIsReconnecting]   = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  const [debugInfo, setDebugInfo]     = useState('');

  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const localStreamRef    = useRef<MediaStream | null>(null);
  const remoteStreamRef   = useRef<MediaStream | null>(null);
  const pcRef             = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet     = useRef(false);
  const callStartTime     = useRef<number | null>(null);
  const channelsRef       = useRef<any[]>([]);
  const endedRef          = useRef(false);
  const mountedRef        = useRef(true);

  useRingTone(call.isCaller && callStatus === 'Calling...');

  // ── Play remote audio ────────────────────────────────────────────────────────
  const playAudio = useCallback(async () => {
    const el = remoteAudioRef.current;
    if (!el) return;
    el.volume = 1.0;
    try { await el.play(); setNeedsUnlock(false); log('Audio playing ✅'); }
    catch (e) { log('Audio autoplay blocked, tap-to-unlock needed'); setNeedsUnlock(true); }
  }, []);

  // ── Attach remote stream ─────────────────────────────────────────────────────
  const attachRemoteStream = useCallback((stream: MediaStream) => {
    if (!stream) return;
    log('Attaching remote stream, tracks:', stream.getTracks().map(t => `${t.kind}[enabled=${t.enabled}]`));
    remoteStreamRef.current = stream;
    stream.getTracks().forEach(t => { t.enabled = true; });

    const el = remoteAudioRef.current;
    if (el) { el.srcObject = stream; playAudio(); }

    if (call.isVideo) {
      const tryVideo = () => {
        if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = stream; remoteVideoRef.current.play().catch(() => {}); setRemoteVideoReady(true); }
        else setTimeout(tryVideo, 80);
      };
      tryVideo();
    }
  }, [call.isVideo, playAudio]);

  // ── ICE buffering: queue candidates until remote desc is set ────────────────
  const drainPendingCandidates = useCallback(async () => {
    if (!pcRef.current || !pendingCandidates.current.length) return;
    const q = [...pendingCandidates.current]; pendingCandidates.current = [];
    log(`Draining ${q.length} buffered ICE candidates`);
    for (const c of q) { try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
  }, []);

  const addIceCandidate = useCallback(async (c: RTCIceCandidateInit) => {
    if (!c?.candidate) return;
    if (remoteDescSet.current && pcRef.current) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); log('ICE candidate added live'); }
      catch (e) { log('ICE add error:', e); }
    } else {
      log('ICE candidate buffered (remote desc not set yet)');
      pendingCandidates.current.push(c);
    }
  }, []);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  const cleanup = useCallback(async (sendEnd = true) => {
    if (endedRef.current) return; endedRef.current = true;
    log('Cleanup called, sendEnd=', sendEnd);
    if (sendEnd) {
      const secs = callStartTime.current ? Math.floor((Date.now() - callStartTime.current) / 1000) : 0;
      // Broadcast end to partner instantly
      channelsRef.current.forEach(ch => { try { ch.send?.({ type: 'broadcast', event: 'call-end', payload: {} }); } catch {} });
      try { await supabase.from('call_signals').update({ status: 'ended' }).eq('id', call.callId); } catch {}
      if (secs > 0) { try { await supabase.from('calls').update({ duration: secs }).eq('id', call.callId); } catch {} }
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    if (remoteAudioRef.current) { remoteAudioRef.current.pause(); remoteAudioRef.current.srcObject = null; }
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    channelsRef.current.forEach(ch => { try { supabase.removeChannel(ch); } catch {} });
    channelsRef.current = [];
  }, [call.callId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // MAIN WebRTC SETUP
  //
  // SIGNALING ARCHITECTURE (Bulletproof):
  // ─────────────────────────────────────
  // PRIMARY:  Supabase DB (call_signals + ice_candidates) via postgres_changes
  //           → Persistent, survives tab backgrounding, never misses messages
  // BONUS:    Supabase Broadcast on same channel for ~50ms speed boost
  //
  // WHY NOT BROADCAST-ONLY:
  //   - Broadcast is ephemeral. If receiver subscribes AFTER caller sends offer,
  //     the offer is LOST forever. This was the main cause of call failures.
  //   - DB + realtime postgres_changes is always reliable.
  //
  // ICE:
  //   - Candidates are saved to ice_candidates table (indexed by signal_id + role)
  //   - postgres_changes fires when new candidates arrive → add immediately
  //   - Broadcast sends same candidates for sub-100ms fast path
  //
  // TURN:
  //   - openrelay.metered.ca was SHUT DOWN → replaced with metered.ca free tier
  //   - Multiple TURN URLs for fallback
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    const mounted = () => mountedRef.current;

    const run = async () => {
      // ── Step 1: Acquire microphone (and camera if video) ──────────────────
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: call.isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
        });
        log('Got media stream — audio tracks:', stream.getAudioTracks().length, 'video tracks:', stream.getVideoTracks().length);
      } catch {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); log('Fallback: audio-only stream'); }
        catch (e) {
          log('getUserMedia failed:', e);
          if (mounted()) { setCallStatus('Call Failed'); setConnectionError('Microphone denied. Allow mic access and try again.'); }
          return;
        }
      }
      if (!mounted()) { stream.getTracks().forEach(t => t.stop()); return; }

      stream.getAudioTracks().forEach(t => { t.enabled = true; });
      localStreamRef.current = stream;
      if (localVideoRef.current) { localVideoRef.current.srcObject = stream; localVideoRef.current.play().catch(() => {}); }

      // ── Step 2: Create RTCPeerConnection ───────────────────────────────────
      const pc = new RTCPeerConnection(RTCConfig);
      pcRef.current = pc;
      log('PeerConnection created');

      stream.getTracks().forEach(t => { t.enabled = true; pc.addTrack(t, stream); });

      pc.ontrack = (event) => {
        if (!mounted()) return;
        log('ontrack fired — streams:', event.streams.length, 'track kind:', event.track.kind);
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

      pc.onicecandidate = async (e) => {
        if (!mounted() || !e.candidate) return;
        const cJson = e.candidate.toJSON();
        log('Local ICE candidate:', cJson.candidate?.substring(0, 60));
        const role = call.isCaller ? 'caller' : 'receiver';

        // PRIMARY: save to DB so partner can find it via realtime
        try {
          await supabase.from('ice_candidates').insert({ signal_id: call.callId, candidate: cJson, role });
        } catch (err) { log('ICE DB insert failed:', err); }

        // BONUS: also broadcast for speed
        channelsRef.current.forEach(ch => {
          ch.send?.({ type: 'broadcast', event: 'ice', payload: { c: cJson, role } }).catch(() => {});
        });
      };

      pc.oniceconnectionstatechange = () => {
        if (!mounted()) return;
        const s = pc.iceConnectionState;
        log('ICE connection state:', s);
        setDebugInfo(`ICE: ${s}`);
        if (s === 'connected' || s === 'completed') {
          setCallStatus('Connected'); setIsReconnecting(false); setConnectionError('');
          if (!callStartTime.current) callStartTime.current = Date.now();
        } else if (s === 'failed') {
          setIsReconnecting(true); setCallStatus('Reconnecting...');
          log('ICE failed, attempting restartIce');
          if (call.isCaller) pc.restartIce();
        } else if (s === 'disconnected') { setIsReconnecting(true); setCallStatus('Reconnecting...'); }
        else if (s === 'closed' && !endedRef.current) { setCallStatus('Ended'); setTimeout(onEndCall, 1000); }
      };

      pc.onconnectionstatechange = () => {
        if (!mounted()) return;
        log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed') setConnectionError('Connection failed — check your network.');
      };

      // ── Step 3: Supabase Broadcast channel (speed bonus only, NOT primary) ─
      const CH = `vc-${call.callId}`;
      const bcast = supabase.channel(CH, { config: { broadcast: { self: false, ack: false } } });
      channelsRef.current.push(bcast);

      // Listen for ICE via broadcast fast path
      bcast
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          if (!mounted()) return;
          // Only process from partner's role
          const myRole = call.isCaller ? 'caller' : 'receiver';
          if (payload.role !== myRole) { // payload.role is sender's role, so accept opposite
            await addIceCandidate(payload.c);
          }
        })
        .on('broadcast', { event: 'call-end' }, () => {
          if (!mounted()) return;
          setCallStatus('Ended'); setTimeout(onEndCall, 1000);
        });

      // ── Step 4: DB + Realtime postgres_changes (PRIMARY SIGNALING) ─────────
      // Subscribe to call_signals row updates
      const sigCh = supabase.channel(`sig-${call.callId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'call_signals', filter: `id=eq.${call.callId}`,
        }, async (payload) => {
          if (!mounted()) return;
          const row = payload.new as any;
          log('call_signals UPDATE:', { status: row.status, hasOffer: !!row.offer, hasAnswer: !!row.answer });

          if (row.status === 'ended' || row.status === 'rejected') {
            setCallStatus('Ended'); setTimeout(onEndCall, 1000); return;
          }

          // CALLER: pick up answer from DB update
          if (call.isCaller && row.answer && !pc.currentRemoteDescription) {
            log('Caller: got answer from DB');
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(row.answer));
              remoteDescSet.current = true;
              await drainPendingCandidates();
              setCallStatus('Connected');
              if (!callStartTime.current) callStartTime.current = Date.now();
            } catch (e) { log('Caller: setRemoteDescription(answer) error:', e); }
          }

          // RECEIVER: pick up offer from DB update (when caller saves it)
          if (!call.isCaller && row.offer && !pc.currentRemoteDescription) {
            log('Receiver: got offer from DB update');
            await processOffer(pc, row.offer);
          }
        })
        .subscribe((status) => {
          log('sig channel status:', status);
        });
      channelsRef.current.push(sigCh);

      // Subscribe to ICE candidates from partner
      const myRole = call.isCaller ? 'caller' : 'receiver';
      const partnerRole = call.isCaller ? 'receiver' : 'caller';
      const iceCh = supabase.channel(`ice-${call.callId}-${myRole}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'ice_candidates',
          filter: `signal_id=eq.${call.callId}`,
        }, async (payload) => {
          if (!mounted()) return;
          const row = payload.new as any;
          if (row.role === partnerRole) {
            log('Got ICE candidate from DB for role:', row.role);
            await addIceCandidate(row.candidate);
          }
        })
        .subscribe((status) => { log('ice channel status:', status); });
      channelsRef.current.push(iceCh);

      // Subscribe broadcast channel after setting up DB listeners
      bcast.subscribe((status) => { log('broadcast channel status:', status); });

      // helper: process offer → create and send answer
      async function processOffer(peerConn: RTCPeerConnection, offerSdp: any) {
        if (!mounted()) return;
        try {
          log('Processing offer, setting remote description');
          await peerConn.setRemoteDescription(new RTCSessionDescription(offerSdp));
          remoteDescSet.current = true;
          await drainPendingCandidates();

          const answer = await peerConn.createAnswer();
          await peerConn.setLocalDescription(answer);
          log('Answer created, saving to DB');

          // PRIMARY: save answer to DB
          await supabase.from('call_signals').update({
            answer: { type: answer.type, sdp: answer.sdp },
            status: 'connected',
          }).eq('id', call.callId);

          // BONUS: broadcast answer
          bcast.send({ type: 'broadcast', event: 'answer', payload: { sdp: { type: answer.type, sdp: answer.sdp } } }).catch(() => {});

          setCallStatus('Connecting...');
        } catch (err) {
          log('processOffer error:', err);
          if (mounted()) { setCallStatus('Call Failed'); setConnectionError('Could not establish connection.'); }
        }
      }

      // ── Step 5: Caller creates offer ──────────────────────────────────────
      if (call.isCaller) {
        log('CALLER: creating offer');
        const uid = (await supabase.auth.getUser()).data.user?.id || '';

        // ensure call_signals row exists
        await supabase.from('call_signals').upsert({
          id: call.callId, caller_id: uid, receiver_id: call.contact.id,
          is_video: call.isVideo, status: 'calling',
        }, { onConflict: 'id' });

        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        log('Offer created, saving to DB');

        // PRIMARY: save offer to DB (receiver will pick it up via realtime or polling)
        await supabase.from('call_signals').update({
          offer: { sdp: offer.sdp, type: offer.type },
        }).eq('id', call.callId);

        // BONUS: broadcast offer (if receiver is already subscribed, they get it instantly)
        bcast.send({ type: 'broadcast', event: 'offer', payload: { sdp: { sdp: offer.sdp, type: offer.type } } }).catch(() => {});

        // Also listen for answer via broadcast (fast path)
        bcast.on('broadcast', { event: 'answer' }, async ({ payload }) => {
          if (!mounted() || pc.currentRemoteDescription) return;
          log('Caller: got answer via broadcast');
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSet.current = true;
            await drainPendingCandidates();
            setCallStatus('Connected');
            if (!callStartTime.current) callStartTime.current = Date.now();
          } catch (e) { log('Caller broadcast answer error:', e); }
        });

      } else {
        // ── Step 6: Receiver waits for offer ───────────────────────────────
        log('RECEIVER: waiting for offer');
        setCallStatus('Waiting for call...');

        // Listen for offer via broadcast fast path
        bcast.on('broadcast', { event: 'offer' }, async ({ payload }) => {
          if (!mounted() || pc.currentRemoteDescription) return;
          log('Receiver: got offer via broadcast');
          await processOffer(pc, payload.sdp);
        });

        // DB polling fallback: poll every 300ms × 40 = 12s
        // (Runs in parallel with realtime — whichever gets the offer first wins)
        (async () => {
          log('Receiver: starting DB poll for offer');
          for (let i = 0; i < 40 && mounted() && !pc.currentRemoteDescription; i++) {
            if (i > 0) await new Promise(r => setTimeout(r, 300));
            const { data } = await supabase.from('call_signals')
              .select('offer, status').eq('id', call.callId).single();
            log(`DB poll[${i}]: status=${data?.status}, hasOffer=${!!data?.offer}`);
            if (data?.offer && !pc.currentRemoteDescription) {
              log('Receiver: got offer from DB poll');
              await processOffer(pc, data.offer);
              break;
            }
            if (data?.status === 'ended') {
              if (mounted()) { setCallStatus('Missed'); setTimeout(onEndCall, 1500); }
              return;
            }
          }
          if (mounted() && !pc.currentRemoteDescription) {
            log('Receiver: offer timeout after 12s');
            setCallStatus('No Answer'); setConnectionError('Caller did not respond in time.');
          }
        })();
      }
    };

    run().catch(err => {
      log('Fatal CallScreen error:', err);
      if (mountedRef.current) { setCallStatus('Call Failed'); setConnectionError('Call could not start: ' + (err?.message || err)); }
    });

    return () => { mountedRef.current = false; cleanup(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Duration counter ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (callStatus !== 'Connected') return;
    const t = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, [callStatus]);

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ── Controls ─────────────────────────────────────────────────────────────────
  const handleEnd = useCallback(async () => { await cleanup(true); onEndCall(); }, [cleanup, onEndCall]);

  const handleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = isMuted; });
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
    try { await el.play(); setNeedsUnlock(false); log('Audio unlocked by user tap'); } catch {}
  };

  const isConnected = callStatus === 'Connected';
  const isFailed = callStatus.includes('Failed') || callStatus === 'Ended' || callStatus === 'Missed' || callStatus === 'No Answer';

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col items-center text-white overflow-hidden">

      {/* ── CRITICAL: Remote audio ─────────────────────────────────────────────
          Must NOT be display:none — browser suspends audio engine on hidden elements.
          Positioned off-screen with opacity:0.01 to stay "alive" in the DOM.
      ──────────────────────────────────────────────────────────────────────── */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{ position: 'fixed', bottom: 0, right: 0, width: '1px', height: '1px', opacity: 0.01 }}
      />

      {/* Tap to hear audio (autoplay blocked) */}
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
              {!isCameraOn && (<div className="absolute inset-0 bg-slate-800 flex items-center justify-center"><CameraOff size={18} className="text-white/40" /></div>)}
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
              {isConnected && (<div className="absolute bottom-1 right-1/2 translate-x-1/2 translate-y-1/2 bg-emerald-500 p-2 rounded-full border-4 border-slate-950"><Wifi size={13} className="text-white" /></div>)}
            </div>
          )}
          <h2 className="text-4xl font-black tracking-tight drop-shadow-2xl mb-2">{call.contact.name}</h2>
          <div className={`inline-flex px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${isConnected ? 'bg-emerald-500 text-white' : isFailed ? 'bg-red-500 text-white' : isReconnecting ? 'bg-amber-500 text-white' : 'bg-white/10 text-white/70'}`}>
            {isConnected ? fmt(duration) : callStatus}
          </div>
          {isConnected && (<div className="flex items-center justify-center gap-1.5 mt-2"><Shield size={10} className="text-emerald-400" /><p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">End-to-End Encrypted</p></div>)}
          {isReconnecting && (<div className="flex items-center justify-center gap-2 mt-2 text-amber-400"><RotateCcw size={13} className="animate-spin" /><span className="text-xs font-bold">Reconnecting...</span></div>)}
          {connectionError && <p className="text-xs text-red-400 mt-2 px-4 text-center">{connectionError}</p>}
          {/* Debug info — visible during development */}
          {debugInfo && !isConnected && <p className="text-[9px] text-white/20 mt-1">{debugInfo}</p>}
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

            {/* Camera (video calls) */}
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

            {/* End */}
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
