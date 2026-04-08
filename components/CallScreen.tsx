
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

// ─── Multiple free TURN servers for redundancy ───────────────────────────────
const RTCServers: RTCConfiguration = {
  iceServers: [
    // Google STUN (most reliable, no auth needed)
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302', 'stun:stun4.l.google.com:19302'] },
    // Open Relay Project (free TURN)
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
    // Metered.ca free STUN
    { urls: 'stun:stun.relay.metered.ca:80' },
    // Twilio-style free STUN
    { urls: ['stun:global.stun.twilio.com:3478'] },
  ],
  iceCandidatePoolSize: 16,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

// ─── Call Quality Monitor ────────────────────────────────────────────────────
const CallQuality: React.FC<{ pc: RTCPeerConnection | null }> = ({ pc }) => {
  const [quality, setQuality] = useState(3);
  const [latency, setLatency] = useState(0);
  const [packetLoss, setPacketLoss] = useState(0);

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
            setPacketLoss(loss);
            setQuality(rtt < 100 && loss < 5 ? 3 : rtt < 300 && loss < 15 ? 2 : 1);
          }
        });
      } catch {
        // ignore stats errors
      }
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
      {packetLoss > 0 && (
        <>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-1.5 text-amber-400">
            <span>{packetLoss}% loss</span>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Ring tone using Web Audio API ──────────────────────────────────────────
function useRingTone(active: boolean) {
  const contextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playRing = useCallback(() => {
    try {
      if (!contextRef.current || contextRef.current.state === 'closed') {
        contextRef.current = new AudioContext();
      }
      const ctx = contextRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(480, ctx.currentTime);
      oscillator.frequency.setValueAtTime(440, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch {
      // Audio context not supported
    }
  }, []);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Close context when ring stops to avoid the "closed context" warning
      if (contextRef.current) {
        contextRef.current.close().catch(() => {});
        contextRef.current = null;
      }
      return;
    }
    playRing();
    intervalRef.current = setInterval(playRing, 2500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, playRing]);

  return { stop: () => { if (intervalRef.current) clearInterval(intervalRef.current); } };
}

// ─── MAIN CALL SCREEN ────────────────────────────────────────────────────────
export const CallScreen: React.FC<CallScreenProps> = ({ call, onEndCall }) => {
  const [callStatus, setCallStatus] = useState<string>(call.isCaller ? 'Calling...' : 'Connecting...');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(call.isVideo);
  const [connectionError, setConnectionError] = useState('');
  const [isReconnecting, setIsReconnecting] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  // ── KEY FIX: Dedicated audio element always rendered ─────────────────────────
  // For voice calls, remoteVideoRef is NOT in the DOM, so we need a separate
  // <audio> element that is always mounted to play remote audio.
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet = useRef(false);
  const callStartTime = useRef<number | null>(null);
  const channelsRef = useRef<any[]>([]);
  const endedRef = useRef(false);

  useRingTone(call.isCaller && callStatus === 'Calling...');

  const cleanupChanel = useCallback((channel: any) => {
    try { supabase.removeChannel(channel); } catch {}
  }, []);

  const applyPendingCandidates = useCallback(async () => {
    if (!pcRef.current || pendingCandidates.current.length === 0) return;
    const toApply = [...pendingCandidates.current];
    pendingCandidates.current = [];
    for (const candidate of toApply) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {}
    }
  }, []);

  const addOrBufferCandidate = useCallback(async (candidateData: RTCIceCandidateInit) => {
    if (remoteDescSet.current && pcRef.current) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidateData));
      } catch {}
    } else {
      pendingCandidates.current.push(candidateData);
    }
  }, []);

  const endCallCleanup = useCallback(async (updateStatus = true) => {
    if (endedRef.current) return;
    endedRef.current = true;

    // Record duration
    if (callStartTime.current) {
      const secs = Math.floor((Date.now() - callStartTime.current) / 1000);
      try {
        await supabase.from('calls').update({ duration: secs, type: secs > 0 ? 'incoming' : 'missed' })
          .eq('id', call.callId);
      } catch {}
    }

    // Update signaling
    if (updateStatus) {
      try {
        await supabase.from('call_signals').update({ status: 'ended' }).eq('id', call.callId);
      } catch {}
    }

    // Stop media
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    // Silence the remote audio element
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    // Close peer connection
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;

    // Remove all channels
    channelsRef.current.forEach(ch => cleanupChanel(ch));
    channelsRef.current = [];
  }, [call.callId, cleanupChanel]);

  useEffect(() => {
    let mounted = true;

    const startCall = async () => {
      if (!mounted) return;
      try {
        // Get user media
        const constraints: MediaStreamConstraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: call.isVideo ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            facingMode: 'user',
          } : false,
        };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
          // Fallback: try audio only
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch {
            stream = new MediaStream();
          }
        }

        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Create peer connection
        const pc = new RTCPeerConnection(RTCServers);
        pcRef.current = pc;

        // Add tracks
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        // ── KEY FIX: ontrack handler ───────────────────────────────────────────
        // For VOICE calls: remoteVideoRef.current is NULL (video element not rendered)
        // We must always use remoteAudioRef for audio output.
        // For VIDEO calls: also connect to the video element.
        pc.ontrack = (event) => {
          const remoteStream = event.streams[0];
          if (!remoteStream) return;

          // Always attach to the hidden audio element — ensures audio plays
          // for BOTH voice and video calls
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(() => {});
          }

          // Also attach to video element for video calls
          if (call.isVideo && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }

          setCallStatus('Connected');
          if (!callStartTime.current) callStartTime.current = Date.now();
          setIsReconnecting(false);
          setConnectionError('');
        };

        // ICE connection state monitoring
        pc.oniceconnectionstatechange = () => {
          if (!mounted) return;
          const state = pc.iceConnectionState;
          if (state === 'connected' || state === 'completed') {
            setCallStatus('Connected');
            if (!callStartTime.current) callStartTime.current = Date.now();
            setIsReconnecting(false);
            setConnectionError('');
          } else if (state === 'failed') {
            setIsReconnecting(true);
            setCallStatus('Reconnecting...');
            // Try ICE restart
            if (call.isCaller) {
              pc.restartIce();
            }
          } else if (state === 'disconnected') {
            setCallStatus('Reconnecting...');
            setIsReconnecting(true);
          } else if (state === 'closed') {
            if (!endedRef.current) {
              setCallStatus('Ended');
              setTimeout(onEndCall, 1000);
            }
          }
        };

        pc.onconnectionstatechange = () => {
          if (!mounted) return;
          if (pc.connectionState === 'failed') {
            setConnectionError('Connection failed. Poor network conditions.');
          }
        };

        // ICE candidates → Supabase
        pc.onicecandidate = async (event) => {
          if (!mounted) return;
          if (event.candidate) {
            try {
              await supabase.from('ice_candidates').insert({
                signal_id: call.callId,
                candidate: event.candidate.toJSON(),
                role: call.isCaller ? 'caller' : 'receiver',
              });
            } catch {}
          }
        };

        if (call.isCaller) {
          // ── CALLER FLOW ──────────────────────────────────────────────────
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
            offerToReceiveVideo: call.isVideo,
          });
          if (!mounted) return;
          await pc.setLocalDescription(offerDesc);

          // Push offer to DB
          await supabase.from('call_signals').update({
            offer: { sdp: offerDesc.sdp, type: offerDesc.type },
          }).eq('id', call.callId);

          // Listen for answer
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
                } catch {}
              }
              if (data.status === 'connected') {
                setCallStatus('Connected');
                if (!callStartTime.current) callStartTime.current = Date.now();
              }
              if (data.status === 'ended' || data.status === 'rejected') {
                setCallStatus('Ended');
                setTimeout(onEndCall, 1200);
              }
            })
            .subscribe();
          channelsRef.current.push(answerCh);

          // Listen for receiver's ICE candidates
          const iceCh = supabase
            .channel(`ice-receiver-${call.callId}`)
            .on('postgres_changes', {
              event: 'INSERT',
              schema: 'public',
              table: 'ice_candidates',
              filter: `signal_id=eq.${call.callId}`,
            }, async (payload) => {
              if (!mounted) return;
              const c = payload.new as any;
              if (c.role === 'receiver') {
                await addOrBufferCandidate(c.candidate);
              }
            })
            .subscribe();
          channelsRef.current.push(iceCh);

        } else {
          // ── RECEIVER FLOW ────────────────────────────────────────────────
          // ── KEY FIX: Increase polling retries from 5×800ms (4s) to 15×1500ms (22.5s)
          // The caller often takes >4s: microphone permission dialog + SDP creation
          setCallStatus('Waiting for call signal...');

          let signalData: any = null;

          // Subscribe to realtime updates FIRST so we don't miss the offer
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
              if (incoming.offer && !signalData) {
                signalData = incoming;
              }
            })
            .subscribe();
          channelsRef.current.push(offerWaitCh);

          // Poll alongside realtime subscription (belt-and-suspenders)
          for (let attempt = 0; attempt < 15; attempt++) {
            if (!mounted) return;
            if (signalData) break; // realtime already got it
            const { data } = await supabase
              .from('call_signals')
              .select('offer, status')
              .eq('id', call.callId)
              .single();
            if (data?.offer) { signalData = data; break; }
            if (data?.status === 'ended') {
              setCallStatus('Missed Call');
              setTimeout(onEndCall, 1500);
              return;
            }
            await new Promise(r => setTimeout(r, 1500));
          }

          if (!mounted) return;

          if (!signalData?.offer) {
            setCallStatus('Call Failed');
            setConnectionError('Could not fetch call signal. Caller may have cancelled.');
            return;
          }

          setCallStatus('Connecting...');

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

            setCallStatus('Ringing...');
          } catch (err) {
            setCallStatus('Call Failed');
            setConnectionError('Could not establish connection.');
            return;
          }

          // Watch for ended signal
          const statusCh = supabase
            .channel(`signal-status-${call.callId}`)
            .on('postgres_changes', {
              event: 'UPDATE',
              schema: 'public',
              table: 'call_signals',
              filter: `id=eq.${call.callId}`,
            }, (payload) => {
              if (!mounted) return;
              const data = payload.new as any;
              if (data.status === 'ended') {
                setCallStatus('Ended');
                setTimeout(onEndCall, 1200);
              }
            })
            .subscribe();
          channelsRef.current.push(statusCh);

          // Listen for caller ICE candidates
          const iceCh = supabase
            .channel(`ice-caller-${call.callId}`)
            .on('postgres_changes', {
              event: 'INSERT',
              schema: 'public',
              table: 'ice_candidates',
              filter: `signal_id=eq.${call.callId}`,
            }, async (payload) => {
              if (!mounted) return;
              const c = payload.new as any;
              if (c.role === 'caller') {
                await addOrBufferCandidate(c.candidate);
              }
            })
            .subscribe();
          channelsRef.current.push(iceCh);
        }
      } catch (err) {
        if (!mounted) return;
        console.error('Call setup error:', err);
        setCallStatus('Call Failed');
        setConnectionError('Could not start call. Check mic/camera permissions.');
      }
    };

    startCall();

    return () => {
      mounted = false;
      endCallCleanup(true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Call duration counter
  useEffect(() => {
    if (callStatus !== 'Connected') return;
    const interval = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [callStatus]);

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const handleEndCall = useCallback(async () => {
    await endCallCleanup(true);
    onEndCall();
  }, [endCallCleanup, onEndCall]);

  const handleToggleMute = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach(t => (t.enabled = !t.enabled));
      setIsMuted(p => !p);
    }
  };

  const handleToggleCamera = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getVideoTracks().forEach(t => (t.enabled = !t.enabled));
      setIsCameraOn(p => !p);
    }
  };

  // ── KEY FIX: Speaker toggle actually routes audio ────────────────────────────
  // Uses setSinkId API to switch between earpiece (default) and speaker.
  // Falls back gracefully if the browser doesn't support it (e.g. iOS Safari).
  const handleToggleSpeaker = async () => {
    const nextState = !isSpeakerOn;
    setIsSpeakerOn(nextState);

    const audioEl = remoteAudioRef.current;
    if (!audioEl) return;

    // setSinkId is supported in Chrome/Edge on desktop and Android Chrome
    if ('setSinkId' in HTMLAudioElement.prototype) {
      try {
        if (nextState) {
          // Get all audio output devices and find the best speaker option
          const devices = await navigator.mediaDevices.enumerateDevices();
          const outputs = devices.filter(d => d.kind === 'audiooutput');
          // Prefer: communications > speakerphone > anything that's not default earpiece
          const speaker =
            outputs.find(d => d.label.toLowerCase().includes('speaker')) ||
            outputs.find(d => d.deviceId !== 'default' && d.deviceId !== '') ||
            outputs[0];
          if (speaker) {
            await (audioEl as any).setSinkId(speaker.deviceId);
          }
        } else {
          // Revert to system default (usually earpiece on mobile)
          await (audioEl as any).setSinkId('default');
        }
      } catch {
        // setSinkId failed — permission denied or device not found
        // Audio still plays, just can't switch output
      }
    }
    // Note: iOS Safari doesn't support setSinkId at all.
    // The button still shows visually but has no effect on iOS.
  };

  const isConnected = callStatus === 'Connected';
  const isFailed = callStatus === 'Call Failed' || callStatus === 'Ended';

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col items-center text-white overflow-hidden">

      {/* ── Hidden audio element — ALWAYS RENDERED ───────────────────────────
           This is the key fix for voice calls. When call.isVideo is false,
           remoteVideoRef is not bound to any DOM element (the video element
           only renders in the video branch below). This hidden <audio> element
           is always in the DOM and always receives the remote MediaStream,
           ensuring audio plays for BOTH voice and video calls.
      ─────────────────────────────────────────────────────────────────────── */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Background */}
      <div className="absolute inset-0 z-0">
        {call.isVideo ? (
          <div className="w-full h-full relative">
            <video ref={remoteVideoRef} autoPlay playsInline
              className="w-full h-full object-cover"
              poster={call.contact.avatarUrl} />
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
              className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl ${isSpeakerOn ? 'bg-white text-slate-950 shadow-white/20' : 'bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10'}`}>
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
            <button className="px-6 py-3 rounded-2xl hover:bg-white/10 transition-all flex items-center gap-2 hover:text-white" title="In-call chat (coming soon)">
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
