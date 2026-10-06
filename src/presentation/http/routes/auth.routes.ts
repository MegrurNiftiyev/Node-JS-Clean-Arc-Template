import { Router } from 'express';
import type { AuthController } from '../controllers/auth.controller';
import type { Limiters } from '../middlewares/rate-limit.middleware';
import { validate } from '../middlewares/validate.middleware';
import { changePasswordBodySchema, forgotPasswordBodySchema, loginBodySchema, logoutBodySchema, refreshBodySchema, registerBodySchema, verifyOtpBodySchema } from '../schemas/auth.schema';

export function buildAuthRouter(c: AuthController, l: Limiters): Router {
  const r = Router();
  r.use(l.auth);
  r.post('/register', validate({ body: registerBodySchema }), c.register);
  r.post('/login', validate({ body: loginBodySchema }), c.login);
  r.post('/refresh', validate({ body: refreshBodySchema }), c.refresh);
  r.post('/logout', validate({ body: logoutBodySchema }), c.logout);
  r.post('/forgot-password', l.otp, validate({ body: forgotPasswordBodySchema }), c.forgotPassword);
  r.post('/verify-otp', l.otp, validate({ body: verifyOtpBodySchema }), c.verifyOtp);
  r.post('/change-password', validate({ body: changePasswordBodySchema }), c.changePassword);
  return r;
}
