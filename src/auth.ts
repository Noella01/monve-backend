import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import type { Store, Row } from './db.js';
import { hash, token, now, id, passwordHash, checkPassword, requireValue } from './core.js';

export type Principal = { id: string; name: string; email: string; role: 'customer' | 'admin' };
export class Auth {
  constructor(private db: Store, private cfg: Config) {}
  current(req: FastifyRequest, role: Principal['role']): Principal | undefined {
    const raw = req.cookies[`aurie_${role}`];
    if (!raw) return;
    const row = this.db.one('SELECT p.id,p.name,p.email,p.role FROM sessions s JOIN principals p ON p.id=s.principal_id WHERE s.token_hash=? AND s.expires_at>? AND p.active=1 AND p.role=?', hash(raw), now(), role);
    return row as Principal | undefined;
  }
  need(req: FastifyRequest, role: Principal['role']): Principal {
    const person = this.current(req, role);
    requireValue(person, 401, `${role === 'admin' ? 'Admin' : 'Customer'} sign-in required.`, 'AUTH_REQUIRED');
    return person;
  }
  async register(name: string, email: string, password: string, role: Principal['role'] = 'customer') {
    const normalized = email.trim().toLowerCase();
    const credential = await passwordHash(password);
    return this.db.tx(() => {
      requireValue(!this.db.one('SELECT id FROM principals WHERE role=? AND email=?', role, normalized), 409, 'An account with this email already exists.', 'EMAIL_EXISTS');
      const person = { id: id(), name: name.trim(), email: normalized, role };
      requireValue(person.name, 400, 'Name is required.');
      this.db.run('INSERT INTO principals(id,role,name,email,password_hash,created_at) VALUES (?,?,?,?,?,?)', person.id, role, person.name, person.email, credential, now());
      if (role === 'customer') this.db.run('INSERT INTO shopping(customer_id) VALUES (?)', person.id);
      return person;
    });
  }
  async login(email: string | undefined, password: string, role: Principal['role']) {
    // Password-only legacy admin login is supported only with exactly one active admin.
    let row: Row | undefined;
    if (email) row = this.db.one('SELECT * FROM principals WHERE role=? AND email=? AND active=1', role, email.trim().toLowerCase());
    else if (role === 'admin') { const rows = this.db.all("SELECT * FROM principals WHERE role='admin' AND active=1 LIMIT 2"); if (rows.length === 1) row = rows[0]; }
    const valid = await checkPassword(password, row?.password_hash || 'scrypt$invalid$' + '0'.repeat(128));
    requireValue(row && valid, 401, 'Invalid sign-in credentials.', 'INVALID_CREDENTIALS');
    return { id: row.id, name: row.name, email: row.email, role } as Principal;
  }
  establish(req: FastifyRequest, reply: FastifyReply, person: Principal) {
    this.revoke(req, person.role);
    const raw = token();
    this.db.run('INSERT INTO sessions VALUES (?,?,?,?)', hash(raw), person.id, new Date(Date.now() + this.cfg.sessionHours * 3600000).toISOString(), now());
    reply.setCookie(`aurie_${person.role}`, raw, { path: '/', httpOnly: true, secure: this.cfg.secureCookie, sameSite: this.cfg.sameSite, maxAge: this.cfg.sessionHours * 3600 });
  }
  revoke(req: FastifyRequest, role: Principal['role']) {
    const raw = req.cookies[`aurie_${role}`];
    if (raw) this.db.run('DELETE FROM sessions WHERE token_hash=?', hash(raw));
  }
  logout(req: FastifyRequest, reply: FastifyReply, role: Principal['role']) {
    this.revoke(req, role);
    reply.clearCookie(`aurie_${role}`, { path: '/', httpOnly: true, secure: this.cfg.secureCookie, sameSite: this.cfg.sameSite });
    return { ok: true };
  }
}
