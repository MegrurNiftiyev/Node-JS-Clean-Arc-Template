import type { Request, Response } from 'express';
import type { Container } from '@/container';
import { sendSuccess } from '../responses';
import { getParams, getQuery } from '../middlewares/validate.middleware';
import type { ListUsersQuery, UserIdParams } from '../schemas/user.schema';
import { AppError } from '@/shared/errors';

export class UserController {
  constructor(private readonly c: Container) {}

  private getRequester(req: Request) {
    if (!req.auth) throw new AppError('AUTH_TOKEN_MISSING');
    return req.auth;
  }

  me = async (req: Request, res: Response): Promise<void> => {
    const auth = this.getRequester(req);
    const user = await this.c.useCases.getMe.execute(auth.userId);
    sendSuccess(req, res, { messageKey: 'USER_FETCHED', data: { user } });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const auth = this.getRequester(req);
    const params = getParams<UserIdParams>(req);
    const user = await this.c.useCases.getUserById.execute({ requester: { id: auth.userId, role: auth.role }, targetId: params.id });
    sendSuccess(req, res, { messageKey: 'USER_FETCHED', data: { user } });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const auth = this.getRequester(req);
    const query = getQuery<ListUsersQuery>(req);
    const result = await this.c.useCases.listUsers.execute({ requester: { id: auth.userId, role: auth.role }, page: query.page, limit: query.limit });
    sendSuccess(req, res, { messageKey: 'USERS_FETCHED', data: { items: result.items }, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
  };
}
