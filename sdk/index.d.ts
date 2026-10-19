export type AcceptedPayment = { asset: string; networks: string[] };
export type InvoiceCreate = {
  amount: number;
  currency: string;
  customer_email: string;
  customer_name?: string;
  title: string;
  description?: string;
  notes?: string;
  due_date?: string;
  accepted_payments: AcceptedPayment[];
  success_url?: string;
  cancel_url?: string;
  metadata?: Record<string, string>;
};
export type RequestOptions = { idempotencyKey?: string };
export type MonifydOptions = {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
};

export class MonifydError extends Error {
  code: string;
  status: number;
}

export class Monifyd {
  constructor(options: MonifydOptions);
  paymentLinks: {
    create(body: Record<string, unknown>, options?: RequestOptions): Promise<unknown>;
    list(): Promise<unknown>;
  };
  payments: {
    list(): Promise<unknown>;
    get(id: string): Promise<unknown>;
  };
  invoices: {
    create(body: InvoiceCreate, options?: RequestOptions): Promise<Record<string, unknown>>;
    list(options?: { limit?: number; offset?: number }): Promise<{ data: Record<string, unknown>[] }>;
    get(id: string): Promise<Record<string, unknown>>;
    send(id: string): Promise<Record<string, unknown>>;
    cancel(id: string): Promise<Record<string, unknown>>;
  };
}
