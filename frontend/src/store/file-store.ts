import { create } from 'zustand';
import { toast } from 'sonner';

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
  fetchFiles: (page?: number) => Promise<void>;
  startVerification: (fileId: string) => Promise<void>;
  updateFileProgress: (fileId: string, progress: FileProgress) => void;
  updateFileStats: (fileId: string, stats: FileStats) => void;
  uploadSuccess: () => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
}

export const useFileStore = create<FileStore>((set, get) => ({
  files: [],
  isLoading: false,
  error: null,
  pagination: {
    total: 0,
    page: 1,
    pages: 1
  },

  fetchFiles: async (page = 1) => {
    try {
      set({ isLoading: true, error: null });
      const response = await fetch(`http://localhost:5000/api/files/?page=${page}`);
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

  startVerification: async (fileId: string) => {
    try {
      set({ error: null });
      const response = await fetch(`http://localhost:5000/api/verify/${fileId}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        // Refresh the file list after starting verification
        get().fetchFiles(get().pagination.page);
      } else {
        set({ error: 'Failed to start verification' });
      }
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to start verification'
      });
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

  updateFileStats: (fileId: string, stats: FileStats) => {
    set(state => ({
      files: state.files.map(file =>
        file.id === fileId
          ? { ...file, stats }
          : file
      )
    }));
  },

  uploadSuccess: async () => {
    // Reset to first page and refresh the list
    await get().fetchFiles(1);
    toast.success('File uploaded successfully');
  },

  deleteFile: async (fileId: string) => {
    try {
      const response = await fetch(`http://localhost:5000/api/files/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      // Refresh the files list after successful deletion
      await get().fetchFiles(get().pagination.page);
      toast.success('File deleted successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete file');
    }
  }
})); 