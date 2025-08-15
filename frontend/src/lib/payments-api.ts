import { authenticatedApiFetch } from './api';

export interface PaymentsConfig {
  success: boolean;
  publishableKey: string;
  pricePerCreditCents: number;
  currency: string;
}

export async function getPaymentsConfig(token: string | null): Promise<PaymentsConfig> {
  const res = await authenticatedApiFetch('/api/payments/config', token, { method: 'GET' });
  if (!res.ok) throw new Error(`Failed to load payments config (${res.status})`);
  return res.json();
}

export async function createCheckoutSession(token: string | null, credits: number, mode: 'payg' | 'subscription' = 'payg'): Promise<{ success: boolean; url: string }>{
  const res = await authenticatedApiFetch('/api/payments/create-checkout-session', token, {
    method: 'POST',
    body: JSON.stringify({ credits, mode })
  });
  if (!res.ok) throw new Error(`Failed to create checkout session (${res.status})`);
  return res.json();
}

export interface CreditBalanceResponse {
  success: boolean;
  data: { balance: number };
}

export async function fetchCreditBalance(token: string | null): Promise<number> {
  const res = await authenticatedApiFetch('/credits/balance', token, { method: 'GET' });
  if (!res.ok) throw new Error(`Failed to fetch credit balance (${res.status})`);
  const json = (await res.json()) as CreditBalanceResponse;
  return json?.data?.balance ?? 0;
}

export interface CreditTransaction {
  amount: number;
  type: string;
  reference?: string;
  description?: string;
  createdAt?: string;
}

export interface CreditHistoryResponse {
  success: boolean;
  data: {
    items?: CreditTransaction[];
    transactions?: CreditTransaction[];
    total?: number;
  } | CreditTransaction[];
}

export async function fetchRecentCreditTransactions(token: string | null, limit: number = 5): Promise<CreditTransaction[]> {
  const res = await authenticatedApiFetch(`/credits/history?limit=${encodeURIComponent(String(limit))}`, token, { method: 'GET' });
  if (!res.ok) throw new Error(`Failed to fetch credit history (${res.status})`);
  const json = (await res.json()) as CreditHistoryResponse;
  // Handle both array and object-based responses
  if (Array.isArray(json?.data)) return json.data as CreditTransaction[];
  const obj = json?.data as any;
  return obj?.items || obj?.transactions || [];
}

