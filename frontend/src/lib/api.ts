import { useAuth } from '@clerk/nextjs';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export const apiFetch = (endpoint: string, options?: RequestInit) => {
  // Ensure no double slashes
  const url = `${API_BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
  return fetch(url, options);
};

// Authenticated API fetch - pass token from component
export const authenticatedApiFetch = async (endpoint: string, token: string | null, options?: RequestInit) => {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
  
  if (!token) {
    throw new Error('Authentication token is required');
  }
  
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
};