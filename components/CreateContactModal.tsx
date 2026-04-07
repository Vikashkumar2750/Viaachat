
import React, { useState, useRef } from 'react';
import { Camera, User, Phone, X } from 'lucide-react';

interface CreateContactModalProps {
  onClose: () => void;
  onContactCreate: (contactData: { name: string; phone?: string; avatarUrl: string; }) => void;
}

export const CreateContactModal: React.FC<CreateContactModalProps> = ({ onClose, onContactCreate }) => {
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactAvatar, setContactAvatar] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setContactAvatar(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreate = () => {
    if (canCreate) {
        onContactCreate({
            name: contactName,
            phone: contactPhone,
            avatarUrl: contactAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${contactName}`, // Default avatar
        });
    }
  };

  const canCreate = contactName.trim() !== '';

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-40 z-40 animate-fade-in" onClick={onClose}></div>
      <div className="fixed inset-x-0 bottom-0 bg-white z-50 rounded-t-2xl shadow-2xl p-4 flex flex-col h-[90%] max-w-md mx-auto animate-slide-up">
        <header className="flex items-center justify-between pb-4 border-b">
          <button onClick={onClose} className="text-[15px] text-gray-500 font-medium hover:text-gray-800 px-2 py-1">Cancel</button>
          <h2 className="text-lg font-bold text-gray-800">New Contact</h2>
          <button 
            onClick={handleCreate} 
            disabled={!canCreate}
            className={`text-[15px] font-bold px-4 py-1.5 rounded-full transition-all ${canCreate ? 'text-white bg-emerald-500 hover:bg-emerald-600 shadow-md' : 'text-gray-400 bg-gray-100'}`}
          >
            Create
          </button>
        </header>

        <div className="flex flex-col items-center py-8">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            <button 
                onClick={handleImageUploadClick} 
                className="w-28 h-28 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 mb-8 hover:bg-emerald-100 transition-colors overflow-hidden border-2 border-dashed border-emerald-200 relative group"
            >
                {contactAvatar ? (
                    <img src={contactAvatar} alt="Contact Avatar" className="w-full h-full object-cover" />
                ) : (
                    <Camera size={36} />
                )}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Camera size={24} className="text-white" />
                </div>
            </button>
            <div className="w-full px-4 space-y-6">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User size={18} className="text-gray-400" />
                    </div>
                    <input
                        type="text"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Full Name"
                        className="block w-full rounded-xl border-0 py-3 pl-10 pr-3 text-gray-900 bg-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-500 transition-all sm:text-sm"
                    />
                </div>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone size={18} className="text-gray-400" />
                    </div>
                    <input
                        type="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        placeholder="Phone Number"
                        className="block w-full rounded-xl border-0 py-3 pl-10 pr-3 text-gray-900 bg-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-500 transition-all sm:text-sm"
                    />
                </div>
            </div>
        </div>
      </div>
    </>
  );
};
