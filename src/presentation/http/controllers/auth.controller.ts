import type { Request, Response } from 'express';
import type { Container } from '@/container';
import { AppError } from '@/shared/errors';
import { COOKIE_NAMES } from '@/config/constants';
import type { AuthResult, AuthTokens, ClientMeta } from '@/application/dto/auth.dto';
import { sendSuccess } from '../responses';
import { clearAuthCookies, setAuthCookies } from '../cookies/auth-cookies';
import { ctxOf } from '../middlewares/client-context.middleware';
import { getBody, } from '../middlewares/validate.middleware';
import type { ChangePasswordBody, ForgotPasswordBody, LoginBody, LogoutBody, RefreshBody, RegisterBody, VerifyOtpBody } from '../schemas/auth.schema';

export class AuthController {
  constructor(private readonly c: Container) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const body = getBody<RegisterBody>(req);
    const result = await this.c.useCases.register.execute({ ...body, meta: this.meta(req) });
    sendSuccess(req, res, { status: 201, messageKey: 'AUTH_REGISTERED', data: this.authPayload(req, res, result) });
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const body = getBody<LoginBody>(req);
    const result = await this.c.useCases.login.execute({ ...body, meta: this.meta(req) });
    sendSuccess(req, res, { messageKey: 'AUTH_LOGGED_IN', data: this.authPayload(req, res, result) });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const token = this.refreshTokenFrom(req, getBody<RefreshBody>(req));
    if (!token) throw new AppError('AUTH_REFRESH_TOKEN_INVALID');
    const tokens = await this.c.useCases.refresh.execute(token);
    sendSuccess(req, res, { messageKey: 'AUTH_TOKENS_REFRESHED', data: this.tokensPayload(req, res, tokens) });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.c.useCases.logout.execute(this.refreshTokenFrom(req, getBody<LogoutBody>(req)));
    if (ctxOf(req).platform === 'web') clearAuthCookies(res, this.c.env);
    sendSuccess(req, res, { messageKey: 'AUTH_LOGGED_OUT', data: null });
  };

  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const { email } = getBody<ForgotPasswordBody>(req);
    const r = await this.c.useCases.forgotPassword.execute({ email });
    const expose = this.c.env.OTP_EXPOSE_IN_RESPONSE && r.code !== null; // DEV ONLY flag (boot fails in production)
    sendSuccess(req, res, { messageKey: 'AUTH_OTP_SENT', data: { expiresInSeconds: r.expiresInSeconds, ...(expose ? { otp: r.code } : {}) } });
  };

  verifyOtp = async (req: Request, res: Response): Promise<void> => {
    const r = await this.c.useCases.verifyOtp.execute(getBody<VerifyOtpBody>(req));
    sendSuccess(req, res, { messageKey: 'AUTH_OTP_VERIFIED', data: r }); // { resetToken, expiresInSeconds } for BOTH platforms
  };

  changePassword = async (req: Request, res: Response): Promise<void> => {
    await this.c.useCases.changePassword.execute(getBody<ChangePasswordBody>(req));
    if (ctxOf(req).platform === 'web') clearAuthCookies(res, this.c.env);
    sendSuccess(req, res, { messageKey: 'AUTH_PASSWORD_CHANGED', data: null });
  };

  // ---- helpers ----
  private meta(req: Request): ClientMeta {
    return { platform: ctxOf(req).platform, userAgent: req.header('user-agent') ?? null };
  }

  /** web → tokens only in HttpOnly cookies (body gets NO tokens). mobile → tokens in body. */
  private tokensPayload(req: Request, res: Response, tokens: AuthTokens): { tokens: AuthTokens } | null {
    if (ctxOf(req).platform === 'web') {
      setAuthCookies(res, this.c.env, tokens);
      return null;
    }
    return { tokens };
  }

  private authPayload(req: Request, res: Response, r: AuthResult): { user: AuthResult['user']; tokens?: AuthTokens } {
    const t = this.tokensPayload(req, res, r.tokens);
    return t ? { user: r.user, tokens: t.tokens } : { user: r.user };
  }

  private refreshTokenFrom(req: Request, body: RefreshBody): string | undefined {
    return ctxOf(req).platform === 'web'
      ? (req.cookies as Record<string, string | undefined> | undefined)?.[COOKIE_NAMES.refresh]
      : body?.refreshToken;
  }
}
