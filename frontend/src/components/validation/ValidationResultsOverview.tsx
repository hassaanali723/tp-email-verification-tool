'use client';
import React, { useEffect } from 'react';
import { useValidationResultsStore } from '@/store/validation-results-store';
import { useAuth } from '@clerk/nextjs';

interface ValidationResultsOverviewProps {
  fileId: string;
}

const ValidationResultsOverview: React.FC<ValidationResultsOverviewProps> = ({ fileId }) => {
  const { stats, loadingStats, errorStats, fetchStats } = useValidationResultsStore();
  const { getToken } = useAuth();

  useEffect(() => {
    let isMounted = true;
    getToken().then(token => {
      if (token && isMounted) fetchStats(fileId, token);
    });
    return () => { isMounted = false; };
  }, [fileId, fetchStats, getToken]);

  if (loadingStats) {
    return <div className="bg-white rounded-xl shadow-sm p-6">Loading stats...</div>;
  }
  if (errorStats) {
    return <div className="bg-white rounded-xl shadow-sm p-6 text-red-600">{errorStats}</div>;
  }
  if (!stats) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-6">
      {/* Circular progress */}
      <div className="flex flex-col items-center">
        <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center text-2xl font-bold text-gray-500">
          {stats.progress?.percentage ?? 0}%
        </div>
        <div className="mt-2 text-sm text-gray-500">Progress</div>
      </div>
      {/* Stats */}
      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex flex-col items-center">
          <span className="text-lg font-semibold text-green-700">{stats.stats?.deliverable?.count ?? 0}</span>
          <span className="text-xs text-green-600">Deliverable</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-lg font-semibold text-red-700">{stats.stats?.undeliverable?.count ?? 0}</span>
          <span className="text-xs text-red-600">Undeliverable</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-lg font-semibold text-yellow-700">{stats.stats?.risky?.count ?? 0}</span>
          <span className="text-xs text-yellow-600">Risky</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-lg font-semibold text-gray-700">{stats.stats?.unknown?.count ?? 0}</span>
          <span className="text-xs text-gray-600">Unknown</span>
        </div>
      </div>
    </div>
  );
};

export default ValidationResultsOverview; 