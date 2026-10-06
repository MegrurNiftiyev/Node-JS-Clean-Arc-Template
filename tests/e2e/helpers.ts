import request from 'supertest';
import { loadEnv } from '@/config/env';
import { buildContainer } from '@/container';
import { createApp } from '@/app';

export async function makeApp() {
  const container = buildContainer(loadEnv(process.env));
  await container.init(); // seeds admin@example.com / AdminPass123 (vitest env block)
  return createApp(container);
}

export const mobile = { 'X-Platform': 'mobile', 'X-Language': 'en' } as const;
export const web = { 'X-Platform': 'web', 'X-Language': 'en' } as const;
export const api = (app: Parameters<typeof request>[0]) => request(app);
