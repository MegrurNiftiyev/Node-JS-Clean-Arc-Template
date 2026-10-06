import { describe, it, expect, beforeAll } from 'vitest';
import { makeApp, api, mobile } from './helpers';
import type { Express } from 'express';
import { loadEnv } from '@/config/env';
import { buildContainer } from '@/container';
import { createApp } from '@/app';

describe('Security E2E', () => {
  let app: Express;

  beforeAll(async () => {
    app = await makeApp();
  });

  it('Client Context headers validation', async () => {
    const r1 = await api(app).post('/api/v1/auth/login').set('X-Platform', 'invalid-plat').send({ email: 'x@example.com', password: 'Pass123' });
    expect(r1.status).toBe(400);
    expect(r1.body.error.code).toBe('HEADER_PLATFORM_INVALID');

    const r2 = await api(app).post('/api/v1/auth/login').set('X-Platform', 'mobile').set('X-Language', 'xx').send({ email: 'x@example.com', password: 'Pass123' });
    expect(r2.status).toBe(400);
    expect(r2.body.error.code).toBe('HEADER_LANGUAGE_INVALID');

    const r3 = await api(app).post('/api/v1/auth/login').set({ 'X-Platform': 'mobile', 'X-Language': 'en', 'X-Region': 'AZE' }).send({ email: 'x@example.com', password: 'Pass123' });
    expect(r3.status).toBe(400);
    expect(r3.body.error.code).toBe('HEADER_REGION_INVALID');
  });

  it('Malformed JSON / payload too large / wrong media type', async () => {
    const r1 = await api(app).post('/api/v1/auth/login').set(mobile).set('Content-Type', 'application/json').send('{ "email": "bad');
    expect(r1.status).toBe(400);
    expect(r1.body.error.code).toBe('MALFORMED_JSON');

    const large = { email: 'a'.repeat(20000) + '@example.com', password: 'P12' };
    const r2 = await api(app).post('/api/v1/auth/login').set(mobile).send(large);
    expect(r2.status).toBe(413);
    expect(r2.body.error.code).toBe('PAYLOAD_TOO_LARGE');

    const r3 = await api(app).post('/api/v1/auth/login').set(mobile).set('Content-Type', 'text/plain').send('{ "email": "a@a.com", "password": "b" }');
    expect(r3.status).toBe(415);
    expect(r3.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('Unknown route → 404 ROUTE_NOT_FOUND', async () => {
    const res = await api(app).get('/api/v1/unknown-path').set(mobile);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('Security headers check', async () => {
    const res = await api(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('CORS origin check', async () => {
    const r1 = await api(app).options('/api/v1/auth/login').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
    expect(r1.status).toBe(204);
    expect(r1.headers['access-control-allow-credentials']).toBe('true');

    const r2 = await api(app).options('/api/v1/auth/login').set('Origin', 'http://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(r2.status).toBe(403);
    // Express cors middleware returns plain text error, intercepting it to AppError
    // Actually the custom check might throw AppError which is formatted
    expect(r2.body.error?.code).toBe('CORS_ORIGIN_NOT_ALLOWED');
  });

  it('Error response structure', async () => {
    const reqId = 'abcdefgh-1234';
    const res = await api(app).get('/api/v1/unknown').set(mobile).set('X-Request-Id', reqId);
    expect(res.body.requestId).toBe(reqId);
    expect(res.headers['x-request-id']).toBe(reqId);
    expect(res.body.error.stack).toBeUndefined();
  });

  it('Rate limit override', async () => {
    const env = loadEnv(process.env);
    // override max to 3
    const container = buildContainer({ ...env, AUTH_RATE_LIMIT_MAX: 3 });
    await container.init();
    const rateApp = createApp(container);

    for(let i=0; i<3; i++) {
      const res = await api(rateApp).post('/api/v1/auth/login').set(mobile).send({ email: 'rate@example.com', password: 'P12' });
      expect(res.status).not.toBe(429);
    }
    const r4 = await api(rateApp).post('/api/v1/auth/login').set(mobile).send({ email: 'rate@example.com', password: 'P12' });
    expect(r4.status).toBe(429);
    expect(r4.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
