import type { Otp } from '@/domain/entities/otp.entity';
import type { OtpRepository } from '@/domain/repositories/otp.repository';

export class InMemoryOtpRepository implements OtpRepository {
  private readonly byId = new Map<string, Otp>();

  create(otp: Otp): Promise<void> {
    this.byId.set(otp.id, { ...otp });
    return Promise.resolve();
  }

  findById(id: string): Promise<Otp | null> {
    const otp = this.byId.get(id);
    return Promise.resolve(otp ? { ...otp } : null);
  }

  findLatestByUserId(userId: string): Promise<Otp | null> {
    let latest: Otp | null = null;
    for (const otp of this.byId.values()) {
      if (otp.userId === userId && (!latest || otp.createdAt.getTime() >= latest.createdAt.getTime())) {
        latest = otp;
      }
    }
    return Promise.resolve(latest ? { ...latest } : null);
  }

  update(otp: Otp): Promise<void> {
    if (this.byId.has(otp.id)) this.byId.set(otp.id, { ...otp });
    return Promise.resolve();
  }
}
