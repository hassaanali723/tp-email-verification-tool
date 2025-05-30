import { create } from 'zustand';
import { toast } from 'sonner';
import { apiFetch, authenticatedApiFetch } from '@/lib/api';
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

// Helper: Subscribe to SSE for a fileId (keeping without auth as requested)
function subscribeToSSE(fileId: string, onUpdate: (stats: any) => void, getToken: () => Promise<string | null>) {
  const eventSource = new EventSource(`${API_BASE_URL.replace(/\/$/, '')}/events/${fileId}`);
  eventSource.addEventListener('validationUpdate', async (event: MessageEvent) => {
    try {
      const { fileId: updatedFileId } = JSON.parse(event.data);
      // Get fresh token for each stats request (Clerk auto-refreshes)
      const token = await getToken();
      if (token) {
        const statsRes = await authenticatedApiFetch(`/email-validation/email-validation-stats/${updatedFileId}`, token);
        const stats = await statsRes.json();
        console.log('SSE stats update received:', stats); // Debug log
        onUpdate(stats);
        // If completed, close SSE
        if (stats.status === 'completed') {
          eventSource.close();
        }
      }
    } catch (err) {
      // Optionally handle error
    }
  });
  return eventSource;
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
      const response = token 
        ? await authenticatedApiFetch(`/files/?page=${page}`, token)
        : await apiFetch(`/files/?page=${page}`);
      const data: FileListResponse = await response.json();
      
      if (data.success) {
        set({
          files: data.data.files,
          pagination: data.data.pagination,
          isLoading: false
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
      const emailListRes = await authenticatedApiFetch(`/files/${fileId}/emails`, token);
      const emailListData = await emailListRes.json();
      const emails = emailListData?.data?.emails || [];

      if (!emails.length) throw new Error('No emails found for this file');

      // 2. Call validate-batch
      const batchRes = await authenticatedApiFetch('/email-validation/validate-batch', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, fileId }),
      });
      if (!batchRes.ok) throw new Error('Failed to start validation batch');

      // 3. Optimistically update UI to 'processing'
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

      // 4. Subscribe to SSE for real-time updates
      // Clean up any previous connection
      get().cleanupSSE(fileId);
      const eventSource = subscribeToSSE(fileId, (stats) => {
        get().updateFileStats(fileId, stats);
        // Optionally update status/progress here as well
        if (stats.status === 'completed') {
          get().cleanupSSE(fileId);
        }
      }, getToken || (async () => token));
      set(state => ({
        sseConnections: { ...state.sseConnections, [fileId]: eventSource }
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to start verification' });
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
    // Wait 2 seconds before fetching the file list
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
      
      const response = await authenticatedApiFetch(`/files/${fileId}`, token, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      // Refresh the files list after successful deletion
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