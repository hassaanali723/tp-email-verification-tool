import { authenticatedApiFetch } from '@/lib/api';

export async function fetchValidationStats(fileId: string, token: string) {
  try {
    const res = await authenticatedApiFetch(`/email-validation/email-validation-stats/${fileId}`, token);
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Failed to fetch stats: ${res.status} ${res.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }

    // Defensive JSON parsing to avoid "Unexpected end of JSON input"
    const text = await res.text();
    if (!text) throw new Error('Failed to fetch stats: empty response');
    const data = JSON.parse(text);
    return (data as any).data || data; // Handle both wrapped and unwrapped responses
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
      const errorText = await res.text().catch(() => '');
      throw new Error(`Failed to fetch email list: ${res.status} ${res.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }

    const text = await res.text();
    if (!text) throw new Error('Failed to fetch email list: empty response');
    const data = JSON.parse(text);
    return (data as any).data || data; // Handle both wrapped and unwrapped responses
  } catch (e) {
    console.error('Error in fetchEmailList:', e);
    throw e;
  }
}

export async function downloadCSV(fileId: string, status?: string, token?: string): Promise<void> {
  try {
    const params = new URLSearchParams();
    if (status) {
      params.append('status', status);
    }
    
    const url = `/email-validation/download/${fileId}${params.toString() ? `?${params}` : ''}`;
    const response = await authenticatedApiFetch(url, token!);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Download failed: ${response.statusText}`);
    }
    
    // Get the blob data
    const blob = await response.blob();
    
    // Extract filename from response headers or create default
    let filename = 'email_validation_results.csv';
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, '');
      }
    }
    
    // Create download link and trigger download
    const url_obj = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url_obj;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url_obj);
    
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
} 