import { useAuth } from '@clerk/nextjs';
import { useFileStore } from '@/store/file-store';

export const useAuthenticatedFileStore = () => {
  const { getToken } = useAuth();
  const store = useFileStore();

  const fetchFiles = async (page?: number) => {
    const token = await getToken();
    return store.fetchFiles(page, token);
  };

  const startVerification = async (fileId: string) => {
    const token = await getToken();
    return store.startVerification(fileId, token, getToken);
  };

  const deleteFile = async (fileId: string) => {
    const token = await getToken();
    return store.deleteFile(fileId, token);
  };

  const uploadSuccess = async () => {
    const token = await getToken();
    return store.uploadSuccess(token);
  };

  return {
    ...store,
    fetchFiles,
    startVerification,
    deleteFile,
    uploadSuccess,
  };
}; 