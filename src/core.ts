import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export const token = () => randomBytes(32).toString('hex');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const json = JSON.stringify;
export function fingerprint(value: unknown): string {
  const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
  return hash(json(stable(value)));
}
export class ApiError extends Error {
  constructor(public statusCode: number, message: string, public code = 'REQUEST_FAILED') { super(message); }
}
export function requireValue(value: unknown, status: number, message: string, code?: string): asserts value {
  if (!value) throw new ApiError(status, message, code);
}
const derive = (password:string,salt:string) => new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error ? reject(error) : resolve(key)));
export async function passwordHash(password: string) {
  const salt = token();
  const derived = await derive(password, salt);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}
export async function checkPassword(password: string, stored: string) {
  const [,salt,expected] = stored.split('$');
  const derived = await derive(password, salt || 'invalid');
  return equal(derived.toString('hex'), expected || '0'.repeat(128));
}
