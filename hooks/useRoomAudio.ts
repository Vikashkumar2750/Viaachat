import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';

// ─── Room WebRTC Audio Engine ─────────────────────────────────────────────────
// Creates a full-mesh audio network between all seated participants.
// Each user creates peer connections to every OTHER seated user.
// Signaling is done via a dedicated room_rtc_signals table (or using room_messages type='webrtc').

const RTC_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

interface UseRoomAudioOptions {
  roomId: string;
  myUserId: string;
  seatedUserIds: string[]; // all seated users (including myself)
  isMuted: boolean;
  isEnabled: boolean; // only true when the user is seated
}

export function useRoomAudio({
  roomId,
  myUserId,
  seatedUserIds,
  isMuted,
  isEnabled,
}: UseRoomAudioOptions) {
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const channelRef = useRef<any>(null);
  const pendingCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pcsRef.current.forEach(pc => { try { pc.close(); } catch {} });
    pcsRef.current.clear();
    remoteAudiosRef.current.forEach(audio => { audio.srcObject = null; audio.remove(); });
    remoteAudiosRef.current.clear();
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const sendSignal = useCallback(async (to: string, payload: any) => {
    await supabase.from('room_messages').insert({
      room_id: roomId,
      sender_id: myUserId,
      sender_name: '__webrtc__',
      text: JSON.stringify({ to, from: myUserId, ...payload }),
      timestamp: new Date().toISOString(),
      mentions: ['__webrtc__'],
    });
  }, [roomId, myUserId]);

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

    // Handle remote audio
    pc.ontrack = (event) => {
      let audio = remoteAudiosRef.current.get(remoteUserId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        document.body.appendChild(audio);
        remoteAudiosRef.current.set(remoteUserId, audio);
      }
      audio.srcObject = event.streams[0];
    };

    // Send ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await sendSignal(remoteUserId, {
          type: 'ice',
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Apply pending ICE candidates
    pc.onconnectionstatechange = async () => {
      const pending = pendingCandidates.current.get(remoteUserId) || [];
      if (pc.remoteDescription && pending.length > 0) {
        for (const c of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        }
        pendingCandidates.current.set(remoteUserId, []);
      }
    };

    if (isCaller) {
      // Create and send offer
      pc.createOffer({ offerToReceiveAudio: true })
        .then(offer => pc.setLocalDescription(offer))
        .then(() => sendSignal(remoteUserId, {
          type: 'offer',
          sdp: pc.localDescription!.sdp,
        }))
        .catch(console.error);
    }

    return pc;
  }, [sendSignal]);

  const handleSignal = useCallback(async (signal: any) => {
    const { from, to, type, sdp, candidate } = signal;
    if (to !== myUserId) return; // Not for me

    if (type === 'offer') {
      const pc = createPeerConnection(from, false);
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(from, { type: 'answer', sdp: answer.sdp });

      // Apply pending ICE candidates
      const pending = pendingCandidates.current.get(from) || [];
      for (const c of pending) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      }
      pendingCandidates.current.set(from, []);

    } else if (type === 'answer') {
      const pc = pcsRef.current.get(from);
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
        // Apply pending ICE candidates
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
        // Buffer until offer/answer processed
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
          },
          video: false,
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;

        // Mute/unmute
        stream.getAudioTracks().forEach(t => (t.enabled = !isMuted));

        // Connect to all other seated users (lower userId = caller to avoid both creating offers)
        const otherSeated = seatedUserIds.filter(id => id !== myUserId);
        for (const remoteId of otherSeated) {
          const isCaller = myUserId < remoteId; // deterministic: lower ID calls
          createPeerConnection(remoteId, isCaller);
        }

        // Subscribe to WebRTC signals via room_messages
        const channel = supabase
          .channel(`room-rtc-${roomId}-${myUserId}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'room_messages',
            filter: `room_id=eq.${roomId}`,
          }, (payload) => {
            const row = payload.new as any;
            if (row.sender_name !== '__webrtc__') return;
            try {
              const signal = JSON.parse(row.text);
              if (signal.to === myUserId) {
                handleSignal(signal);
              }
            } catch {}
          })
          .subscribe();

        channelRef.current = channel;
      } catch (err) {
        console.warn('Room audio: microphone access denied or unavailable:', err);
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
  }, [isMuted]);

  // Handle new user joining (create connection to them if I'm already seated)
  const connectToNewUser = useCallback((remoteUserId: string) => {
    if (!isEnabled || !localStreamRef.current) return;
    if (pcsRef.current.has(remoteUserId)) return;
    const isCaller = myUserId < remoteUserId;
    createPeerConnection(remoteUserId, isCaller);
  }, [isEnabled, myUserId, createPeerConnection]);

  // Disconnect from a user who left
  const disconnectFromUser = useCallback((remoteUserId: string) => {
    const pc = pcsRef.current.get(remoteUserId);
    if (pc) { try { pc.close(); } catch {} pcsRef.current.delete(remoteUserId); }
    const audio = remoteAudiosRef.current.get(remoteUserId);
    if (audio) { audio.srcObject = null; audio.remove(); remoteAudiosRef.current.delete(remoteUserId); }
  }, []);

  return { connectToNewUser, disconnectFromUser };
}
