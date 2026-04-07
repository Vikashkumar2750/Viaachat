
import React from 'react';
import { X, MessageSquare, Phone, Video, MoreHorizontal, ShieldCheck } from 'lucide-react';
import type { Contact } from '../types';

interface UserProfileModalProps {
  user: Contact;
  onClose: () => void;
  onInitiateCall: (contact: Contact, isVideo: boolean) => void;
  onInitiateChat: (contact: Contact) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, onClose, onInitiateCall, onInitiateChat }) => {
  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 animate-fade-in" onClick={onClose}></div>
      <div className="fixed inset-x-0 bottom-0 bg-white z-50 rounded-t-[2.5rem] shadow-2xl flex flex-col items-center max-w-md mx-auto animate-slide-up overflow-hidden">
        {/* Header Handle */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mt-3 mb-6"></div>
        
        <div className="w-full px-8 pb-8 flex flex-col items-center">
          <div className="relative mb-4">
            <img 
              src={user.avatarUrl || `https://picsum.photos/seed/${user.id}/200`} 
              alt={user.name} 
              className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-xl" 
              referrerPolicy="no-referrer"
            />
            <div className="absolute bottom-1 right-1 bg-emerald-500 w-6 h-6 rounded-full border-4 border-white"></div>
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-1">{user.name}</h2>
          <div className="flex items-center text-emerald-600 text-sm font-medium mb-8">
            <ShieldCheck size={14} className="mr-1" />
            <span>Verified Profile</span>
          </div>

          <div className="w-full grid grid-cols-3 gap-4 mb-8">
               <button 
                onClick={() => onInitiateChat(user)} 
                className="flex flex-col items-center justify-center p-4 bg-emerald-50 rounded-2xl text-emerald-600 hover:bg-emerald-100 transition-colors group"
               >
                  <MessageSquare size={24} className="mb-2 group-active:scale-90 transition-transform" />
                  <span className="text-xs font-bold">Message</span>
               </button>
               <button 
                onClick={() => onInitiateCall(user, false)} 
                className="flex flex-col items-center justify-center p-4 bg-emerald-50 rounded-2xl text-emerald-600 hover:bg-emerald-100 transition-colors group"
               >
                  <Phone size={24} className="mb-2 group-active:scale-90 transition-transform" />
                  <span className="text-xs font-bold">Call</span>
               </button>
                <button 
                  onClick={() => onInitiateCall(user, true)} 
                  className="flex flex-col items-center justify-center p-4 bg-emerald-50 rounded-2xl text-emerald-600 hover:bg-emerald-100 transition-colors group"
                >
                  <Video size={24} className="mb-2 group-active:scale-90 transition-transform" />
                  <span className="text-xs font-bold">Video</span>
               </button>
          </div>

          <div className="w-full space-y-3">
            <button className="w-full py-4 px-6 bg-gray-50 text-gray-700 font-bold rounded-2xl hover:bg-gray-100 transition-colors flex items-center justify-between">
              <span>Media, Links, and Docs</span>
              <span className="text-gray-400">124</span>
            </button>
            <button className="w-full py-4 px-6 bg-gray-50 text-gray-700 font-bold rounded-2xl hover:bg-gray-100 transition-colors flex items-center justify-between">
              <span>Starred Messages</span>
              <MoreHorizontal size={18} className="text-gray-400" />
            </button>
          </div>

          <button 
            onClick={onClose} 
            className="mt-8 text-gray-400 hover:text-gray-600 transition-colors p-2"
          >
              <X size={24} />
          </button>
        </div>
      </div>
    </>
  );
};
