'use client';
import React from 'react';
import { useValidationResultsStore } from '@/store/validation-results-store';

interface ResultsFiltersProps {
  fileId: string;
}

const statuses = [
  { label: 'All', value: 'all' },
  { label: 'Deliverable', value: 'deliverable' },
  { label: 'Undeliverable', value: 'undeliverable' },
  { label: 'Risky', value: 'risky' },
  { label: 'Unknown', value: 'unknown' },
];

const ResultsFilters: React.FC<ResultsFiltersProps> = ({ fileId }) => {
  const { filter, setFilter } = useValidationResultsStore();

  const handleFilterChange = (value: string) => {
    const apiFilter = value === 'all' ? '' : value;
    setFilter(apiFilter);
  };

  return (
    <div className="flex gap-2">
      {statuses.map((status) => (
        <button
          key={status.value}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            (filter === '' && status.value === 'all') || filter === status.value
              ? 'bg-[#295c51] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-[#295c51] hover:text-white'
          }`}
          onClick={() => handleFilterChange(status.value)}
        >
          {status.label}
        </button>
      ))}
    </div>
  );
};

export default ResultsFilters; 