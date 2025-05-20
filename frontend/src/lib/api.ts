const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export const apiFetch = (endpoint: string, options?: RequestInit) => {
  // Ensure no double slashes
  const url = `${API_BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
  return fetch(url, options);
};