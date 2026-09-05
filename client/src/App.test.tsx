import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./lib/socket', () => ({
  createContractSocket: () => ({
    connected: false,
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    io: { on: vi.fn() },
  }),
}));

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          contract: {
            id: '11111111-1111-4111-8111-111111111111',
            authenticatedParty: 'party_a',
            readOnly: false,
            partyAName: 'Louay',
            partyBName: 'Ameni',
            partyASealedAt: null,
            partyBSealedAt: null,
            partyASignatureUrl: null,
            partyBSignatureUrl: null,
            finalizationStatus: 'pending',
            pdfUrl: null,
          },
          messages: [],
        }),
      }),
    );
  });

  it('loads the authenticated contract experience', async () => {
    render(
      <MemoryRouter
        initialEntries={['/c/11111111-1111-4111-8111-111111111111']}
      >
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Our Marriage Contract' }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Louay's editable signature pad"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Ameni's read-only signature pad"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Seal signature' }),
    ).toBeDisabled();
  });
});
