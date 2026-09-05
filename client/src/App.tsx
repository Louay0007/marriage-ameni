import { useEffect, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import type { ContractPayload } from '@marriage/shared';
import { ContractProvider } from './app/ContractProvider';
import { ContractDocument } from './components/ContractDocument';
import { ApiRequestError, exchangeToken, fetchContract } from './lib/api';

function ContractRoute() {
  const { contractId = '' } = useParams();
  const location = useLocation();
  const [payload, setPayload] = useState<ContractPayload | null>(null);
  const [error, setError] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setError(null);
      try {
        const token = new URLSearchParams(location.search).get('key');
        if (token) {
          await exchangeToken(contractId, token);
          window.history.replaceState({}, '', `/c/${contractId}`);
        }
        const result = await fetchContract(contractId);
        if (active) setPayload(result);
      } catch (reason) {
        if (!active) return;
        const unauthorized =
          reason instanceof ApiRequestError &&
          [401, 403].includes(reason.status);
        setError({
          title: unauthorized
            ? 'This link cannot be opened'
            : 'The contract is unavailable',
          message:
            reason instanceof Error ? reason.message : 'Please try again.',
        });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [attempt, contractId, location.search]);

  if (error)
    return (
      <main className="status-page">
        <p>Louay &amp; Ameni</p>
        <h1>{error.title}</h1>
        <span>{error.message}</span>
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          Try again
        </button>
      </main>
    );
  if (!payload)
    return (
      <main className="status-page" aria-busy="true">
        <p>Louay &amp; Ameni</p>
        <h1>Opening your contract…</h1>
      </main>
    );
  return (
    <ContractProvider initial={payload}>
      <ContractDocument />
    </ContractProvider>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/c/:contractId" element={<ContractRoute />} />
      <Route path="*" element={<Navigate to="/c/demo" replace />} />
    </Routes>
  );
}
