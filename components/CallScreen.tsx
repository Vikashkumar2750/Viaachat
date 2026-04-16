
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

// ─── ICE / STUN / TURN configuration ─────────────────────────────────────────
const RTCConfig: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: ['turn:global.relay.metered.ca:80', 'turn:global.relay.metered.ca:80?transport=tcp', 'turn:global.relay.metered.ca:443', 'turns:global.relay.metered.ca:443'],
      username: 'e8dd65f0c0cb3ef15a1c5b7a',
      credential: 'uMBbPwdFroHpfDGS',
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

const log = (...args: any[]) => console.log('[VC]', ...args);

// ─── Safe supabase query wrapper ──────────────────────────────────────────────
const dbExec = async (q: any) => { try { return await q; } catch (e) { log('DB err:', e); return null; } };

// ─── Safe broadcast send ──────────────────────────────────────────────────────
const bcastSend = (ch: any, event: string, payload: any): Promise<void> =>
  new Promise(resolve => {
    try {
      const p = ch.send({ type: 'broadcast', event, payload });
      if (p?.then) p.then(() => resolve()).catch(() => resolve()); else resolve();
    } catch { resolve(); }
  });

// ─── Ring tone ────────────────────────────────────────────────────────────────
function useRingTone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ring = useCallback(() => {
    try {
      if (!ctxRef.current || ctxRef.current.state === 'closed') ctxRef.current = new AudioContext();
      const ctx = ctxRef.current; if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(480, ctx.currentTime); osc.frequency.setValueAtTime(420, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, []);
  useEffect(() => {
    if (!active) { if (timerRef.current) clearInterval(timerRef.current); ctxRef.current?.close().catch(() => {}); ctxRef.current = null; return; }
    ring(); timerRef.current = setInterval(ring, 2500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active, ring]);
}

// ─── Quality badge ────────────────────────────────────────────────────────────
const CallQualityBadge: React.FC<{ pc: RTCPeerConnection | null }> = ({ pc }) => {
  const [rtt, setRtt] = useState(0); const [quality, setQuality] = useState(3);
  useEffect(() => {
    const t = setInterval(async () => {
      if (!pc) return;
      try { const stats = await pc.getStats(); stats.forEach(r => { if (r.type === 'remote-inbound-rtp' && r.roundTripTime) { const ms = Math.round(r.roundTripTime * 1000); setRtt(ms); setQuality(ms < 120 ? 3 : ms < 300 ? 2 : 1); } }); } catch {}
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

// ─── MAIN CALL SCREEN ─────────────────────────────────────────────────────────
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
  const [debugInfo, setDebugInfo] = useState('');

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
    const el = remoteAudioRef.current; if (!el) return; el.volume = 1.0;
    try { await el.play(); setNeedsUnlock(false); log('Audio ▶️'); }
    catch { setNeedsUnlock(true); }
  }, []);

  // ── Attach remote stream ─────────────────────────────────────────────────────
  const attachRemoteStream = useCallback((stream: MediaStream) => {
    if (!stream) return;
    log('Attaching remote stream — tracks:', stream.getTracks().map(t => `${t.kind}[en=${t.enabled}]`).join(' '));
    remoteStreamRef.current = stream;
    stream.getTracks().forEach(t => { t.enabled = true; });
    const el = remoteAudioRef.current;
    if (el) { el.srcObject = stream; playAudio(); }
    if (call.isVideo) {
      const attach = () => {
        if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = stream; remoteVideoRef.current.play().catch(() => {}); setRemoteVideoReady(true); }
        else setTimeout(attach, 80);
      };
      attach();
    }
  }, [call.isVideo, playAudio]);

  // ── ICE candidate buffer (queued until remote desc is set) ───────────────────
  const drainPendingCandidates = useCallback(async () => {
    if (!pcRef.current || !pendingCandidates.current.length) return;
    const q = [...pendingCandidates.current]; pendingCandidates.current = [];
    log(`Draining ${q.length} buffered ICE candidates`);
    for (const c of q) { try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
  }, []);

  const addIceCandidateSafe = useCallback(async (c: RTCIceCandidateInit) => {
    if (!c?.candidate) return;
    if (remoteDescSet.current && pcRef.current) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); log('ICE ✅'); }
      catch (e) { log('ICE add err:', e); }
    } else {
      log('ICE buffered (no remote desc yet)');
      pendingCandidates.current.push(c);
    }
  }, []);

  // ── CRITICAL: Fetch ALL existing partner ICE candidates from DB ──────────────
  // ICE candidates sent to DB before our iceCh subscription completes are missed
  // by realtime. This ensures we always have the complete set.
  const fetchMissedIceCandidates = useCallback(async (partnerRole: string) => {
    log(`Fetching missed ICE candidates [${partnerRole}] from DB`);
    const { data } = await supabase
      .from('ice_candidates')
      .select('candidate')
      .eq('signal_id', call.callId)
      .eq('role', partnerRole)
      .order('created_at', { ascending: true });
    if (data?.length) {
      log(`Found ${data.length} ICE candidates in DB for role=${partnerRole}`);
      for (const row of data) { await addIceCandidateSafe(row.candidate); }
    }
  }, [call.callId, addIceCandidateSafe]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  const cleanup = useCallback(async (sendEnd = true) => {
    if (endedRef.current) return; endedRef.current = true;
    if (sendEnd) {
      const secs = callStartTime.current ? Math.floor((Date.now() - callStartTime.current) / 1000) : 0;
      channelsRef.current.forEach(ch => { try { bcastSend(ch, 'call-end', {}); } catch {} });
      await dbExec(supabase.from('call_signals').update({ status: 'ended' }).eq('id', call.callId));
      if (secs > 0) await dbExec(supabase.from('calls').update({ duration: secs }).eq('id', call.callId));
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    if (remoteAudioRef.current) { remoteAudioRef.current.pause(); remoteAudioRef.current.srcObject = null; }
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    channelsRef.current.forEach(ch => { try { supabase.removeChannel(ch); } catch {} });
    channelsRef.current = [];
  }, [call.callId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // SIGNALING FLOW:
  //
  // PRIMARY:  DB (call_signals + ice_candidates) + postgres_changes realtime
  // BONUS:    Supabase Broadcast (fast path, ~50ms bonus)
  //
  // KEY FIX (this version): After setting remote description (processOffer /
  //   caller receiving answer), we IMMEDIATELY fetch ALL existing partner ICE
  //   candidates from DB. This handles ICE candidates that arrived in the DB
  //   BEFORE our iceCh realtime subscription completed (typically 100–500ms after
  //   component mount). Without this, one peer connects while the other stays
  //   on "Connecting..." because early ICE candidates were lost.
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    const mounted = () => mountedRef.current;

    const run = async () => {
      // ── 1. Get mic (and optional camera) ─────────────────────────────────
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: call.isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
        });
        log('Media ✅ audio:', stream.getAudioTracks().length, 'video:', stream.getVideoTracks().length);
      } catch {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); log('Audio-only fallback'); }
        catch (e) {
          log('getUserMedia failed:', e);
          if (mounted()) { setCallStatus('Call Failed'); setConnectionError('Mic permission denied. Allow access and try again.'); }
          return;
        }
      }
      if (!mounted()) { stream.getTracks().forEach(t => t.stop()); return; }
      stream.getAudioTracks().forEach(t => { t.enabled = true; });
      localStreamRef.current = stream;
      if (localVideoRef.current) { localVideoRef.current.srcObject = stream; localVideoRef.current.play().catch(() => {}); }

      // ── 2. Create RTCPeerConnection ───────────────────────────────────────
      const pc = new RTCPeerConnection(RTCConfig);
      pcRef.current = pc;
      log('RTCPeerConnection created');
      stream.getTracks().forEach(t => { t.enabled = true; pc.addTrack(t, stream); });

      pc.ontrack = (ev) => {
        if (!mounted()) return;
        log('ontrack', ev.track.kind, 'muted:', ev.track.muted);
        let rs = ev.streams?.[0];
        if (!rs) {
          if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
          remoteStreamRef.current.addTrack(ev.track);
          rs = remoteStreamRef.current;
        }
        ev.track.enabled = true;
        // Unmute when track becomes active
        ev.track.onunmute = () => { ev.track.enabled = true; log('track unmuted'); };
        attachRemoteStream(rs);
        setCallStatus('Connected');
        if (!callStartTime.current) callStartTime.current = Date.now();
        setIsReconnecting(false); setConnectionError('');
      };

      pc.oniceconnectionstatechange = () => {
        if (!mounted()) return;
        const s = pc.iceConnectionState;
        log('ICE state →', s); setDebugInfo(`ICE: ${s}`);
        if (s === 'connected' || s === 'completed') {
          setCallStatus('Connected'); setIsReconnecting(false); setConnectionError('');
          if (!callStartTime.current) callStartTime.current = Date.now();
        } else if (s === 'failed') {
          setIsReconnecting(true); setCallStatus('Reconnecting...');
          log('ICE failed → restartIce');
          if (call.isCaller) pc.restartIce();
        } else if (s === 'disconnected') {
          setIsReconnecting(true); setCallStatus('Reconnecting...');
        } else if (s === 'closed' && !endedRef.current) {
          setCallStatus('Ended'); setTimeout(onEndCall, 1000);
        }
      };

      pc.onconnectionstatechange = () => {
        if (!mounted()) return;
        log('Conn state →', pc.connectionState);
        if (pc.connectionState === 'failed') setConnectionError('Connection failed. Check internet.');
      };

      // ── 3. ICE candidate roles ────────────────────────────────────────────
      const myRole = call.isCaller ? 'caller' : 'receiver';
      const partnerRole = call.isCaller ? 'receiver' : 'caller';

      pc.onicecandidate = async (e) => {
        if (!mounted() || !e.candidate) return;
        const cJson = e.candidate.toJSON();
        log(`ICE [${myRole}]:`, cJson.candidate?.substring(0, 50));
        // PRIMARY: DB
        await dbExec(supabase.from('ice_candidates').insert({ signal_id: call.callId, candidate: cJson, role: myRole }));
        // BONUS: broadcast
        channelsRef.current.forEach(ch => { bcastSend(ch, 'ice', { c: cJson, role: myRole }); });
      };

      // ── 4. Broadcast channel — ALL .on() BEFORE .subscribe() ─────────────
      const bcast = supabase.channel(`vc-${call.callId}`, { config: { broadcast: { self: false, ack: false } } });
      channelsRef.current.push(bcast);

      // ── 5. DB realtime listener: call_signals (offer/answer exchange) ─────
      const sigCh = supabase.channel(`sig-${call.callId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'call_signals', filter: `id=eq.${call.callId}`,
        }, async (payload) => {
          if (!mounted()) return;
          const row = payload.new as any;
          log('call_signals UPDATE → status:', row.status, 'offer:', !!row.offer, 'answer:', !!row.answer);
          if (row.status === 'ended' || row.status === 'rejected') {
            if (!endedRef.current) { setCallStatus('Ended'); setTimeout(onEndCall, 1000); } return;
          }
          // ── CALLER: incoming answer ──────────────────────────────────────
          if (call.isCaller && row.answer && !pc.currentRemoteDescription) {
            log('CALLER: answer via DB realtime');
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(row.answer));
              remoteDescSet.current = true;
              await drainPendingCandidates();
              // CRITICAL FIX: fetch ALL receiver ICE candidates already in DB
              await fetchMissedIceCandidates(partnerRole);
              setCallStatus('Connected');
              if (!callStartTime.current) callStartTime.current = Date.now();
            } catch (e) { log('setRemoteDesc(answer) err:', e); }
          }
          // ── RECEIVER: incoming offer ─────────────────────────────────────
          if (!call.isCaller && row.offer && !pc.currentRemoteDescription) {
            log('RECEIVER: offer via DB realtime');
            await processOffer(row.offer);
          }
        })
        .subscribe(s => { log('sigCh:', s); });
      channelsRef.current.push(sigCh);

      // ── 6. DB realtime listener: ice_candidates ───────────────────────────
      const iceCh = supabase.channel(`ice-${call.callId}-${myRole}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'ice_candidates', filter: `signal_id=eq.${call.callId}`,
        }, async (payload) => {
          if (!mounted()) return;
          const row = payload.new as any;
          if (row.role === partnerRole) {
            log(`ICE from DB [${row.role}]`);
            await addIceCandidateSafe(row.candidate);
          }
        })
        .subscribe(s => { log('iceCh:', s); });
      channelsRef.current.push(iceCh);

      // ── processOffer: set remote desc, create answer, send, fetch ICE ─────
      // NOTE: defined here (before bcast listeners) so closure captures properly
      const processOffer = async (offerSdp: any) => {
        if (!mounted() || pc.currentRemoteDescription) return;
        log('RECEIVER: processing offer');
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
          remoteDescSet.current = true;
          await drainPendingCandidates();

          // CRITICAL FIX: fetch ALL caller ICE candidates already in DB
          // Some arrive before our iceCh subscription completes and are MISSED
          // by postgres_changes. Without this, receiver ICE stays incomplete.
          await fetchMissedIceCandidates(partnerRole);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          log('Answer created');

          await dbExec(supabase.from('call_signals').update({
            answer: { type: answer.type, sdp: answer.sdp },
            status: 'connected',
          }).eq('id', call.callId));

          await bcastSend(bcast, 'answer', { sdp: { type: answer.type, sdp: answer.sdp } });

          setCallStatus('Connecting...'); // ICE will update to Connected
          log('Answer sent ✅');
        } catch (err) {
          log('processOffer err:', err);
          if (mounted()) { setCallStatus('Call Failed'); setConnectionError('Could not process call signal.'); }
        }
      };

      // ── 7. Broadcast listeners (ALL before .subscribe()) ─────────────────
      bcast.on('broadcast', { event: 'ice' }, async ({ payload }) => {
        if (!mounted() || payload.role !== partnerRole) return;
        log(`ICE via bcast [${payload.role}]`);
        await addIceCandidateSafe(payload.c);
      });

      bcast.on('broadcast', { event: 'call-end' }, () => {
        if (!mounted() || endedRef.current) return;
        setCallStatus('Ended'); setTimeout(onEndCall, 1000);
      });

      if (call.isCaller) {
        bcast.on('broadcast', { event: 'answer' }, async ({ payload }) => {
          if (!mounted() || pc.currentRemoteDescription) return;
          log('CALLER: answer via broadcast');
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSet.current = true;
            await drainPendingCandidates();
            // CRITICAL FIX: fetch missed ICE from DB
            await fetchMissedIceCandidates(partnerRole);
            setCallStatus('Connected');
            if (!callStartTime.current) callStartTime.current = Date.now();
          } catch (e) { log('Broadcast answer err:', e); }
        });
      } else {
        bcast.on('broadcast', { event: 'offer' }, async ({ payload }) => {
          if (!mounted() || pc.currentRemoteDescription) return;
          log('RECEIVER: offer via broadcast');
          await processOffer(payload.sdp);
        });
      }

      // Subscribe AFTER all .on() handlers are registered
      bcast.subscribe(s => { log('bcast:', s); });

      // ── 8. CALLER: create and send offer ──────────────────────────────────
      if (call.isCaller) {
        log('CALLER: creating offer');
        await dbExec(supabase.from('call_signals').update({ status: 'calling' }).eq('id', call.callId));

        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        log('Offer SDP ready');

        await dbExec(supabase.from('call_signals').update({ offer: { sdp: offer.sdp, type: offer.type } }).eq('id', call.callId));
        await bcastSend(bcast, 'offer', { sdp: { sdp: offer.sdp, type: offer.type } });
        log('CALLER: offer saved ✅');

      } else {
        // ── 9. RECEIVER: poll for offer ────────────────────────────────────
        log('RECEIVER: waiting for offer');
        setCallStatus('Connecting...');

        let gotOffer = false;
        for (let i = 0; i < 38 && mounted() && !gotOffer && !pc.currentRemoteDescription; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, 400));
          try {
            const { data } = await supabase.from('call_signals').select('offer, status').eq('id', call.callId).single();
            log(`Poll[${i}] status=${data?.status} offer=${!!data?.offer}`);
            if (data?.status === 'ended') { if (mounted()) { setCallStatus('Missed'); setTimeout(onEndCall, 1500); } return; }
            if (data?.offer && !pc.currentRemoteDescription) {
              gotOffer = true;
              log('RECEIVER: offer found in DB');
              await processOffer(data.offer);
            }
          } catch (e) { log('Poll err:', e); }
        }

        if (mounted() && !gotOffer && !pc.currentRemoteDescription) {
          setCallStatus('No Answer');
          setConnectionError('No call signal. Caller may have cancelled.');
        }
      }
    };

    run().catch(err => {
      log('Fatal:', err);
      if (mountedRef.current) { setCallStatus('Call Failed'); setConnectionError('Call could not start. Check mic access.'); }
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
      if (next) { const d = await navigator.mediaDevices.enumerateDevices(); const sp = d.find(x => x.kind === 'audiooutput' && x.label.toLowerCase().includes('speaker')); await (el as any).setSinkId(sp?.deviceId || ''); }
      else { await (el as any).setSinkId('default'); }
    } catch {}
  };
  const handleAudioUnlock = async () => {
    const el = remoteAudioRef.current; if (!el) return;
    if (!el.srcObject && remoteStreamRef.current) el.srcObject = remoteStreamRef.current;
    try { await el.play(); setNeedsUnlock(false); } catch {}
  };

  const isConnected = callStatus === 'Connected';
  const isFailed = callStatus.includes('Failed') || callStatus === 'Ended' || callStatus === 'Missed' || callStatus === 'No Answer';

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col items-center text-white overflow-hidden">

      {/* Remote audio — always in DOM, never display:none (kills audio engine) */}
      <audio ref={remoteAudioRef} autoPlay playsInline
        style={{ position: 'fixed', bottom: 0, right: 0, width: '1px', height: '1px', opacity: 0.01 }} />

      {/* Tap to unlock audio */}
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
      <div className="relative z-10 flex flex-col h-full w-full items-center px-6">

        {/* Top bar */}
        <div className="w-full flex justify-between items-start pt-4">
          <CallQualityBadge pc={pcRef.current} />
          {call.isVideo && (
            <div className="w-28 h-44 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 relative">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              {!isCameraOn && <div className="absolute inset-0 bg-slate-800 flex items-center justify-center"><CameraOff size={18} className="text-white/40" /></div>}
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
              {isConnected && <div className="absolute bottom-1 right-1/2 translate-x-1/2 translate-y-1/2 bg-emerald-500 p-2 rounded-full border-4 border-slate-950"><Wifi size={13} /></div>}
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
              <RotateCcw size={13} className="animate-spin" /><span className="text-xs font-bold">Reconnecting...</span>
            </div>
          )}
          {connectionError && <p className="text-xs text-red-400 mt-2 px-4 text-center">{connectionError}</p>}
          {debugInfo && !isConnected && <p className="text-[9px] text-white/20 mt-1">{debugInfo}</p>}
        </div>

        <div className="flex-1" />

        {/* Controls */}
        <div className="w-full max-w-sm mb-8">
          <div className="flex items-center justify-center gap-4">
            <button onClick={handleMute}
              className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl ${isMuted ? 'bg-red-500 shadow-red-500/30' : 'bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10'}`}>
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            {call.isVideo && (
              <button onClick={handleCamera}
                className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl ${!isCameraOn ? 'bg-red-500 shadow-red-500/30' : 'bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10'}`}>
                {isCameraOn ? <Camera size={24} /> : <CameraOff size={24} />}
              </button>
            )}
            <button onClick={handleSpeaker}
              className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl ${isSpeakerOn ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10'}`}>
              {isSpeakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
            </button>
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
