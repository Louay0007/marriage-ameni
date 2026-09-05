import { Router } from 'express';
import { resolve } from 'node:path';
import multer from 'multer';
import type { Config } from '../config.js';
import { requireSession } from '../auth/middleware.js';
import type { ContractRepository } from '../repositories/contracts.js';
import { toContractView } from '../repositories/contracts.js';
import type { MessageRepository } from '../repositories/messages.js';
import { storeSignature } from '../services/signatureStorage.js';
import {
  finalizeContract,
  type ContractLifecycle,
} from '../services/finalizeContract.js';

export function contractsRouter(
  config: Config,
  contracts: ContractRepository,
  messages: MessageRepository,
  lifecycle?: ContractLifecycle,
) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxSignatureBytes, files: 1 },
  });
  router.use(requireSession(config));
  router.get('/:id', async (request, response) => {
    if (request.identity!.contractId !== request.params.id)
      return response.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'This session cannot access that contract.',
          requestId: response.locals.requestId,
        },
      });
    const contract = await contracts.findById(request.params.id);
    if (!contract)
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Contract not found.',
          requestId: response.locals.requestId,
        },
      });
    response.json({
      contract: toContractView(
        contract,
        request.identity!.party,
        request.identity!.readOnly,
      ),
      messages: await messages.listRecent(contract.id),
    });
  });
  router.post(
    '/:id/seal',
    upload.single('signature'),
    async (request, response) => {
      if (request.identity!.readOnly)
        return response.status(403).json({
          error: {
            code: 'READ_ONLY',
            message: 'Guest viewers cannot seal signatures.',
            requestId: response.locals.requestId,
          },
        });
      if (request.identity!.contractId !== request.params.id)
        return response.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'This session cannot access that contract.',
            requestId: response.locals.requestId,
          },
        });
      if (!request.file)
        return response.status(400).json({
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'A PNG signature is required.',
            requestId: response.locals.requestId,
          },
        });
      const idempotencyKey = request.header('Idempotency-Key');
      if (!idempotencyKey || !/^[0-9a-f-]{36}$/i.test(idempotencyKey))
        return response.status(400).json({
          error: {
            code: 'INVALID_IDEMPOTENCY_KEY',
            message: 'A valid idempotency key is required.',
            requestId: response.locals.requestId,
          },
        });
      let stored: Awaited<ReturnType<typeof storeSignature>> | undefined;
      try {
        stored = await storeSignature(
          config.storageDir,
          request.params.id,
          request.identity!.party,
          request.file.buffer,
        );
        const sealResult = await contracts.seal(
          request.params.id,
          request.identity!.party,
          stored.relativePath,
          idempotencyKey,
        );
        const contract = sealResult.contract;
        if (!sealResult.created) await stored.remove();
        const party = request.identity!.party;
        const sealedAt = (
          party === 'party_a'
            ? contract.party_a_sealed_at
            : contract.party_b_sealed_at
        )!.toISOString();
        const signatureUrl = `/api/contracts/${contract.id}/signatures/${party}`;
        if (sealResult.created)
          lifecycle?.sealed(contract.id, { party, sealedAt, signatureUrl });
        if (
          sealResult.created &&
          contract.party_a_sealed_at &&
          contract.party_b_sealed_at &&
          lifecycle
        )
          void finalizeContract(
            contract.id,
            config.storageDir,
            contracts,
            lifecycle,
            config.puppeteerExecutablePath,
          );
        return response
          .status(sealResult.created ? 201 : 200)
          .json({ contract: toContractView(contract, party) });
      } catch (error) {
        await stored?.remove();
        const code = error instanceof Error ? error.message : 'SEAL_FAILED';
        return response.status(code === 'ALREADY_SEALED' ? 409 : 400).json({
          error: {
            code,
            message:
              code === 'ALREADY_SEALED'
                ? 'This signature is already sealed.'
                : 'The signature could not be accepted.',
            requestId: response.locals.requestId,
          },
        });
      }
    },
  );
  router.get('/:id/signatures/:party', async (request, response) => {
    if (
      request.identity!.contractId !== request.params.id ||
      !['party_a', 'party_b'].includes(request.params.party)
    )
      return response.sendStatus(403);
    const contract = await contracts.findById(request.params.id);
    const path =
      request.params.party === 'party_a'
        ? contract?.party_a_signature_path
        : contract?.party_b_signature_path;
    if (!path) return response.sendStatus(404);
    return response.sendFile(resolve(config.storageDir, path));
  });
  router.get('/:id/pdf', async (request, response) => {
    if (request.identity!.contractId !== request.params.id)
      return response.sendStatus(403);
    const contract = await contracts.findById(request.params.id);
    if (!contract?.pdf_path) return response.sendStatus(404);
    return response.download(
      resolve(config.storageDir, contract.pdf_path),
      'Louay-and-Ameni-Marriage-Contract.pdf',
    );
  });
  return router;
}
