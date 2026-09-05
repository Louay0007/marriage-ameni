import type { ApiError, ContractPayload, ContractView } from '@marriage/shared';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      response.status,
      body?.error.code ?? 'REQUEST_FAILED',
      body?.error.message ?? 'The request failed.',
    );
  }
  return response.json() as Promise<T>;
}

export function exchangeToken(contractId: string, token: string) {
  return request<{ contract: ContractView }>('/api/auth/exchange', {
    method: 'POST',
    body: JSON.stringify({ contractId, token }),
  });
}

export function fetchContract(contractId: string) {
  return request<ContractPayload>(
    `/api/contracts/${encodeURIComponent(contractId)}`,
  );
}

export async function sealContract(
  contractId: string,
  signature: Blob,
  idempotencyKey: string,
) {
  const form = new FormData();
  form.append('signature', signature, 'signature.png');
  const response = await fetch(
    `/api/contracts/${encodeURIComponent(contractId)}/seal`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: form,
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      response.status,
      body?.error.code ?? 'SEAL_FAILED',
      body?.error.message ?? 'The signature could not be sealed.',
    );
  }
  return response.json() as Promise<{ contract: ContractView }>;
}
