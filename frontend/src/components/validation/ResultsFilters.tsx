'use client';
import React from 'react';
import { useValidationResultsStore } from '@/store/validation-results-store';

interface ResultsFiltersProps {
  fileId: string;
}

const statuses = [
  { label: 'All', value: '' },
  { label: 'Deliverable', value: 'deliverable' },
  { label: 'Undeliverable', value: 'undeliverable' },
  { label: 'Risky', value: 'risky' },
  { label: 'Unknown', value: 'unknown' },
];

const ResultsFilters: React.FC<ResultsFiltersProps> = ({ fileId }) => {
  const { filter, setFilter } = useValidationResultsStore();
  return (
    <div className="flex gap-2">
      {statuses.map((status) => (
        <button
          key={status.value}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            filter === status.value
              ? 'bg-[#295c51] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-[#295c51] hover:text-white'
          }`}
          onClick={() => setFilter(status.value)}
        >
          {status.label}
        </button>
      ))}
    </div>
  );
};

export default ResultsFilters; 