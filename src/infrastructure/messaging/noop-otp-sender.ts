import type { OtpSender } from '@/application/ports/otp-sender.port';

/** Placeholder. TODO(integration): replace with SMTP / SMS provider adapter and wire it in container.ts. */
export class NoopOtpSender implements OtpSender {
  send(): Promise<void> {
    // intentionally empty — the code must NOT be logged here
    return Promise.resolve();
  }
}
