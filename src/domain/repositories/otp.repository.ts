import type { Otp } from '../entities/otp.entity';

export interface OtpRepository {
  create(otp: Otp): Promise<void>;
  findById(id: string): Promise<Otp | null>;
  findLatestByUserId(userId: string): Promise<Otp | null>;
  update(otp: Otp): Promise<void>;
}
