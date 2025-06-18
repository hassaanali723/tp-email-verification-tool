import { create } from 'zustand';
import { fetchValidationStats, fetchEmailList } from '@/lib/validation-api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

interface ValidationProgress {
  total: number;
  processed: number;
  percentage: number;
}

interface ValidationCategories {
  count: number;
  categories?: {
    [key: string]: number;
  };
}

interface ValidationStats {
  fileId: string;
  status: 'processing' | 'completed' | 'failed';
  progress: ValidationProgress;
  stats: {
    deliverable: ValidationCategories;
    undeliverable: ValidationCategories;
    risky: ValidationCategories;
    unknown: ValidationCategories;
  };
  lastUpdated: string;
}

export type EmailResult = {
  email: string;
  status: string;
  is_valid: boolean;
  risk_level?: string;
  deliverability_score?: number;
  details?: any;
};

export type EmailListResponse = {
  emails: EmailResult[];
  pagination: { total: number; page: number; limit: number; pages: number };
};

interface ValidationResultsState {
  stats: ValidationStats | null;
  emails: EmailResult[];
  pagination: EmailListResponse['pagination'];
  filter: string;
  loadingStats: boolean;
  loadingEmails: boolean;
  errorStats: string | null;
  errorEmails: string | null;
  fetchStats: (fileId: string, token: string) => Promise<void>;
  fetchEmails: (fileId: string, page?: number, filter?: string, token?: string) => Promise<void>;
  setFilter: (filter: string) => void;
  subscribeToUpdates: (fileId: string, getToken: () => Promise<string | null>) => void;
  unsubscribeFromUpdates: () => void;
}

// Helper: Subscribe to SSE for a fileId
function subscribeToSSE(
  fileId: string, 
  onUpdate: (data: any) => void, 
  getTokenFn: () => Promise<string | null>,
  onError: (error: Error) => void
) {
  console.log('Setting up SSE connection for validation results:', fileId);
  const eventSource = new EventSource(`${API_BASE_URL.replace(/\/$/, '')}/events/${fileId}`);
  
  eventSource.onopen = () => {
    console.log('SSE connection opened for validation results:', fileId);
  };

  eventSource.addEventListener('validationUpdate', async (event: MessageEvent) => {
    console.log('Received validation update:', event.data);
    try {
      const data = JSON.parse(event.data);
      console.log('Parsed validation update data:', data);
      
      // Get fresh token for each request
      const token = await getTokenFn();
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Fetch fresh stats and email list
      const [statsResponse, emailsResponse] = await Promise.all([
        fetchValidationStats(fileId, token),
        fetchEmailList(fileId, 1, 50, '', token)
      ]);

      console.log('Fetched fresh validation stats:', statsResponse);
      console.log('Fetched fresh email list:', emailsResponse);
      
      onUpdate({
        stats: statsResponse.data || statsResponse,
        emails: emailsResponse
      });
    } catch (err) {
      console.error('Error handling validation update:', err);
      onError(err as Error);
      
      // If we get an auth error, close the connection
      if (err instanceof Error && (
        err.message.includes('401') || 
        err.message.includes('Unauthorized') ||
        err.message.includes('authentication')
      )) {
        console.log('Authentication error, closing SSE connection');
        eventSource.close();
      }
    }
  });

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    onError(new Error('SSE connection error'));
  };

  return eventSource;
}

export const useValidationResultsStore = create<ValidationResultsState & { sseConnection: EventSource | null }>((set, get) => ({
  stats: null,
  emails: [],
  pagination: { total: 0, page: 1, limit: 50, pages: 1 },
  filter: '',
  loadingStats: false,
  loadingEmails: false,
  errorStats: null,
  errorEmails: null,
  sseConnection: null,

  fetchStats: async (fileId, token) => {
    set({ loadingStats: true, errorStats: null });
    try {
      const response = await fetchValidationStats(fileId, token);
      const stats = response.data || response;
      set({ stats, loadingStats: false });
    } catch (e: any) {
      set({ errorStats: e.message || 'Failed to fetch stats', loadingStats: false });
    }
  },

  fetchEmails: async (fileId, page = 1, filter = '', token) => {
    set({ loadingEmails: true, errorEmails: null });
    try {
      const res = await fetchEmailList(fileId, page, 50, filter, token!);
      set({ emails: res.emails, pagination: res.pagination, loadingEmails: false });
    } catch (e: any) {
      set({ errorEmails: e.message || 'Failed to fetch emails', loadingEmails: false });
    }
  },

  setFilter: (filter) => set({ filter }),

  subscribeToUpdates: (fileId, getTokenFn) => {
    // Cleanup any existing connection
    get().unsubscribeFromUpdates();

    // Create new SSE connection
    const eventSource = subscribeToSSE(
      fileId,
      (data) => {
        console.log('Updating validation data:', data);
        
        // Update both stats and emails
        set({ 
          stats: data.stats,
          emails: data.emails.emails,
          pagination: data.emails.pagination,
          errorStats: null,
          errorEmails: null
        });
        
        // If validation is complete, close the connection
        if (data.stats.status === 'completed') {
          get().unsubscribeFromUpdates();
        }
      },
      getTokenFn,
      (error) => {
        // Handle errors
        console.error('SSE error:', error);
        set({ 
          errorStats: error.message || 'Connection error',
          errorEmails: error.message || 'Connection error'
        });
      }
    );

    set({ sseConnection: eventSource });
  },

  unsubscribeFromUpdates: () => {
    const connection = get().sseConnection;
    if (connection) {
      console.log('Closing SSE connection for validation results');
      connection.close();
      set({ sseConnection: null });
    }
  },
})); 