import { describe, it, expect, beforeAll } from 'vitest';
import { makeApp, api } from './helpers';
import type { Express } from 'express';

describe('OpenAPI E2E', () => {
  let app: Express;

  beforeAll(async () => {
    app = await makeApp();
  });

  const MANIFEST: [method: string, path: string][] = [
    ['post', '/api/v1/auth/register'],
    ['post', '/api/v1/auth/login'],
    ['post', '/api/v1/auth/refresh'],
    ['post', '/api/v1/auth/logout'],
    ['post', '/api/v1/auth/forgot-password'],
    ['post', '/api/v1/auth/verify-otp'],
    ['post', '/api/v1/auth/change-password'],
    ['get', '/api/v1/users/me'],
    ['get', '/api/v1/users/{id}'],
    ['get', '/api/v1/users'],
    ['get', '/health'],
  ];

  it('doc.json contains exactly the manifest', async () => {
    const res = await api(app).get('/api-docs.json');
    expect(res.status).toBe(200);
    const doc = res.body;

    let pathCount = 0;
    for (const p in doc.paths) {
      pathCount += Object.keys(doc.paths[p]).length;
    }
    expect(pathCount).toBe(MANIFEST.length);

    for (const [method, path] of MANIFEST) {
      const op = doc.paths[path]?.[method];
      expect(op, `Missing ${method.toUpperCase()} ${path}`).toBeDefined();

      if (path.startsWith('/api/v1/')) {
        // X-Platform and X-Language were removed from Swagger to reduce clutter
      }

      if (path.startsWith('/api/v1/users')) {
        expect(op.security).toBeDefined();
        expect(op.security.length).toBeGreaterThan(0);
      }
    }
  });
});
