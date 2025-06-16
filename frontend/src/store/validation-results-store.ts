import { create } from 'zustand';
import { fetchValidationStats, fetchEmailList } from '@/lib/validation-api';

export type ValidationStats = {
  fileId: string;
  status: string;
  progress: { total: number; processed: number; percentage: number };
  stats: {
    deliverable: { count: number };
    undeliverable: { count: number };
    risky: { count: number };
    unknown: { count: number };
  };
  lastUpdated: string;
};

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

interface ValidationResultsStore {
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
}

export const useValidationResultsStore = create<ValidationResultsStore>((set) => ({
  stats: null,
  emails: [],
  pagination: { total: 0, page: 1, limit: 50, pages: 1 },
  filter: '',
  loadingStats: false,
  loadingEmails: false,
  errorStats: null,
  errorEmails: null,

  fetchStats: async (fileId, token) => {
    set({ loadingStats: true, errorStats: null });
    try {
      const stats = await fetchValidationStats(fileId, token);
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
})); 