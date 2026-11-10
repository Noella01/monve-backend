import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fingerprint, hash, now, ApiError, json } from './core.js';

// JSON columns hold validated snapshots; indexed relational columns own identity,
// money, authorization, stock and transitions. Never await inside a transaction.
export type Row = Record<string, any>;
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
    this.db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    for (const name of readdirSync(resolve('migrations')).filter(n => n.endsWith('.sql')).sort()) {
      this.tx(() => {
        if (!this.one('SELECT name FROM migrations WHERE name=?', name)) {
          this.db.exec(readFileSync(resolve('migrations', name), 'utf8'));
          this.run('INSERT INTO migrations VALUES (?,?)', name, now());
        }
      });
    }
  }
  one(sql: string, ...values: SQLInputValue[]): Row | undefined { return this.db.prepare(sql).get(...values); }
  all(sql: string, ...values: SQLInputValue[]): Row[] { return this.db.prepare(sql).all(...values); }
  run(sql: string, ...values: SQLInputValue[]) { return this.db.prepare(sql).run(...values); }
  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  prior(scope: string, key: string, body: unknown): string | undefined {
    const old = this.one('SELECT * FROM idempotency WHERE scope=? AND key_hash=?', scope, hash(key));
    if (old && old.request_hash !== fingerprint(body)) throw new ApiError(409, 'This idempotency key was already used with different input.', 'IDEMPOTENCY_CONFLICT');
    return old?.result_id;
  }
  remember(scope: string, key: string, body: unknown, result: string) {
    this.run('INSERT INTO idempotency VALUES (?,?,?,?,?)', scope, hash(key), fingerprint(body), result, now());
  }
  audit(actor: string | null, action: string, target: string, detail: unknown = {}) {
    this.run('INSERT INTO audit_log (actor_id,action,target_id,detail,created_at) VALUES (?,?,?,?,?)', actor, action, target, json(detail), now());
  }
  event(type: string, entity: string, audience: 'public' | 'private', customer: string | null, version: number) {
    this.run('INSERT INTO events(type,entity_id,audience,customer_id,version,created_at) VALUES (?,?,?,?,?,?)', type, entity, audience, customer, version, now());
  }
  close() { this.db.close(); }
}
