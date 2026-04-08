import React from 'react';
import { UserPlus, X, Phone, Lock, Check } from 'lucide-react';
import type { Contact } from '../types';

interface PostCallModalProps {
  partner: Contact;
  isFriendRequestSent: boolean;
  onSendFriendRequest: () => void;
  onClose: () => void;
}

export const PostCallModal: React.FC<PostCallModalProps> = ({
  partner,
  isFriendRequestSent,
  onSendFriendRequest,
  onClose,
}) => (
  <div
    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-end justify-center animate-fade-in"
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div className="w-full max-w-md bg-white rounded-t-[2rem] px-6 pt-4 pb-10 animate-slide-up shadow-2xl">

      {/* Drag handle */}
      <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

      {/* Close button */}
      <div className="flex justify-end mb-2">
        <button onClick={onClose} className="p-2 -m-2 text-gray-400 hover:text-gray-600 transition-colors rounded-xl">
          <X size={20} />
        </button>
      </div>

      {/* Partner avatar + name */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="relative mb-4">
          {/* Pulse ring */}
          <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping [animation-duration:2s]" />
          <img
            src={partner.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partner.id}`}
            alt={partner.name}
            className="relative w-24 h-24 rounded-full border-4 border-emerald-200 object-cover shadow-lg"
            referrerPolicy="no-referrer"
          />
          {/* Phone badge */}
          <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white shadow">
            <Phone size={14} className="text-white" />
          </div>
        </div>
        <h2 className="text-2xl font-black text-gray-900 tracking-tight">{partner.name}</h2>
        <p className="text-sm text-gray-400 mt-1">You just had a random call with this person</p>
      </div>

      {/* Info card */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-5 flex items-start gap-3">
        <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
          <Lock size={14} className="text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-amber-800">Friends-only re-calling</p>
          <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">
            To call this person again or start a chat, you'll both need to be friends.
            Send a request — when they accept, you'll appear in each other's chat inbox.
          </p>
        </div>
      </div>

      {/* CTA buttons */}
      <div className="space-y-3">
        {isFriendRequestSent ? (
          <div className="w-full py-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center gap-2.5">
            <Check size={18} className="text-emerald-500" />
            <span className="text-emerald-600 font-bold text-sm">Friend request sent! Waiting for them to accept.</span>
          </div>
        ) : (
          <button
            onClick={() => { onSendFriendRequest(); }}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black text-base flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/30 hover:from-emerald-600 hover:to-teal-600 active:scale-[0.98] transition-all"
          >
            <UserPlus size={20} />
            Send Friend Request
          </button>
        )}

        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 active:scale-[0.98] transition-all text-sm"
        >
          Skip for now
        </button>
      </div>
    </div>
  </div>
);
