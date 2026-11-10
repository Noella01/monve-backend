import { resolve } from 'node:path';

export interface Config {
  production: boolean; host: string; port: number; publicUrl: string; origins: string[];
  databasePath: string; uploadDir: string; secureCookie: boolean; sameSite: 'lax' | 'strict' | 'none';
  sessionHours: number; reservationMinutes: number; deliveryFee: number; freeAbove: number;
  provinces: string[]; paymentEnvironment: 'test' | 'live'; paymentMethods: string[];
  flwSecret: string; flwPublic: string; webhookSecret: string; webhookAuth: 'hmac' | 'legacy';
  flwAccountId: string; redirectUrl: string; brevoApiKey: string; emailSenderEmail: string;
  emailSenderName: string; docs: boolean; jobs: boolean;
}
export function config(env = process.env): Config {
  const num = (key: string, fallback: number) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${key}`);
    return value;
  };
  const split = (value: string) => value.split(',').map(x => x.trim()).filter(Boolean);
  const result: Config = {
    production: env.NODE_ENV === 'production', host: env.HOST || '127.0.0.1', port: num('PORT', 3000),
    publicUrl: env.PUBLIC_URL || 'http://localhost:3000',
    origins: split(env.FRONTEND_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://localhost:3000'),
    databasePath: resolve(env.DATABASE_PATH || '.runtime/aurie.sqlite'), uploadDir: resolve(env.UPLOAD_DIR || '.runtime/uploads'),
    secureCookie: env.COOKIE_SECURE === 'true', sameSite: (env.COOKIE_SAME_SITE || 'lax') as Config['sameSite'],
    sessionHours: num('SESSION_HOURS', 168), reservationMinutes: num('RESERVATION_MINUTES', 20),
    deliveryFee: num('DELIVERY_FEE_RWF', 2500), freeAbove: num('FREE_DELIVERY_ABOVE_RWF', 120000),
    provinces: split(env.DELIVERY_PROVINCES || ''), paymentEnvironment: (env.PAYMENT_ENVIRONMENT || 'test') as Config['paymentEnvironment'],
    paymentMethods: split(env.PAYMENT_METHODS || ''), flwSecret: env.FLW_SECRET_KEY || '', flwPublic: env.FLW_PUBLIC_KEY || '',
    webhookSecret: env.FLW_WEBHOOK_SECRET || '', webhookAuth: (env.FLW_WEBHOOK_AUTH || 'legacy') as Config['webhookAuth'],
    flwAccountId: env.FLW_ACCOUNT_ID || '', redirectUrl: env.PAYMENT_REDIRECT_URL || 'http://localhost:5173/account',
    brevoApiKey: env.BREVO_API_KEY || '', emailSenderEmail: env.EMAIL_SENDER_EMAIL || '',
    emailSenderName: env.EMAIL_SENDER_NAME || 'AURIE',
    docs: env.DOCS_ENABLED !== 'false', jobs: true,
  };
  if (!['test', 'live'].includes(result.paymentEnvironment) || !['hmac', 'legacy'].includes(result.webhookAuth) || !['lax', 'strict', 'none'].includes(result.sameSite)) throw new Error('Invalid payment or cookie mode');
  if (!result.sessionHours || !result.reservationMinutes) throw new Error('Session and reservation durations must be positive');
  if (result.paymentMethods.some(x => !['card', 'mobile_money'].includes(x))) throw new Error('Unsupported payment method');
  if (Boolean(result.brevoApiKey) !== Boolean(result.emailSenderEmail)) throw new Error('BREVO_API_KEY and EMAIL_SENDER_EMAIL must be configured together');
  if (result.emailSenderEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.emailSenderEmail)) throw new Error('Invalid EMAIL_SENDER_EMAIL');
  if (!result.emailSenderName.trim() || result.emailSenderName.length > 100) throw new Error('Invalid EMAIL_SENDER_NAME');
  if (result.sameSite === 'none' && !result.secureCookie) throw new Error('SameSite=None requires secure cookies');
  if (result.production && (!result.secureCookie || !result.publicUrl.startsWith('https://') || result.origins.some(x => !x.startsWith('https://')))) throw new Error('Production requires HTTPS public URL/origins and secure cookies');
  if (result.flwSecret && result.flwSecret.includes('_TEST') !== (result.paymentEnvironment === 'test')) throw new Error('Flutterwave key and environment do not match');
  return result;
}
