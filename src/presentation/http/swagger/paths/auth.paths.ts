import { API_BASE_PATH } from '@/config/constants';
import { registry, clientHeadersSchema, errorResponse, jsonResponse } from '../registry';
import { z } from '../../schemas/zod';
import { changePasswordBodySchema, forgotPasswordBodySchema, loginBodySchema, logoutBodySchema, refreshBodySchema, registerBodySchema, verifyOtpBodySchema } from '../../schemas/auth.schema';
import { publicUserSchema, successEnvelope, tokensSchema } from '../../schemas/response.schema';

const authData = z.object({ user: publicUserSchema, tokens: tokensSchema.optional().openapi({ description: 'Present only when X-Platform=mobile. Web receives HttpOnly cookies instead.' }) });
const tokensData = z.object({ tokens: tokensSchema.optional().openapi({ description: 'Present only when X-Platform=mobile.' }) });
const forgotPasswordData = z.object({ expiresInSeconds: z.number(), otp: z.string().optional() });
const verifyOtpData = z.object({ resetToken: z.string(), expiresInSeconds: z.number() });

registry.registerPath({
  method: 'post',
  path: `${API_BASE_PATH}/auth/register`,
  tags: ['Auth'],
  summary: 'Register a new user (role is always "user")',
  request: { headers: clientHeadersSchema, body: { required: true, content: { 'application/json': { schema: registerBodySchema } } } },
  responses: {
    201: jsonResponse(successEnvelope(authData, 'RegisterResponse'), 'Registered'),
    400: errorResponse('VALIDATION_ERROR | HEADER_*_INVALID | MALFORMED_JSON'),
    409: errorResponse('USER_EMAIL_ALREADY_EXISTS'),
    429: errorResponse('RATE_LIMIT_EXCEEDED'),
  },
});

registry.registerPath({
  method: 'post',
  path: `${API_BASE_PATH}/auth/login`,
  tags: ['Auth'],
  summary: 'Login existing user',
  request: { headers: clientHeadersSchema, body: { required: true, content: { 'application/json': { schema: loginBodySchema } } } },
  responses: {
    200: jsonResponse(successEnvelope(authData, 'LoginResponse'), 'Logged in'),
    400: errorResponse('VALIDATION_ERROR | HEADER_*_INVALID'),
    401: errorResponse('AUTH_INVALID_CREDENTIALS'),
    403: errorResponse('AUTH_ACCOUNT_DISABLED'),
    429: errorResponse('RATE_LIMIT_EXCEEDED'),
  },
});

registry.registerPath({
  method: 'post',
  path: `${API_BASE_PATH}/auth/refresh`,
  tags: ['Auth'],
  summary: 'Refresh auth tokens',
  request: { headers: clientHeadersSchema, body: { required: false, content: { 'application/json': { schema: refreshBodySchema } } } },
  responses: {
    200: jsonResponse(successEnvelope(tokensData, 'RefreshResponse'), 'Tokens refreshed'),
    400: errorResponse('HEADER_*_INVALID'),
    401: errorResponse('AUTH_REFRESH_TOKEN_INVALID | AUTH_REFRESH_TOKEN_REUSED'),
    403: errorResponse('AUTH_ACCOUNT_DISABLED'),
  },
});

registry.registerPath({
  method: 'post',
  path: `${API_BASE_PATH}/auth/logout`,
  tags: ['Auth'],
  summary: 'Logout user',
  request: { headers: clientHeadersSchema, body: { required: false, content: { 'application/json': { schema: logoutBodySchema } } } },
  responses: {
    200: jsonResponse(successEnvelope(z.null(), 'LogoutResponse'), 'Logged out'),
    400: errorResponse('VALIDATION_ERROR | HEADER_*_INVALID'),
  },
});

registry.registerPath({
  method: 'post',
  path: `${API_BASE_PATH}/auth/forgot-password`,
  tags: ['Auth'],
  summary: 'Request password reset OTP',
  request: { headers: clientHeadersSchema, body: { required: true, content: { 'application/json': { schema: forgotPasswordBodySchema } } } },
  responses: {
    200: jsonResponse(successEnvelope(forgotPasswordData, 'ForgotPasswordResponse'), 'OTP Sent'),
    400: errorResponse('VALIDATION_ERROR | HEADER_*_INVALID'),
    429: errorResponse('OTP_RESEND_COOLDOWN | RATE_LIMIT_EXCEEDED'),
  },
});

registry.registerPath({
  method: 'post',
  path: `${API_BASE_PATH}/auth/verify-otp`,
  tags: ['Auth'],
  summary: 'Verify password reset OTP',
  request: { headers: clientHeadersSchema, body: { required: true, content: { 'application/json': { schema: verifyOtpBodySchema } } } },
  responses: {
    200: jsonResponse(successEnvelope(verifyOtpData, 'VerifyOtpResponse'), 'OTP Verified'),
    400: errorResponse('VALIDATION_ERROR | HEADER_*_INVALID | OTP_INVALID | OTP_EXPIRED'),
    429: errorResponse('OTP_TOO_MANY_ATTEMPTS | RATE_LIMIT_EXCEEDED'),
  },
});

registry.registerPath({
  method: 'post',
  path: `${API_BASE_PATH}/auth/change-password`,
  tags: ['Auth'],
  summary: 'Change password using reset token',
  request: { headers: clientHeadersSchema, body: { required: true, content: { 'application/json': { schema: changePasswordBodySchema } } } },
  responses: {
    200: jsonResponse(successEnvelope(z.null(), 'ChangePasswordResponse'), 'Password changed'),
    400: errorResponse('VALIDATION_ERROR | HEADER_*_INVALID'),
    401: errorResponse('AUTH_RESET_TOKEN_INVALID'),
  },
});
