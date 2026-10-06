import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { makeApp, mobile, web, api } from './helpers';
import type { Express } from 'express';

describe('Users E2E', () => {
  let app: Express;

  beforeAll(async () => {
    app = await makeApp();
  });

  it('GET /users/me returns caller', async () => {
    const reg = await api(app).post('/api/v1/auth/register').set(mobile).send({ email: 'me@example.com', password: 'Password123', fullName: 'Me' });
    const token = reg.body.data.tokens.accessToken;

    const res = await api(app).get('/api/v1/users/me').set(mobile).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('me@example.com');

    const webAgent = request.agent(app);
    await webAgent.post('/api/v1/auth/register').set(web).send({ email: 'meweb@example.com', password: 'Password123', fullName: 'Me' });
    const res2 = await webAgent.get('/api/v1/users/me').set(web);
    expect(res2.status).toBe(200);
    expect(res2.body.data.user.email).toBe('meweb@example.com');
  });

  it('Source separation: web with Bearer token fails, mobile with cookie fails', async () => {
    const reg = await api(app).post('/api/v1/auth/register').set(mobile).send({ email: 'sep@example.com', password: 'Password123', fullName: 'Sep' });
    const token = reg.body.data.tokens.accessToken;

    const res1 = await api(app).get('/api/v1/users/me').set(web).set('Authorization', `Bearer ${token}`);
    expect(res1.status).toBe(401);
    expect(res1.body.error.code).toBe('AUTH_TOKEN_MISSING');

    const webAgent = request.agent(app);
    await webAgent.post('/api/v1/auth/register').set(web).send({ email: 'sepweb@example.com', password: 'Password123', fullName: 'Sep' });
    const res2 = await webAgent.get('/api/v1/users/me').set(mobile); // agent sends cookies, but mobile platform expects bearer
    expect(res2.status).toBe(401);
    expect(res2.body.error.code).toBe('AUTH_TOKEN_MISSING');
  });

  it('GET /users as user → 403, as admin → 200', async () => {
    const reg = await api(app).post('/api/v1/auth/register').set(mobile).send({ email: 'list@example.com', password: 'Password123', fullName: 'List' });
    const token = reg.body.data.tokens.accessToken;

    const res1 = await api(app).get('/api/v1/users').set(mobile).set('Authorization', `Bearer ${token}`);
    expect(res1.status).toBe(403);
    expect(res1.body.error.code).toBe('AUTH_FORBIDDEN');

    const adminLog = await api(app).post('/api/v1/auth/login').set(mobile).send({ email: 'admin@example.com', password: 'AdminPass123' });
    const adminToken = adminLog.body.data.tokens.accessToken;

    const res2 = await api(app).get('/api/v1/users').set(mobile).set('Authorization', `Bearer ${adminToken}`);
    expect(res2.status).toBe(200);
    expect(res2.body.meta.total).toBeGreaterThanOrEqual(1);

    const res3 = await api(app).get('/api/v1/users?limit=1000').set(mobile).set('Authorization', `Bearer ${adminToken}`);
    expect(res3.status).toBe(400);
    expect(res3.body.error.code).toBe('VALIDATION_ERROR');
    expect(res3.body.error.details[0].field).toBe('query.limit');
  });

  it('GET /users/:id access control', async () => {
    const reg = await api(app).post('/api/v1/auth/register').set(mobile).send({ email: 'id1@example.com', password: 'Password123', fullName: 'Id1' });
    const t1 = reg.body.data.tokens.accessToken;
    const id1 = reg.body.data.user.id;

    const reg2 = await api(app).post('/api/v1/auth/register').set(mobile).send({ email: 'id2@example.com', password: 'Password123', fullName: 'Id2' });
    const id2 = reg2.body.data.user.id;

    const adminLog = await api(app).post('/api/v1/auth/login').set(mobile).send({ email: 'admin@example.com', password: 'AdminPass123' });
    const adminToken = adminLog.body.data.tokens.accessToken;

    const res1 = await api(app).get(`/api/v1/users/${id1}`).set(mobile).set('Authorization', `Bearer ${t1}`);
    expect(res1.status).toBe(200);

    const res2 = await api(app).get(`/api/v1/users/${id2}`).set(mobile).set('Authorization', `Bearer ${t1}`);
    expect(res2.status).toBe(403);

    const res3 = await api(app).get(`/api/v1/users/${id1}`).set(mobile).set('Authorization', `Bearer ${adminToken}`);
    expect(res3.status).toBe(200);

    const res4 = await api(app).get(`/api/v1/users/00000000-0000-4000-8000-000000000000`).set(mobile).set('Authorization', `Bearer ${adminToken}`);
    expect(res4.status).toBe(404);
    expect(res4.body.error.code).toBe('USER_NOT_FOUND');

    const res5 = await api(app).get(`/api/v1/users/invalid-uuid`).set(mobile).set('Authorization', `Bearer ${adminToken}`);
    expect(res5.status).toBe(400);
    expect(res5.body.error.code).toBe('VALIDATION_ERROR');
    expect(res5.body.error.details[0].message).toBeTypeOf('string'); // localized based on locale
  });

  it('Registering with role admin → 400', async () => {
    const res = await api(app).post('/api/v1/auth/register').set(mobile).send({ email: 'hack@example.com', password: 'Password123', fullName: 'Hack', role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('body.role');
  });
});
