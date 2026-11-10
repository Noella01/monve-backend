import { randomUUID } from 'node:crypto';
import type { Config } from '../config.js';
import type { Store } from '../db.js';
import { ApiError, now, requireValue } from '../core.js';

type SendInput = { customer_id: string; subject: string; text: string };
type EmailStatus = 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN';

export interface EmailProvider {
  send(input: { email: string; name: string; subject: string; text: string }): Promise<void>;
}

class ProviderRejectedError extends Error {
  constructor(public status: number) { super('Email provider rejected the message.'); }
}

export class BrevoEmailProvider implements EmailProvider {
  constructor(private cfg: Config) {}

  async send(input: { email: string; name: string; subject: string; text: string }) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': this.cfg.brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: this.cfg.emailSenderEmail, name: this.cfg.emailSenderName },
        to: [{ email: input.email, name: input.name }],
        subject: input.subject,
        textContent: input.text,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new ProviderRejectedError(response.status);
  }
}

export class Emails {
  constructor(private db: Store, private cfg: Config, private provider: EmailProvider = new BrevoEmailProvider(cfg)) {}

  status() {
    return { configured: Boolean(this.cfg.brevoApiKey && this.cfg.emailSenderEmail), sender_email: this.cfg.emailSenderEmail };
  }

  customers(search: string, limit: number, offset: number) {
    const term = search.trim();
    const where = term ? " AND (instr(lower(name),lower(?))>0 OR instr(lower(email),lower(?))>0)" : '';
    const args = term ? [term, term] : [];
    const total = this.db.one(`SELECT COUNT(*) AS count FROM principals WHERE role='customer'${where}`, ...args)?.count ?? 0;
    const customers = this.db.all(
      `SELECT id,name,email,created_at FROM principals WHERE role='customer'${where} ORDER BY created_at DESC,id LIMIT ? OFFSET ?`,
      ...args, limit, offset,
    );
    return { customers, total, limit, offset };
  }

  logs(limit: number) {
    return this.db.all(
      `SELECT e.id,e.customer_id,p.name AS customer_name,e.recipient_email,e.subject,e.status,
        e.provider_message_id,e.failure_code,e.created_at,e.sent_at
       FROM outbound_emails e LEFT JOIN principals p ON p.id=e.customer_id
       ORDER BY e.created_at DESC,e.id DESC LIMIT ?`,
      limit,
    );
  }

  async send(adminId: string, input: SendInput, idempotencyKey: string) {
    requireValue(this.status().configured, 503, 'Email sending is not configured on the server.', 'EMAIL_NOT_CONFIGURED');

    const prepared = this.db.tx(() => {
      const prior = this.db.prior('admin-email', idempotencyKey, input);
      if (prior) return { id: prior, duplicate: true as const };

      const customer = this.db.one("SELECT id,name,email FROM principals WHERE id=? AND role='customer' AND active=1", input.customer_id);
      requireValue(customer, 404, 'Customer not found.', 'CUSTOMER_NOT_FOUND');
      const id = randomUUID();
      const createdAt = now();
      this.db.run(
        'INSERT INTO outbound_emails(id,admin_id,customer_id,recipient_email,subject,status,created_at) VALUES (?,?,?,?,?,?,?)',
        id, adminId, customer.id, customer.email, input.subject, 'SENDING', createdAt,
      );
      this.db.remember('admin-email', idempotencyKey, input, id);
      this.db.audit(adminId, 'email.send', id, { customer_id: customer.id, subject: input.subject });
      return { id, duplicate: false as const, customer };
    });

    if (prepared.duplicate) return this.email(prepared.id);

    try {
      await this.provider.send({
        email: prepared.customer.email,
        name: prepared.customer.name,
        subject: input.subject,
        text: input.text,
      });
      this.db.run("UPDATE outbound_emails SET status='SENT',sent_at=? WHERE id=? AND status='SENDING'", now(), prepared.id);
    } catch (error) {
      const status: EmailStatus = error instanceof ProviderRejectedError ? 'FAILED' : 'UNKNOWN';
      const failureCode = error instanceof ProviderRejectedError ? `PROVIDER_HTTP_${error.status}` : 'PROVIDER_RESPONSE_UNKNOWN';
      this.db.run('UPDATE outbound_emails SET status=?,failure_code=? WHERE id=? AND status=?', status, failureCode, prepared.id, 'SENDING');
      if (error instanceof ProviderRejectedError) {
        throw new ApiError(502, 'The email provider rejected this message. Review the email history before trying again.', 'EMAIL_DELIVERY_FAILED');
      }
      throw new ApiError(502, 'The email provider response could not be confirmed. Check email history before retrying.', 'EMAIL_STATUS_UNKNOWN');
    }

    return this.email(prepared.id);
  }

  private email(id: string) {
    const result = this.db.one(
      `SELECT e.id,e.customer_id,p.name AS customer_name,e.recipient_email,e.subject,e.status,
        e.provider_message_id,e.failure_code,e.created_at,e.sent_at
       FROM outbound_emails e LEFT JOIN principals p ON p.id=e.customer_id WHERE e.id=?`,
      id,
    );
    requireValue(result, 500, 'Email attempt could not be loaded.', 'EMAIL_LOG_MISSING');
    return result;
  }
}
