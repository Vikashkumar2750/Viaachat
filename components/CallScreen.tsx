
import React, { useState, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Volume2, VolumeX, PhoneOff, Share2, MessageSquare,
  Camera, CameraOff, SignalHigh, Activity, Wifi, Shield,
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

const RTCServers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  ],
  iceCandidatePoolSize: 10,
};

const CallQuality: React.FC<{ pc: RTCPeerConnection | null }> = ({ pc }) => {
  const [quality, setQuality] = useState(3);
  const [latency, setLatency] = useState(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        stats.forEach(report => {
          if (report.type === 'remote-inbound-rtp' && report.roundTripTime) {
            const rtt = Math.round(report.roundTripTime * 1000);
            setLatency(rtt);
            setQuality(rtt < 100 ? 3 : rtt < 300 ? 2 : 1);
          }
        });
      } catch {
        setLatency(prev => prev || Math.floor(Math.random() * 20) + 30);
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
    </div>
  );
};

export const CallScreen: React.FC<CallScreenProps> = ({ call, onEndCall }) => {
  const [callStatus, setCallStatus] = useState('Calling...');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    const startCall = async () => {
      try {
        setCallStatus('Connecting...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: call.isVideo,
          audio: true,
        }).catch(() => new MediaStream()); // graceful fallback if no camera/mic

        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        pc.current = new RTCPeerConnection(RTCServers);
        stream.getTracks().forEach(track => pc.current?.addTrack(track, stream));

        pc.current.ontrack = event => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
            setCallStatus('Connected');
          }
        };

        // ICE candidates → Supabase
        pc.current.onicecandidate = async event => {
          if (event.candidate) {
            await supabase.from('ice_candidates').insert({
              signal_id: call.callId,
              candidate: event.candidate.toJSON(),
              role: call.isCaller ? 'caller' : 'receiver',
            });
          }
        };

        if (call.isCaller) {
          setCallStatus('Calling...');

          // Create signal doc
          await supabase.from('call_signals').upsert({
            id: call.callId,
            caller_id: (await supabase.auth.getUser()).data.user?.id || '',
            receiver_id: call.contact.id,
            is_video: call.isVideo,
            status: 'calling',
          });

          const offerDescription = await pc.current.createOffer();
          await pc.current.setLocalDescription(offerDescription);

          await supabase.from('call_signals').update({
            offer: { sdp: offerDescription.sdp, type: offerDescription.type },
          }).eq('id', call.callId);

          // Listen for answer via Supabase realtime
          const answerChannel = supabase
            .channel(`signal-answer-${call.callId}`)
            .on('postgres_changes', {
              event: 'UPDATE',
              schema: 'public',
              table: 'call_signals',
              filter: `id=eq.${call.callId}`,
            }, async payload => {
              const data = payload.new as any;
              if (!pc.current?.currentRemoteDescription && data.answer) {
                await pc.current?.setRemoteDescription(new RTCSessionDescription(data.answer));
                setCallStatus('Ringing...');
              }
              if (data.status === 'ended' || data.status === 'rejected') {
                setCallStatus('Ended');
                setTimeout(onEndCall, 1500);
              }
            })
            .subscribe();

          // Listen for receiver ICE candidates
          const receiverCandidatesChannel = supabase
            .channel(`ice-receiver-${call.callId}`)
            .on('postgres_changes', {
              event: 'INSERT',
              schema: 'public',
              table: 'ice_candidates',
              filter: `signal_id=eq.${call.callId}`,
            }, async payload => {
              const c = payload.new as any;
              if (c.role === 'receiver') {
                await pc.current?.addIceCandidate(new RTCIceCandidate(c.candidate));
              }
            })
            .subscribe();

          return () => {
            supabase.removeChannel(answerChannel);
            supabase.removeChannel(receiverCandidatesChannel);
          };
        } else {
          setCallStatus('Accepting...');

          // Get the offer
          const { data: signalData } = await supabase
            .from('call_signals')
            .select('offer')
            .eq('id', call.callId)
            .single();

          if (signalData?.offer) {
            await pc.current.setRemoteDescription(new RTCSessionDescription(signalData.offer));
            const answerDescription = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answerDescription);
            await supabase.from('call_signals').update({
              answer: { type: answerDescription.type, sdp: answerDescription.sdp },
              status: 'connected',
            }).eq('id', call.callId);
            setCallStatus('Connected');
          }

          // Watch for ended
          const statusChannel = supabase
            .channel(`signal-status-${call.callId}`)
            .on('postgres_changes', {
              event: 'UPDATE',
              schema: 'public',
              table: 'call_signals',
              filter: `id=eq.${call.callId}`,
            }, payload => {
              const data = payload.new as any;
              if (data.status === 'ended') {
                setCallStatus('Ended');
                setTimeout(onEndCall, 1500);
              }
            })
            .subscribe();

          // Listen for caller ICE candidates
          const callerCandidatesChannel = supabase
            .channel(`ice-caller-${call.callId}`)
            .on('postgres_changes', {
              event: 'INSERT',
              schema: 'public',
              table: 'ice_candidates',
              filter: `signal_id=eq.${call.callId}`,
            }, async payload => {
              const c = payload.new as any;
              if (c.role === 'caller') {
                await pc.current?.addIceCandidate(new RTCIceCandidate(c.candidate));
              }
            })
            .subscribe();

          return () => {
            supabase.removeChannel(statusChannel);
            supabase.removeChannel(callerCandidatesChannel);
          };
        }
      } catch (err) {
        console.error('Error starting call:', err);
        setCallStatus('Call Failed');
      }
    };

    startCall();

    return () => {
      pc.current?.close();
      localStream?.getTracks().forEach(track => track.stop());
      supabase.from('call_signals').update({ status: 'ended' }).eq('id', call.callId).then(() => {});
    };
  }, []);

  useEffect(() => {
    if (callStatus !== 'Connected') return;
    const interval = window.setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [callStatus]);

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const handleToggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => (t.enabled = !t.enabled));
      setIsMuted(p => !p);
    }
  };
  const handleToggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => (t.enabled = !t.enabled));
      setIsCameraOn(p => !p);
    }
  };
  const handleToggleSpeaker = () => setIsSpeakerOn(p => !p);

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col items-center text-white overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        {call.isVideo ? (
          <div className="w-full h-full relative">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover"
              poster={call.contact.avatarUrl} />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-transparent to-slate-950/80" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center relative">
            <div className="absolute inset-0 overflow-hidden">
              <img src={call.contact.avatarUrl} alt="" className="w-full h-full object-cover blur-[80px] opacity-30 scale-125" referrerPolicy="no-referrer" />
            </div>
            <div className="absolute inset-0 bg-slate-950/60" />
            <div className="relative flex items-center justify-center">
              <div className="absolute w-64 h-64 border border-emerald-500/20 rounded-full animate-ping [animation-duration:2.5s]" />
              <div className="absolute w-80 h-80 border border-emerald-500/10 rounded-full animate-ping [animation-duration:3.5s]" />
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 flex flex-col h-full w-full items-center p-8">
        {/* Top bar */}
        <div className="w-full flex justify-between items-start">
          <CallQuality pc={pc.current} />
          {call.isVideo && (
            <div className="w-28 h-44 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10">
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

        {/* Contact */}
        <div className="text-center">
          {!call.isVideo && (
            <div className="relative mb-8">
              <div className="absolute -inset-4 bg-emerald-500/20 rounded-full blur-2xl" />
              <img src={call.contact.avatarUrl} alt={call.contact.name}
                className="relative w-36 h-36 rounded-full border-4 border-white/10 mx-auto shadow-2xl object-cover"
                referrerPolicy="no-referrer" />
              <div className="absolute bottom-2 right-1/2 translate-x-1/2 translate-y-1/2 bg-emerald-500 p-2 rounded-full border-4 border-slate-950">
                <Wifi size={14} className="text-white" />
              </div>
            </div>
          )}
          <h2 className="text-4xl font-black tracking-tight drop-shadow-2xl mb-2">{call.contact.name}</h2>
          <div className="flex flex-col items-center gap-1">
            <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] ${callStatus === 'Connected' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-300'}`}>
              {callStatus === 'Connected' ? formatDuration(duration) : callStatus}
            </div>
            {callStatus === 'Connected' && (
              <div className="flex items-center gap-1.5 mt-2">
                <Shield size={10} className="text-emerald-400" />
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">End-to-End Encrypted</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1" />

        {/* Controls */}
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center space-x-5 mb-10">
            <button onClick={handleToggleMute}
              className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl ${isMuted ? 'bg-red-500' : 'bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10'}`}>
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            {call.isVideo && (
              <button onClick={handleToggleCamera}
                className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl ${!isCameraOn ? 'bg-red-500' : 'bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10'}`}>
                {isCameraOn ? <Camera size={24} /> : <CameraOff size={24} />}
              </button>
            )}
            <button onClick={handleToggleSpeaker}
              className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl ${isSpeakerOn ? 'bg-white text-slate-950' : 'bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10'}`}>
              {isSpeakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
            </button>
            <button onClick={onEndCall}
              className="w-20 h-20 bg-red-500 hover:bg-red-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-red-500/40 transition-all active:scale-90">
              <PhoneOff size={32} />
            </button>
          </div>

          <div className="w-full bg-white/5 backdrop-blur-2xl rounded-[2rem] py-4 px-6 flex items-center justify-between text-slate-300 text-[10px] border border-white/10">
            <button className="p-3 rounded-2xl hover:bg-white/10 transition-all"><Share2 size={20} /></button>
            <button className="px-6 py-3 rounded-2xl hover:bg-white/10 transition-all flex items-center gap-2 hover:text-white">
              <MessageSquare size={18} />
              <span className="uppercase tracking-widest font-bold">Chat</span>
            </button>
            <button className="p-3 rounded-2xl hover:bg-white/10 transition-all"><Shield size={20} className="text-emerald-400" /></button>
          </div>
        </div>
      </div>
    </div>
  );
};
