import { authenticatedApiFetch } from '@/lib/api';

export async function fetchValidationStats(fileId: string, token: string) {
  try {
    const res = await authenticatedApiFetch(`/email-validation/email-validation-stats/${fileId}`, token);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `Failed to fetch stats: ${res.status} ${res.statusText}${errorText ? ` - ${errorText}` : ''}`
      );
    }
    
    const data = await res.json();
    return data.data || data; // Handle both wrapped and unwrapped responses
  } catch (e) {
    console.error('Error in fetchValidationStats:', e);
    throw e;
  }
}

export async function fetchEmailList(fileId: string, page = 1, limit = 50, status = '', token: string) {
  try {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.append('status', status);
    
    const res = await authenticatedApiFetch(`/email-validation/email-list/${fileId}?${params.toString()}`, token);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `Failed to fetch email list: ${res.status} ${res.statusText}${errorText ? ` - ${errorText}` : ''}`
      );
    }
    
    const data = await res.json();
    return data.data || data; // Handle both wrapped and unwrapped responses
  } catch (e) {
    console.error('Error in fetchEmailList:', e);
    throw e;
  }
} 