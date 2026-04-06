
import React from 'react';
import type { Group } from '../types';

const GroupItem: React.FC<{ group: Group, onClick: () => void }> = ({ group, onClick }) => (
  <div onClick={onClick} className="flex items-center p-3 hover:bg-gray-100 cursor-pointer">
    <img src={group.avatarUrl || `https://picsum.photos/seed/${group.id}/200`} alt={group.name} className="w-12 h-12 rounded-lg mr-4" />
    <div className="flex-1 min-w-0">
      <p className="text-lg font-medium text-gray-900 truncate">{group.name}</p>
      <p className="text-sm text-gray-500">{group.memberCount} members</p>
    </div>
  </div>
);

interface GroupsScreenProps {
  groups: Group[];
  onOpenCreateGroup: () => void;
  onGroupSelect: (group: Group) => void;
}

export const GroupsScreen: React.FC<GroupsScreenProps> = ({ groups, onOpenCreateGroup, onGroupSelect }) => {
  return (
    <div className="p-4">
      <button 
        onClick={onOpenCreateGroup}
        className="w-full flex items-center justify-center p-3 mb-4 bg-green-500 text-white rounded-lg shadow hover:bg-green-600 transition-colors">
        <i className="fa-solid fa-plus mr-2"></i>
        <span className="font-semibold">Create Group</span>
      </button>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Your Groups</h2>
      <div className="divide-y divide-gray-200 bg-white rounded-lg shadow">
        {groups.map(group => (
          <GroupItem key={group.id} group={group} onClick={() => onGroupSelect(group)} />
        ))}
      </div>
    </div>
  );
};
