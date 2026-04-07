
import React from 'react';
import { AlertCircle } from 'lucide-react';

interface DeleteConfirmationModalProps {
  chatName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({ chatName, onConfirm, onCancel }) => {
  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 animate-fade-in" onClick={onCancel}></div>
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white z-50 rounded-[2rem] shadow-2xl p-8 w-[90%] max-w-sm mx-auto animate-zoom-in border border-gray-100">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Delete Chat?</h2>
          <p className="text-gray-500 mb-8 leading-relaxed">
            Are you sure you want to delete the chat with <span className="font-bold text-gray-800">{chatName}</span>? This action cannot be undone.
          </p>
          <div className="flex flex-col w-full space-y-3">
              <button 
                onClick={onConfirm} 
                className="w-full py-4 rounded-2xl text-white bg-red-500 hover:bg-red-600 font-bold transition-all active:scale-95 shadow-lg shadow-red-500/20"
              >
                  Delete Chat
              </button>
              <button 
                onClick={onCancel} 
                className="w-full py-4 rounded-2xl text-gray-600 bg-gray-100 hover:bg-gray-200 font-bold transition-all active:scale-95"
              >
                  Cancel
              </button>
          </div>
        </div>
      </div>

    </>
  );
};
