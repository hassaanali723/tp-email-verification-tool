import { create } from 'zustand';
import { toast } from 'sonner';
import { 
  fetchFiles as fetchFilesApi, 
  fetchFileEmails, 
  startValidationBatch, 
  deleteFile as deleteFileApi,
  fetchValidationStats
} from '@/lib/file-api';
import { authenticatedApiFetch } from '@/lib/api';
import { emitCreditBalanceRefresh } from '@/lib/events';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

interface FileStats {
  deliverable: { count: number };
  undeliverable: {
    count: number;
    categories: {
      invalid_email: number;
      invalid_domain: number;
      rejected_email: number;
      invalid_smtp: number;
    };
  };
  risky: {
    count: number;
    categories: {
      low_quality: number;
      low_deliverability: number;
    };
  };
  unknown: {
    count: number;
    categories: {
      no_connect: number;
      timeout: number;
      unavailable_smtp: number;
      unexpected_error: number;
    };
  };
}

interface FileProgress {
  total: number;
  processed: number;
  percentage: number;
}

export interface File {
  id: string;
  filename: string;
  uploadedAt: string;
  totalEmails: number;
  status: 'unverified' | 'processing' | 'completed';
  emailsReady?: number;
  progress?: FileProgress;
  stats?: FileStats;
  lastUpdated?: string;
}

interface PaginationData {
  total: number;
  page: number;
  pages: number;
}

interface FileListResponse {
  success: boolean;
  data: {
    files: File[];
    pagination: PaginationData;
  };
}

interface FileStore {
  files: File[];
  isLoading: boolean;
  pagination: PaginationData;
  error: string | null;
  fetchFiles: (page?: number, token?: string | null) => Promise<void>;
  startVerification: (fileId: string, token?: string | null, getToken?: () => Promise<string | null>) => Promise<void>;
  updateFileProgress: (fileId: string, progress: FileProgress) => void;
  updateFileStats: (fileId: string, stats: FileStats) => void;
  uploadSuccess: (token?: string | null) => Promise<void>;
  deleteFile: (fileId: string, token?: string | null) => Promise<void>;
}

// Helper: Subscribe to SSE for a fileId
function subscribeToSSE(fileId: string, onUpdate: (stats: any) => void, getToken: () => Promise<string | null>) {
  console.log('Setting up SSE connection for file:', fileId);
  const eventSource = new EventSource(`${API_BASE_URL.replace(/\/$/, '')}/events/${fileId}`);
  
  eventSource.onopen = () => {
    console.log('SSE connection opened for file:', fileId);
  };

  // Listen for all messages
  eventSource.onmessage = async (event) => {
    console.log('Received generic SSE message:', event.data);
    try {
      const data = JSON.parse(event.data);
      console.log('Parsed generic message data:', data);
      await handleValidationUpdate(data, fileId, getToken, onUpdate, eventSource);
    } catch (err) {
      console.error('Error handling generic message:', err);
    }
  };

  // Also keep the specific event listener
  eventSource.addEventListener('validationUpdate', async (event: MessageEvent) => {
    console.log('Received validationUpdate event:', event.data);
    try {
      const data = JSON.parse(event.data);
      console.log('Parsed validationUpdate data:', data);
      await handleValidationUpdate(data, fileId, getToken, onUpdate, eventSource);
    } catch (err) {
      console.error('Error handling validationUpdate:', err);
    }
  });

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    // Try to reconnect on error
    setTimeout(() => {
      console.log('Attempting to reconnect SSE...');
      eventSource.close();
      subscribeToSSE(fileId, onUpdate, getToken);
    }, 5000);
  };

  return eventSource;
}

// Helper function to handle validation updates
async function handleValidationUpdate(
  data: any,
  fileId: string,
  getToken: () => Promise<string | null>,
  onUpdate: (stats: any) => void,
  eventSource: EventSource
) {
  const token = await getToken();
  if (!token) {
    console.error('No token available for stats update');
    return;
  }

  try {
    const stats = await fetchValidationStats(fileId, token);
    console.log('Fetched updated stats:', stats);

    if (stats.success === false) {
      console.error('Error fetching stats:', stats);
      return;
    }

    const statsData = stats.data || stats;
    console.log('Processing stats data:', statsData);
    onUpdate(statsData);

    if (statsData.status === 'completed') {
      console.log('Validation completed, closing SSE connection');
      eventSource.close();
      // Trigger a navbar refresh of credit balance after consumption
      try { emitCreditBalanceRefresh(); } catch {}
    }
  } catch (err) {
    console.error('Error fetching validation stats:', err);
  }
}

