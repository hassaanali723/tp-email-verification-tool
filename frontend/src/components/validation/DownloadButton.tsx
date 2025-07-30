'use client';
import React, { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useValidationResultsStore } from '@/store/validation-results-store';
import { downloadCSV } from '@/lib/validation-api';

interface DownloadButtonProps {
  fileId: string;
}

const DownloadButton: React.FC<DownloadButtonProps> = ({ fileId }) => {
  const { getToken } = useAuth();
  const { filter } = useValidationResultsStore();
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      setError(null);
      
      // Get authentication token
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Use current filter state - empty string means 'all'
      const statusFilter = filter || undefined;
      
      // Call download function
      await downloadCSV(fileId, statusFilter, token);
      
    } catch (err) {
      console.error('Download error:', err);
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const getFilterLabel = () => {
    if (!filter) return 'All';
    return filter.charAt(0).toUpperCase() + filter.slice(1);
  };

  return (
    <div className="relative">
      <button 
        onClick={handleDownload}
        disabled={isDownloading}
        className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
          isDownloading 
            ? 'bg-gray-400 text-white cursor-not-allowed'
            : 'bg-[#295c51] text-white hover:bg-[#1e453c]'
        }`}
      >
        {isDownloading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle 
                className="opacity-25" 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="currentColor" 
                strokeWidth="4"
                fill="none"
              />
              <path 
                className="opacity-75" 
                fill="currentColor" 
                d="m12 2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8z"
              />
            </svg>
            Downloading...
          </span>
        ) : (
          `Download CSV (${getFilterLabel()})`
        )}
      </button>
      
      {error && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-red-100 border border-red-300 rounded text-red-700 text-xs whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
};

export default DownloadButton; 