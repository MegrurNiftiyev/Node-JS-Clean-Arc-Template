import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { makeApp, mobile, web, api } from './helpers';
import type { Express } from 'express';

describe('Auth E2E', () => {
  let app: Express;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    app = await makeApp();
    agent = request.agent(app);
  });

  it('Register (mobile) → 201, tokens exist in body, no passwordHash', async () => {
    const res = await api(app)
      .post('/api/v1/auth/register')
      .set(mobile)
      .send({ email: 'mob1@example.com', password: 'Password123', fullName: 'Mobile User' });

    expect(res.status).toBe(201);
    expect(res.body.data.tokens.accessToken).toBeTypeOf('string');
    expect(res.body.data.tokens.refreshToken).toBeTypeOf('string');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('Register (web) → 201, no tokens in body, cookies set', async () => {
    const res = await agent
      .post('/api/v1/auth/register')
      .set(web)
      .send({ email: 'web1@example.com', password: 'Password123', fullName: 'Web User' });

    expect(res.status).toBe(201);
    expect(res.body.data.tokens).toBeUndefined();
    
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();
    expect(cookies.length).toBeGreaterThanOrEqual(2);
    expect(cookies.some(c => c.includes('access_token=') && c.includes('HttpOnly') && c.includes('SameSite=Strict'))).toBe(true);
    expect(cookies.some(c => c.includes('refresh_token=') && c.includes('HttpOnly') && c.includes('SameSite=Strict'))).toBe(true);
  });

  it('Register with weak password → 400 VALIDATION_ERROR localized', async () => {
    const resAz = await api(app)
      .post('/api/v1/auth/register')
      .set({ 'X-Platform': 'mobile', 'X-Language': 'az' })
      .send({ email: 'weak@example.com', password: 'abc', fullName: 'Weak Pass' });

    expect(resAz.status).toBe(400);
    expect(resAz.body.error.code).toBe('VALIDATION_ERROR');
    expect(resAz.body.error.details[0].field).toBe('body.password');
    // Ensure it's not English (which would be "Password is too short...")
    expect(resAz.body.error.details[0].message).not.toBe('Password is too short.');

    const resDe = await api(app)
      .post('/api/v1/auth/register')
      .set({ 'X-Platform': 'mobile', 'X-Language': 'de' })
      .send({ email: 'weak@example.com', password: 'abc', fullName: 'Weak Pass' });
      
    expect(resDe.status).toBe(400);
    expect(resDe.body.error.details[0].message).not.toBe(resAz.body.error.details[0].message);
  });

  it('Register with unknown field → 400 VALIDATION_ERROR (strict schema)', async () => {
    const res = await api(app)
      .post('/api/v1/auth/register')
      .set(mobile)
      .send({ email: 'strict@example.com', password: 'Password123', fullName: 'Strict', unknownField: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('body.unknownField');
  });

  it('Duplicate register → 409', async () => {
    await api(app).post('/api/v1/auth/register').set(mobile).send({ email: 'dup@example.com', password: 'Password123', fullName: 'Dup' });
    const res = await api(app).post('/api/v1/auth/register').set(mobile).send({ email: 'dup@example.com', password: 'Password123', fullName: 'Dup' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USER_EMAIL_ALREADY_EXISTS');
  });

  it('Login ok / wrong password / unknown email', async () => {
    await api(app).post('/api/v1/auth/register').set(mobile).send({ email: 'log@example.com', password: 'Password123', fullName: 'Log' });
    
    const ok = await api(app).post('/api/v1/auth/login').set(mobile).send({ email: 'log@example.com', password: 'Password123' });
    expect(ok.status).toBe(200);

    const wrong = await api(app).post('/api/v1/auth/login').set(mobile).send({ email: 'log@example.com', password: 'Wrong' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');

    const unknown = await api(app).post('/api/v1/auth/login').set(mobile).send({ email: 'unknown2@example.com', password: 'Password123' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('Refresh (mobile) rotation and reuse detection', async () => {
    const reg = await api(app).post('/api/v1/auth/register').set(mobile).send({ email: 'ref@example.com', password: 'Password123', fullName: 'Ref' });
    const token = reg.body.data.tokens.refreshToken;

    const ref1 = await api(app).post('/api/v1/auth/refresh').set(mobile).send({ refreshToken: token });
    expect(ref1.status).toBe(200);
    const newToken = ref1.body.data.tokens.refreshToken;

    const ref2 = await api(app).post('/api/v1/auth/refresh').set(mobile).send({ refreshToken: token });
    expect(ref2.status).toBe(401);
    expect(ref2.body.error.code).toBe('AUTH_REFRESH_TOKEN_REUSED');

    const ref3 = await api(app).post('/api/v1/auth/refresh').set(mobile).send({ refreshToken: newToken });
    expect(ref3.status).toBe(401);
    expect(ref3.body.error.code).toBe('AUTH_REFRESH_TOKEN_INVALID');
  });

  it('Refresh (web) using only cookie', async () => {
    const webAgent = request.agent(app);
    await webAgent.post('/api/v1/auth/register').set(web).send({ email: 'webref@example.com', password: 'Password123', fullName: 'Web' });
    const res = await webAgent.post('/api/v1/auth/refresh').set(web).send({});
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('Logout (mobile) revokes token', async () => {
    const reg = await api(app).post('/api/v1/auth/register').set(mobile).send({ email: 'out@example.com', password: 'Password123', fullName: 'Out' });
    const token = reg.body.data.tokens.refreshToken;

    const logout = await api(app).post('/api/v1/auth/logout').set(mobile).send({ refreshToken: token });
    expect(logout.status).toBe(200);

    const ref = await api(app).post('/api/v1/auth/refresh').set(mobile).send({ refreshToken: token });
    expect(ref.status).toBe(401);

    const logout2 = await api(app).post('/api/v1/auth/logout').set(mobile).send({ refreshToken: 'garbage' });
    expect(logout2.status).toBe(200);
  });

  it('Password reset flow', async () => {
    await api(app).post('/api/v1/auth/register').set(mobile).send({ email: 'reset@example.com', password: 'Password123', fullName: 'Reset' });
    
    const fp = await api(app).post('/api/v1/auth/forgot-password').set(mobile).send({ email: 'reset@example.com' });
    expect(fp.status).toBe(200);
    const otp = fp.body.data.otp;

    const badVerify = await api(app).post('/api/v1/auth/verify-otp').set(mobile).send({ email: 'reset@example.com', code: '000000' });
    expect(badVerify.status).toBe(400);
    expect(badVerify.body.error.code).toBe('OTP_INVALID');

    const verify = await api(app).post('/api/v1/auth/verify-otp').set(mobile).send({ email: 'reset@example.com', code: otp });
    expect(verify.status).toBe(200);
    const resetToken = verify.body.data.resetToken;

    const change = await api(app).post('/api/v1/auth/change-password').set(mobile).send({ resetToken, newPassword: 'NewPassword123' });
    expect(change.status).toBe(200);

    const log1 = await api(app).post('/api/v1/auth/login').set(mobile).send({ email: 'reset@example.com', password: 'NewPassword123' });
    expect(log1.status).toBe(200);

    const log2 = await api(app).post('/api/v1/auth/login').set(mobile).send({ email: 'reset@example.com', password: 'Password123' });
    expect(log2.status).toBe(401);

    const change2 = await api(app).post('/api/v1/auth/change-password').set(mobile).send({ resetToken, newPassword: 'NewPassword123' });
    expect(change2.status).toBe(401);
    expect(change2.body.error.code).toBe('AUTH_RESET_TOKEN_INVALID');
  });

  it('forgot-password for unknown email', async () => {
    const fp = await api(app).post('/api/v1/auth/forgot-password').set(mobile).send({ email: 'unknown3@example.com' });
    expect(fp.status).toBe(200);
    expect(fp.body.data.otp).toBeUndefined();
  });

  it('Access token missing/invalid', async () => {
    const req1 = await api(app).get('/api/v1/users/me').set(mobile);
    expect(req1.status).toBe(401);
    expect(req1.body.error.code).toBe('AUTH_TOKEN_MISSING');

    const req2 = await api(app).get('/api/v1/users/me').set(mobile).set('Authorization', 'Bearer invalid');
    expect(req2.status).toBe(401);
    expect(req2.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });
});
