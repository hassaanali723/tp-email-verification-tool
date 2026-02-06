import { authenticatedApiFetch } from './api';

export interface PaymentsConfig {
  success: boolean;
  publishableKey: string;
  pricePerCreditCents: number;
  currency: string;
}

// Simple in-flight cache so multiple components calling fetchCreditBalance
// at the same time (e.g. navbar + dashboard) only trigger a single request.
let creditBalanceInFlight: Promise<number> | null = null;

export async function getPaymentsConfig(token: string | null): Promise<PaymentsConfig> {
  // Base URL is expected to include /api, so endpoints here should not
  const res = await authenticatedApiFetch('/payments/config', token, { method: 'GET' });
  if (!res.ok) throw new Error(`Failed to load payments config (${res.status})`);
  return res.json();
}

export async function createCheckoutSession(token: string | null, credits: number, mode: 'payg' | 'subscription' = 'payg'): Promise<{ success: boolean; url: string }>{
  const res = await authenticatedApiFetch('/payments/create-checkout-session', token, {
    method: 'POST',
    body: JSON.stringify({ credits, mode })
  });
  if (!res.ok) throw new Error(`Failed to create checkout session (${res.status})`);
  return res.json();
}

// Subscription APIs
export interface SubscriptionStatus {
  planType: 'trial' | 'payg' | 'subscription';
  status?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  creditsPerMonth?: number | null;
  subscriptionId?: string | null;
  balance?: number;
}

export async function fetchSubscription(token: string | null): Promise<SubscriptionStatus> {
  const res = await authenticatedApiFetch('/payments/subscription', token, { method: 'GET' });
  if (!res.ok) throw new Error(`Failed to fetch subscription (${res.status})`);
  const json = await res.json();
  return json?.data as SubscriptionStatus;
}

export interface BillingItem {
  type: 'purchase' | 'trial' | 'refund';
  amount: number;
  reference?: string;
  description?: string;
  timestamp?: string;
}

export async function fetchBillingHistory(token: string | null, limit: number = 50): Promise<BillingItem[]> {
  const res = await authenticatedApiFetch(`/payments/billing-history?limit=${encodeURIComponent(String(limit))}`, token, { method: 'GET' });
  if (!res.ok) throw new Error(`Failed to fetch billing history (${res.status})`);
  const json = await res.json();
  return (json?.data?.items || []) as BillingItem[];
}

export async function cancelSubscription(token: string | null): Promise<{ success: boolean }>{
  const res = await authenticatedApiFetch('/payments/cancel-subscription', token, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to cancel subscription (${res.status})`);
  return res.json();
}

export async function cancelSubscriptionNow(token: string | null): Promise<{ success: boolean }>{
  const res = await authenticatedApiFetch('/payments/cancel-subscription-now', token, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to cancel subscription now (${res.status})`);
  return res.json();
}

export async function resumeSubscription(token: string | null): Promise<{ success: boolean }>{
  const res = await authenticatedApiFetch('/payments/resume-subscription', token, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to resume subscription (${res.status})`);
  return res.json();
}

export interface InvoiceItem {
  id: string;
  number?: string;
  status?: string;
  amountDue?: number;
  currency?: string;
  created?: string | null;
  hostedInvoiceUrl?: string | null;
  invoicePdf?: string | null;
}

export async function fetchInvoices(token: string | null): Promise<InvoiceItem[]> {
  const res = await authenticatedApiFetch('/payments/invoices', token, { method: 'GET' });
  if (!res.ok) throw new Error(`Failed to load invoices (${res.status})`);
  const json = await res.json();
  return (json?.data || []) as InvoiceItem[];
}

// Support API
export interface SupportTicket {
  _id: string;
  name: string;
  email: string;
  problem: string;
  imageUrl?: string;
  status: 'open' | 'closed';
  createdAt?: string;
}

export async function submitSupportTicket(token: string | null, data: { name: string; email: string; problem: string; imageFile?: File | null }): Promise<SupportTicket> {
  if (!token) throw new Error('Authentication token is required');
  const form = new FormData();
  form.append('name', data.name);
  form.append('email', data.email);
  form.append('problem', data.problem);
  if (data.imageFile) form.append('image', data.imageFile);

  const url = `${(process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '')}/support/submit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Failed to submit ticket (${res.status})`);
  const json = await res.json();
  return json?.data as SupportTicket;
}

export async function fetchMyTickets(token: string | null): Promise<SupportTicket[]> {
  const res = await authenticatedApiFetch('/support/my', token, { method: 'GET' });
  if (!res.ok) throw new Error(`Failed to fetch tickets (${res.status})`);
  const json = await res.json();
  return (json?.data || []) as SupportTicket[];
}

export async function downloadCreditReport(token: string | null): Promise<Blob> {
  const urlBase = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');
  if (!token) throw new Error('Authentication token is required');
  const res = await fetch(`${urlBase}/credits/report`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to download report (${res.status})`);
  return res.blob();
}

export interface CreditBalanceResponse {
  success: boolean;
  data: { balance: number };
}

export async function fetchCreditBalance(token: string | null): Promise<number> {
  if (!token) {
    throw new Error('Authentication token is required');
  }

  // If a request is already in-flight, reuse it so that multiple
  // components mounting at once do not hammer the backend or cause
  // concurrent initialization races for new-user trial credits.
  if (!creditBalanceInFlight) {
    creditBalanceInFlight = (async () => {
      const res = await authenticatedApiFetch('/credits/balance', token, { method: 'GET' });
      if (!res.ok) throw new Error(`Failed to fetch credit balance (${res.status})`);
      const json = (await res.json()) as CreditBalanceResponse;
      return json?.data?.balance ?? 0;
    })();
  }

  try {
    return await creditBalanceInFlight;
  } finally {
    // Allow future calls to trigger a fresh request if needed.
    creditBalanceInFlight = null;
  }
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

export async function fetchRecentCreditTransactions(token: string | null, limit: number = 5, groupedByFile: boolean = true): Promise<CreditTransaction[]> {
  const groupParam = groupedByFile ? '&group=by_file' : '';
  const res = await authenticatedApiFetch(`/credits/history?limit=${encodeURIComponent(String(limit))}${groupParam}`, token, { method: 'GET' });
  if (!res.ok) throw new Error(`Failed to fetch credit history (${res.status})`);
  const json = (await res.json()) as CreditHistoryResponse;
  // Handle both array and object-based responses
  if (Array.isArray(json?.data)) return json.data as CreditTransaction[];
  const obj = json?.data as any;
  return obj?.items || obj?.transactions || [];
}

