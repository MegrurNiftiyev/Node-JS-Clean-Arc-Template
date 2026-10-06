export interface OtpSender {
  // TODO(integration): implement with an e-mail/SMS provider. Never log the code in production.
  send(target: { email: string; code: string }): Promise<void>;
}
