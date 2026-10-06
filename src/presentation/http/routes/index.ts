import { Router } from 'express';
import type { Container } from '@/container';
import type { Limiters } from '../middlewares/rate-limit.middleware';
import { buildAuthRouter } from './auth.routes';
import { buildUserRouter } from './user.routes';
import { AuthController } from '../controllers/auth.controller';
import { UserController } from '../controllers/user.controller';
import { createAuthenticate } from '../middlewares/authenticate.middleware';

export function buildApiRouter(c: Container, limiters: Limiters): Router {
  const r = Router();
  r.use('/auth', buildAuthRouter(new AuthController(c), limiters));
  r.use('/users', buildUserRouter(new UserController(c), createAuthenticate(c.tokens)));
  return r;
}
