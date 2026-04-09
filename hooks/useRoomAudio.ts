import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';

// ─── Room WebRTC Audio Engine v2 ──────────────────────────────────────────────
// Full-mesh audio with active speaker detection via Web Audio API.
// Signals go through a dedicated room_signals table (not chat messages).

const RTC_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
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
  ],
  iceCandidatePoolSize: 16,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

interface UseRoomAudioOptions {
  roomId: string;
  myUserId: string;
  seatedUserIds: string[];
  isMuted: boolean;
  isEnabled: boolean;
  onSpeakingChange?: (userId: string, isSpeaking: boolean) => void;
}

export function useRoomAudio({
  roomId,
  myUserId,
  seatedUserIds,
  isMuted,
  isEnabled,
  onSpeakingChange,
}: UseRoomAudioOptions) {
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const channelRef = useRef<any>(null);
  const pendingCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRefs = useRef<Map<string, AnalyserNode>>(new Map());
  const speakingTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ── Active speaker detection ────────────────────────────────────────────────
  const startSpeakingDetection = useCallback((userId: string, stream: MediaStream) => {
    if (!onSpeakingChange) return;
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRefs.current.set(userId, analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const THRESHOLD = 20;

      const timer = setInterval(() => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        onSpeakingChange(userId, avg > THRESHOLD);
      }, 100);
      speakingTimers.current.set(userId, timer);
    } catch {
      // AudioContext not available
    }
  }, [onSpeakingChange]);

  const stopSpeakingDetection = useCallback((userId: string) => {
    const timer = speakingTimers.current.get(userId);
    if (timer) { clearInterval(timer); speakingTimers.current.delete(userId); }
    analyserRefs.current.delete(userId);
    onSpeakingChange?.(userId, false);
  }, [onSpeakingChange]);

  const cleanup = useCallback(() => {
    // Stop local media
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    // Close all peer connections
    pcsRef.current.forEach(pc => { try { pc.close(); } catch {} });
    pcsRef.current.clear();

    // Remove all remote audio elements
    remoteAudiosRef.current.forEach(audio => {
      audio.srcObject = null;
      audio.remove();
    });
    remoteAudiosRef.current.clear();

    // Stop speaking detection
    speakingTimers.current.forEach((timer) => clearInterval(timer));
    speakingTimers.current.clear();
    analyserRefs.current.clear();

    // Close AudioContext
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    // Remove realtime channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  // ── Send WebRTC signal via Supabase Realtime broadcast (no DB write) ────────
  const sendSignal = useCallback(async (to: string, payload: any) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'webrtc',
      payload: { to, from: myUserId, ...payload },
    });
  }, [myUserId]);

  const createPeerConnection = useCallback((remoteUserId: string, isCaller: boolean) => {
    if (pcsRef.current.has(remoteUserId)) return pcsRef.current.get(remoteUserId)!;

    const pc = new RTCPeerConnection(RTC_SERVERS);
    pcsRef.current.set(remoteUserId, pc);

    // Add local audio tracks
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle incoming remote stream
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (!remoteStream) return;

      // Create or reuse audio element
      let audio = remoteAudiosRef.current.get(remoteUserId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audio.playsInline = true;
        document.body.appendChild(audio);
        remoteAudiosRef.current.set(remoteUserId, audio);
      }
      audio.srcObject = remoteStream;
      audio.play().catch(() => {});

      // Start active speaker detection for this peer
      startSpeakingDetection(remoteUserId, remoteStream);
    };

    // Buffer ICE candidates until remote description is set
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await sendSignal(remoteUserId, {
          type: 'ice',
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        // Try to reconnect
        pc.restartIce();
      }
    };

    if (isCaller) {
      pc.createOffer({ offerToReceiveAudio: true })
        .then(offer => pc.setLocalDescription(offer))
        .then(() => sendSignal(remoteUserId, {
          type: 'offer',
          sdp: pc.localDescription!.sdp,
        }))
        .catch(console.error);
    }

    return pc;
  }, [sendSignal, startSpeakingDetection]);

  const handleSignal = useCallback(async (signal: any) => {
    const { from, to, type, sdp, candidate } = signal;
    if (to !== myUserId) return;

    if (type === 'offer') {
      const pc = createPeerConnection(from, false);
      if (pc.signalingState !== 'stable') return;
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(from, { type: 'answer', sdp: answer.sdp });

      // Apply buffered ICE candidates
      const pending = pendingCandidates.current.get(from) || [];
      for (const c of pending) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      }
      pendingCandidates.current.set(from, []);

    } else if (type === 'answer') {
      const pc = pcsRef.current.get(from);
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
        const pending = pendingCandidates.current.get(from) || [];
        for (const c of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        }
        pendingCandidates.current.set(from, []);
      }

    } else if (type === 'ice') {
      const pc = pcsRef.current.get(from);
      if (pc && pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      } else {
        const existing = pendingCandidates.current.get(from) || [];
        pendingCandidates.current.set(from, [...existing, candidate]);
      }
    }
  }, [myUserId, createPeerConnection, sendSignal]);

  useEffect(() => {
    if (!isEnabled) {
      cleanup();
      return;
    }

    let mounted = true;

    const initAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 48000 },
          },
          video: false,
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        stream.getAudioTracks().forEach(t => (t.enabled = !isMuted));

        // Start self speaking detection
        startSpeakingDetection(myUserId, stream);

        // Open a Realtime channel for WebRTC broadcast signaling (no DB writes needed!)
        const channel = supabase
          .channel(`room-mesh-${roomId}`, {
            config: { broadcast: { self: false } },
          })
          .on('broadcast', { event: 'webrtc' }, ({ payload }) => {
            if (payload.to === myUserId) handleSignal(payload);
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED' && mounted) {
              // Connect to all other seated users
              const others = seatedUserIds.filter(id => id !== myUserId);
              for (const remoteId of others) {
                const isCaller = myUserId < remoteId;
                createPeerConnection(remoteId, isCaller);
              }
            }
          });

        channelRef.current = channel;
      } catch (err) {
        console.warn('Room audio: mic access denied:', err);
      }
    };

    initAudio();

    return () => {
      mounted = false;
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnabled, roomId, myUserId, seatedUserIds.join(',')]);

  // Mute/unmute local tracks
  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => {
      t.enabled = !isMuted;
    });
    // Notify self-detection
    onSpeakingChange?.(myUserId, !isMuted);
  }, [isMuted, myUserId, onSpeakingChange]);

  const connectToNewUser = useCallback((remoteUserId: string) => {
    if (!isEnabled || !localStreamRef.current) return;
    if (pcsRef.current.has(remoteUserId)) return;
    const isCaller = myUserId < remoteUserId;
    createPeerConnection(remoteUserId, isCaller);
  }, [isEnabled, myUserId, createPeerConnection]);

  const disconnectFromUser = useCallback((remoteUserId: string) => {
    const pc = pcsRef.current.get(remoteUserId);
    if (pc) { try { pc.close(); } catch {} pcsRef.current.delete(remoteUserId); }
    const audio = remoteAudiosRef.current.get(remoteUserId);
    if (audio) { audio.srcObject = null; audio.remove(); remoteAudiosRef.current.delete(remoteUserId); }
    stopSpeakingDetection(remoteUserId);
  }, [stopSpeakingDetection]);

  return { connectToNewUser, disconnectFromUser };
}
