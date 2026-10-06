import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';

export function buildHealthRouter(): Router {
  const r = Router();
  const c = new HealthController();
  r.get('/', c.check);
  return r;
}
