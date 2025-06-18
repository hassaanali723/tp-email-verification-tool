import { apiFetch, authenticatedApiFetch } from '@/lib/api';

export async function fetchFiles(page: number, token?: string | null) {
  const endpoint = `/files/?page=${page}`;
  const response = token
    ? await authenticatedApiFetch(endpoint, token)
    : await apiFetch(endpoint);
  return response.json();
}

export async function fetchFileEmails(fileId: string, token: string) {
  const endpoint = `/files/${fileId}/emails`;
  const response = await authenticatedApiFetch(endpoint, token);
  return response.json();
}

export async function startValidationBatch(emails: string[], fileId: string, token: string) {
  const endpoint = '/email-validation/validate-batch';
  const response = await authenticatedApiFetch(endpoint, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails, fileId }),
  });
  return response.json();
}

export async function deleteFile(fileId: string, token: string) {
  const endpoint = `/files/${fileId}`;
  const response = await authenticatedApiFetch(endpoint, token, {
    method: 'DELETE',
  });
  return response;
}

export async function fetchValidationStats(fileId: string, token: string) {
  const endpoint = `/email-validation/email-validation-stats/${fileId}`;
  const response = await authenticatedApiFetch(endpoint, token);
  return response.json();
} 