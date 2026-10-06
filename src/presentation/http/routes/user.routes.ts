import { Router, type RequestHandler } from 'express';
import type { UserController } from '../controllers/user.controller';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import { listUsersQuerySchema, userIdParamsSchema } from '../schemas/user.schema';

export function buildUserRouter(c: UserController, authenticate: RequestHandler): Router {
  const r = Router();
  r.use(authenticate); // everything below is protected
  r.get('/me', c.me); // MUST be declared before '/:id'
  r.get('/', authorize('admin'), validate({ query: listUsersQuerySchema }), c.list);
  r.get('/:id', validate({ params: userIdParamsSchema }), c.getById);
  return r;
}
