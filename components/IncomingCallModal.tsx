
import React from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import type { Contact } from '../types';

interface IncomingCallModalProps {
    call: {
        contact: Contact;
        isVideo: boolean;
    };
    onAccept: () => void;
    onReject: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({ call, onAccept, onReject }) => {
    return (
        <div className="fixed inset-x-0 top-0 z-50 p-4 max-w-md mx-auto">
            <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl p-4 flex items-center justify-between animate-slide-down border border-white/10">
                <div className="flex items-center">
                    <div className="relative">
                      <img 
                        src={call.contact.avatarUrl || `https://picsum.photos/seed/${call.contact.id}/200`} 
                        alt={call.contact.name} 
                        className="w-12 h-12 rounded-full mr-4 object-cover border border-white/20" 
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute -bottom-1 -right-1 bg-emerald-500 p-1 rounded-full border-2 border-slate-900">
                        {call.isVideo ? <Video size={10} /> : <Phone size={10} />}
                      </div>
                    </div>
                    <div>
                        <p className="font-bold text-[15px]">{call.contact.name}</p>
                        <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                          {call.isVideo ? 'Incoming Video Call' : 'Incoming Call'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <button 
                      onClick={onReject} 
                      className="w-11 h-11 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-red-500/20"
                    >
                        <PhoneOff size={20} />
                    </button>
                    <button 
                      onClick={onAccept} 
                      className="w-11 h-11 bg-emerald-500 hover:bg-emerald-600 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-emerald-500/20"
                    >
                        <Phone size={20} />
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes slide-down {
                    from { transform: translateY(-100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .animate-slide-down { animation: slide-down 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
            `}</style>
        </div>
    );
};
