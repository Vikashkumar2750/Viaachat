
import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import type { Contact } from '../types';

interface IncomingCallModalProps {
  call: {
    contact?: Contact;
    isVideo: boolean;
    callerId?: string;
    id?: string;
  };
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({ call, onAccept, onReject }) => {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef(false);

  const playRingTone = () => {
    // Never play if already stopped (guards against StrictMode double-invoke)
    if (stoppedRef.current) return;
    try {
      // Create a fresh context if we don't have one or if the previous one is closed
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      // Don't play if somehow still closed
      if (ctx.state === 'closed') return;

      const playNote = (freq: number, start: number, dur: number) => {
        if (ctx.state === 'closed') return;
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
          gain.gain.setValueAtTime(0, ctx.currentTime + start);
          gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
          osc.start(ctx.currentTime + start);
          osc.stop(ctx.currentTime + start + dur);
        } catch {
          // ignore node creation errors from closed context
        }
      };

      playNote(440, 0, 0.3);
      playNote(480, 0.1, 0.3);
      playNote(440, 0.4, 0.3);
      playNote(480, 0.5, 0.3);
    } catch {
      // AudioContext not available
    }
  };

  useEffect(() => {
    // Reset stopped flag each time effect runs
    stoppedRef.current = false;

    playRingTone();
    ringIntervalRef.current = setInterval(playRingTone, 2500);

    return () => {
      stoppedRef.current = true;
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
      // Only close if not already closed
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
    };
  }, []);

  const stopRing = () => {
    stoppedRef.current = true;
    if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
  };

  const handleAccept = () => {
    stopRing();
    onAccept();
  };

  const handleReject = () => {
    stopRing();
    onReject();
  };

  const contact = call.contact;
  const callerName = contact?.name || 'Unknown Caller';
  const callerAvatar = contact?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${call.callerId || 'caller'}`;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] p-4 max-w-md mx-auto">
      <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-3xl shadow-2xl overflow-hidden animate-slide-down border border-white/10">
        {/* Animated top bar */}
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 animate-pulse" />

        <div className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Pulsing avatar */}
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" />
              <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-emerald-500/50">
                <img
                  src={callerAvatar}
                  alt={callerName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-emerald-500 p-1 rounded-full border-2 border-slate-900">
                {call.isVideo ? <Video size={10} /> : <Phone size={10} />}
              </div>
            </div>

            <div className="min-w-0">
              <p className="font-black text-base truncate">{callerName}</p>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                {call.isVideo ? 'Incoming Video Call' : 'Incoming Call'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Reject */}
            <button onClick={handleReject} className="flex flex-col items-center gap-1 group">
              <div className="w-12 h-12 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-red-500/30">
                <PhoneOff size={20} />
              </div>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Decline</span>
            </button>

            {/* Accept */}
            <button onClick={handleAccept} className="flex flex-col items-center gap-1 group">
              <div className="w-12 h-12 bg-emerald-500 hover:bg-emerald-600 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-emerald-500/30 animate-bounce">
                <Phone size={20} />
              </div>
              <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">Accept</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