export const useFileStore = create<FileStore & { sseConnections: Record<string, EventSource | null>; cleanupSSE: (fileId: string) => void }>((set, get) => ({
  files: [],
  isLoading: false,
  error: null,
  pagination: {
    total: 0,
    page: 1,
    pages: 1
  },
  sseConnections: {},

  fetchFiles: async (page = 1, token?: string | null) => {
    try {
      set({ isLoading: true, error: null });
      const data: FileListResponse = await fetchFilesApi(page, token);
      if (data.success) {
        set({
          files: data.data.files,
          pagination: data.data.pagination,
          isLoading: false
        });

        // Re-establish SSE connections for any processing files
        data.data.files.forEach(file => {
          if (file.status === 'processing' && !get().sseConnections[file.id]) {
            console.log('Re-establishing SSE connection for processing file:', file.id);
            const eventSource = subscribeToSSE(
              file.id,
              (stats) => get().updateFileStats(file.id, stats),
              async () => token || null
            );
            set(state => ({
              sseConnections: { ...state.sseConnections, [file.id]: eventSource }
            }));
          }
        });
      } else {
        set({ error: 'Failed to fetch files', isLoading: false });
      }
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'An error occurred',
        isLoading: false 
      });
    }
  },

  startVerification: async (fileId: string, token?: string | null, getToken?: () => Promise<string | null>) => {
    try {
      set({ error: null });
      if (!token) {
        throw new Error('Authentication required');
      }
      
      // 1. Fetch emails for the file
      const emailListData = await fetchFileEmails(fileId, token);
      const emails = emailListData?.data?.emails || [];
      if (!emails.length) throw new Error('No emails found for this file');

      // 2. Check credits before starting validation
      try {
        console.log('Checking credit sufficiency before validation...');
        const checkRes = await authenticatedApiFetch('/credits/check-sufficient', token, {
          method: 'POST',
          body: JSON.stringify({ requiredCredits: emails.length })
        });
        if (!checkRes.ok) {
          const errText = await checkRes.text();
          throw new Error(errText || `Failed to check credits (${checkRes.status})`);
        }
        const checkJson = await checkRes.json();
        if (!checkJson?.data?.hasSufficientCredits) {
          const shortfall = checkJson?.data?.shortfall ?? emails.length;
          const message = `Insufficient credits. You need ${shortfall} more to verify this file.`;
          try { toast.error(message, { duration: 5000 }); } catch {}
          set({ error: message });
          return; // Do not start validation
        }
      } catch (err) {
        console.error('Credit check failed:', err);
        toast.error(err instanceof Error ? err.message : 'Unable to verify credits');
        return;
      }

      // 3. Call validate-batch
      await startValidationBatch(emails, fileId, token);

      // 4. Optimistically update UI to 'processing'
      set(state => ({
        files: state.files.map(file =>
          file.id === fileId
            ? {
                ...file,
                status: 'processing',
                progress: file.progress || { total: file.totalEmails || 0, processed: 0, percentage: 0 },
                stats: file.stats || {
                  deliverable: { count: 0 },
                  undeliverable: {
                    count: 0,
                    categories: {
                      invalid_email: 0,
                      invalid_domain: 0,
                      rejected_email: 0,
                      invalid_smtp: 0
                    }
                  },
                  risky: {
                    count: 0,
                    categories: {
                      low_quality: 0,
                      low_deliverability: 0
                    }
                  },
                  unknown: {
                    count: 0,
                    categories: {
                      no_connect: 0,
                      timeout: 0,
                      unavailable_smtp: 0,
                      unexpected_error: 0
                    }
                  }
                }
              }
            : file
        )
      }));

      // 5. Subscribe to SSE for real-time updates
      get().cleanupSSE(fileId);
      const eventSource = subscribeToSSE(
        fileId,
        (stats) => get().updateFileStats(fileId, stats),
        getToken || (async () => token)
      );
      set(state => ({
        sseConnections: { ...state.sseConnections, [fileId]: eventSource }
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start verification';
      // Use warn instead of error to avoid Next.js dev overlay for handled/expected errors
      console.warn('Start verification error:', message);
      toast.error(message);
      set({ error: message });
    }
  },

  updateFileProgress: (fileId: string, progress: FileProgress) => {
    set(state => ({
      files: state.files.map(file =>
        file.id === fileId
          ? { ...file, progress }
          : file
      )
    }));
  },

  updateFileStats: (fileId: string, stats: any) => {
    console.log('Updating file stats:', { fileId, stats });
    set(state => ({
      files: state.files.map(file =>
        file.id === fileId
          ? {
              ...file,
              stats: stats.stats || file.stats,
              progress: stats.progress || file.progress,
              status: stats.status || file.status
            }
          : file
      )
    }));
  },

  uploadSuccess: async (token?: string | null) => {
    setTimeout(async () => {
      await get().fetchFiles(1, token);
      toast.success('File uploaded successfully');
    }, 2000);
  },

  deleteFile: async (fileId: string, token?: string | null) => {
    try {
      if (!token) {
        throw new Error('Authentication required');
      }
      const response = await deleteFileApi(fileId, token);
      if (!response.ok) {
        throw new Error('Failed to delete file');
      }
      await get().fetchFiles(get().pagination.page, token);
      toast.success('File deleted successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete file');
    }
  },

  cleanupSSE: (fileId: string) => {
    const conn = get().sseConnections[fileId];
    if (conn) {
      conn.close();
      set(state => {
        const newConns = { ...state.sseConnections };
        delete newConns[fileId];
        return { sseConnections: newConns };
      });
    }
  }
})); 