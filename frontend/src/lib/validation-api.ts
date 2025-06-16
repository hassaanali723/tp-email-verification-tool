import { authenticatedApiFetch } from '@/lib/api';

export async function fetchValidationStats(fileId: string, token: string) {
  const res = await authenticatedApiFetch(`/email-validation/email-validation-stats/${fileId}`, token);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function fetchEmailList(fileId: string, page = 1, limit = 50, status = '', token: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.append('status', status);
  const res = await authenticatedApiFetch(`/email-validation/email-list/${fileId}?${params.toString()}`, token);
  if (!res.ok) throw new Error('Failed to fetch email list');
  return res.json();
} 