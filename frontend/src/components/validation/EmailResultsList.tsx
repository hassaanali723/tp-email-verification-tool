'use client';
import React, { useEffect } from 'react';
import { useValidationResultsStore } from '@/store/validation-results-store';
import { useAuth } from '@clerk/nextjs';

interface EmailResultsListProps {
  fileId: string;
}

const EmailResultsList: React.FC<EmailResultsListProps> = ({ fileId }) => {
  const {
    emails,
    loadingEmails,
    errorEmails,
    fetchEmails,
    filter,
    pagination,
  } = useValidationResultsStore();
  const { getToken } = useAuth();

  useEffect(() => {
    let isMounted = true;
    getToken().then(token => {
      if (token && isMounted) fetchEmails(fileId, 1, filter, token);
    });
    return () => { isMounted = false; };
  }, [fileId, filter, fetchEmails, getToken]);

  if (loadingEmails) {
    return <div className="bg-white rounded-xl shadow-sm p-4">Loading emails...</div>;
  }
  if (errorEmails) {
    return <div className="bg-white rounded-xl shadow-sm p-4 text-red-600">{errorEmails}</div>;
  }
  if (!emails.length) {
    return <div className="bg-white rounded-xl shadow-sm p-4 text-gray-500">No emails found.</div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-4 text-sm font-medium text-gray-500">Email</th>
            <th className="text-left py-2 px-4 text-sm font-medium text-gray-500">Status</th>
            <th className="text-left py-2 px-4 text-sm font-medium text-gray-500">Score</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((row, idx) => (
            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
              <td className="py-2 px-4 text-sm">{row.email}</td>
              <td className="py-2 px-4 text-sm capitalize">{row.status}</td>
              <td className="py-2 px-4 text-sm">{row.deliverability_score !== undefined && row.deliverability_score !== null ? row.deliverability_score : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Pagination controls can be added here if needed */}
    </div>
  );
};

export default EmailResultsList; 