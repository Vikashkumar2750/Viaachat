
import React, { useState, useMemo, useRef } from 'react';
import { Camera, Search, Check, X } from 'lucide-react';
import type { Contact } from '../types';

interface CreateGroupModalProps {
  contacts: Contact[];
  onClose: () => void;
  onGroupCreate: (groupData: { name: string; avatarUrl: string; members: Contact[] }) => void;
}

const ContactItem: React.FC<{ contact: Contact; isSelected: boolean; onToggle: () => void; }> = ({ contact, isSelected, onToggle }) => {
  return (
    <li className="flex items-center p-3 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors" onClick={onToggle}>
      <img 
        src={contact.avatarUrl || `https://picsum.photos/seed/${contact.id}/200`} 
        alt={contact.name} 
        className="w-11 h-11 rounded-full mr-3 object-cover border border-gray-100" 
        referrerPolicy="no-referrer"
      />
      <span className="flex-1 text-gray-800 font-semibold text-[15px]">{contact.name}</span>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${isSelected ? 'bg-emerald-500 border-emerald-500 scale-110' : 'border-gray-300'}`}>
        {isSelected && <Check size={14} className="text-white" />}
      </div>
    </li>
  )
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ contacts, onClose, onGroupCreate }) => {
  const [groupName, setGroupName] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleToggleContact = (contactId: string) => {
    setSelectedContacts(prev =>
      prev.includes(contactId) ? prev.filter(id => id !== contactId) : [...prev, contactId]
    );
  };

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setGroupAvatar(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreate = () => {
    const members = contacts.filter(c => selectedContacts.includes(c.id));
    onGroupCreate({
        name: groupName,
        avatarUrl: groupAvatar || 'https://picsum.photos/seed/newgroup/200', // Default avatar
        members: members,
    });
  };

  const filteredContacts = useMemo(() =>
    contacts.filter(contact =>
      contact.name.toLowerCase().includes(searchTerm.toLowerCase())
    ), [searchTerm, contacts]);

  const canCreate = groupName.trim() !== '' && selectedContacts.length > 0;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-40 z-40 animate-fade-in" onClick={onClose}></div>
      <div className="fixed inset-x-0 bottom-0 bg-white z-50 rounded-t-2xl shadow-2xl p-4 flex flex-col h-[90%] max-w-md mx-auto animate-slide-up">
        <header className="flex items-center justify-between pb-4 border-b">
          <button onClick={onClose} className="text-[15px] text-gray-500 font-medium hover:text-gray-800 px-2 py-1">Cancel</button>
          <h2 className="text-lg font-bold text-gray-800">New Group</h2>
          <button 
            onClick={handleCreate} 
            disabled={!canCreate}
            className={`text-[15px] font-bold px-4 py-1.5 rounded-full transition-all ${canCreate ? 'text-white bg-emerald-500 hover:bg-emerald-600 shadow-md' : 'text-gray-400 bg-gray-100'}`}
          >
            Create
          </button>
        </header>

        <div className="flex items-center py-6 gap-4">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
          <button 
            onClick={handleImageUploadClick} 
            className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 hover:bg-emerald-100 transition-colors overflow-hidden border-2 border-dashed border-emerald-200"
          >
            {groupAvatar ? (
                <img src={groupAvatar} alt="Group Avatar" className="w-full h-full object-cover" />
            ) : (
                <Camera size={28} />
            )}
          </button>
          <div className="flex-1">
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group Name"
              className="w-full text-lg bg-transparent text-gray-900 outline-none border-b-2 border-gray-100 focus:border-emerald-500 transition-colors py-1"
            />
          </div>
        </div>

        <div className="pb-4">
           <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search contacts"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-100 text-gray-800 rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto space-y-1">
          {filteredContacts.map(contact => (
            <ContactItem
              key={contact.id}
              contact={contact}
              isSelected={selectedContacts.includes(contact.id)}
              onToggle={() => handleToggleContact(contact.id)}
            />
          ))}
        </ul>

      </div>
    </>
  );
};
