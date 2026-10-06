import type { Request, Response } from 'express';
import { sendSuccess } from '../responses';

export class HealthController {
  check = (req: Request, res: Response): void => {
    sendSuccess(req, res, { messageKey: 'HEALTH_OK', data: { status: 'ok', uptimeSeconds: Math.round(process.uptime()) } });
  };
}
