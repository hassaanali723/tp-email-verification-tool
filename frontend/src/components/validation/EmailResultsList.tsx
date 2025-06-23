'use client';
import React, { useEffect, useState } from 'react';
import { useValidationResultsStore } from '@/store/validation-results-store';
import { useAuth } from '@clerk/nextjs';
import { Card } from '@/components/ui/card';
import EmailDetailsModal from './EmailDetailsModal';

interface EmailResultsListProps {
  fileId: string;
}

const EmailResultsList: React.FC<EmailResultsListProps> = ({ fileId }) => {
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const {
    emails,
    loadingEmails,
    errorEmails,
    fetchEmails,
    filter,
    pagination,
    stats,
    subscribeToUpdates,
    unsubscribeFromUpdates
  } = useValidationResultsStore();
  const { getToken } = useAuth();

  // Effect to fetch emails when filter changes
  useEffect(() => {
    const fetchFilteredEmails = async () => {
      const token = await getToken();
      if (token) {
        await fetchEmails(fileId, 1, filter, token);
      }
    };

    fetchFilteredEmails();
  }, [fileId, filter, fetchEmails, getToken]);

  // Effect to handle real-time updates
  useEffect(() => {
    const setupRealtimeUpdates = async () => {
      if (stats?.status === 'processing') {
        console.log('Setting up real-time updates for email list');
        subscribeToUpdates(fileId, getToken);
      }
    };

    setupRealtimeUpdates();

    return () => {
      console.log('Cleaning up email list SSE connection');
      unsubscribeFromUpdates();
    };
  }, [fileId, stats?.status, getToken, subscribeToUpdates, unsubscribeFromUpdates]);

  const handlePageChange = async (newPage: number) => {
    const token = await getToken();
    if (token) {
      await fetchEmails(fileId, newPage, filter, token);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'deliverable':
        return 'bg-green-100 text-green-700';
      case 'undeliverable':
        return 'bg-red-100 text-red-700';
      case 'risky':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const isProcessing = stats?.status === 'processing';
  const totalEmails = stats?.progress?.total || 0;
  const processedEmails = stats?.progress?.processed || 0;
  const remainingEmails = Math.max(0, totalEmails - processedEmails);

  if (errorEmails) {
    return (
      <Card className="p-4">
        <div className="text-red-500">{errorEmails}</div>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {emails.length === 0 && !isProcessing ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                    No emails found for the selected filter
                  </td>
                </tr>
              ) : (
                <>
                  {/* Processed Emails */}
                  {emails.map((email) => (
                    <tr 
                      key={email.email}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedEmail(email)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {email.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(email.status)}`}>
                          {email.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {email.deliverability_score !== undefined ? `${email.deliverability_score}%` : '-'}
                      </td>
                    </tr>
                  ))}
                  
                  {/* Loading Placeholders for Remaining Emails */}
                  {isProcessing && remainingEmails > 0 && Array.from({ length: Math.min(5, remainingEmails) }).map((_, index) => (
                    <tr key={`placeholder-${index}`} className="animate-pulse">
                      <td className="px-6 py-4">
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-gray-200 rounded w-24"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-gray-200 rounded w-12"></div>
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isProcessing && pagination && pagination.pages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.pages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{((pagination.page - 1) * pagination.limit) + 1}</span> to{' '}
                  <span className="font-medium">
                    {Math.min(pagination.page * pagination.limit, pagination.total)}
                  </span>{' '}
                  of <span className="font-medium">{pagination.total}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  {/* Page numbers */}
                  {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        page === pagination.page
                          ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.pages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Email Details Modal */}
      <EmailDetailsModal
        open={selectedEmail !== null}
        onClose={() => setSelectedEmail(null)}
        emailDetails={selectedEmail}
      />
    </>
  );
};

export default EmailResultsList; 