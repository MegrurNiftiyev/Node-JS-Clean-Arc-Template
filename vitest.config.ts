import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SWAGGER_ENABLED: 'true',
      DB_DRIVER: 'memory',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789-0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789-0123456789',
      JWT_RESET_SECRET: 'test-reset-secret-0123456789-0123456789',
      OTP_HMAC_SECRET: 'test-otp-hmac-secret-0123456789-012345',
      OTP_EXPOSE_IN_RESPONSE: 'true',
      OTP_RESEND_COOLDOWN_SECONDS: '0',
      BCRYPT_COST: '4',
      RATE_LIMIT_MAX: '100000',
      AUTH_RATE_LIMIT_MAX: '100000',
      OTP_RATE_LIMIT_MAX: '100000',
      CORS_ORIGINS: 'http://localhost:5173',
      SEED_ADMIN_EMAIL: 'admin@example.com',
      SEED_ADMIN_PASSWORD: 'AdminPass123',
    },
  },
});
