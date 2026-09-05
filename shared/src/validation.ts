import { z } from 'zod';

export const partySchema = z.enum(['party_a', 'party_b']);

export const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  t: z.number().nonnegative(),
  pressure: z.number().min(0).max(1).optional(),
});

export const strokeBatchSchema = z.object({
  strokeId: z.string().uuid(),
  points: z.array(pointSchema).min(1).max(128),
  final: z.boolean(),
});

export const messageSendSchema = z.object({
  clientId: z.string().uuid(),
  body: z.string().trim().min(1).max(500),
});
