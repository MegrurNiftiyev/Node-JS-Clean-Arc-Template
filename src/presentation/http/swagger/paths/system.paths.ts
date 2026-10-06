import { registry, jsonResponse } from '../registry';
import { successEnvelope } from '../../schemas/response.schema';
import { z } from '../../schemas/zod';

registry.registerPath({
  method: 'get',
  path: `/health`,
  tags: ['System'],
  summary: 'Health check',
  responses: {
    200: jsonResponse(
      successEnvelope(z.object({ status: z.string(), uptimeSeconds: z.number() }), 'HealthResponse'),
      'Health ok'
    ),
  },
});
