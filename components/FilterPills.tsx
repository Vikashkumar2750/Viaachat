
import React from 'react';

const Pill: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 text-sm font-bold rounded-full transition-all active:scale-95 ${
        active 
          ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' 
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
};

interface FilterPillsProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

export const FilterPills: React.FC<FilterPillsProps> = ({ activeFilter, onFilterChange }) => {
  const filters = ['All', 'Unread', 'Groups'];

  return (
    <div className="px-4 py-3 flex space-x-2 overflow-x-auto no-scrollbar">
      {filters.map((filter) => (
        <Pill
          key={filter}
          label={filter}
          active={activeFilter === filter}
          onClick={() => onFilterChange(filter)}
        />
      ))}
    </div>
  );
};
