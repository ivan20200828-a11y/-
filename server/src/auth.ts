import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import type { DB } from './db.ts';
import { ApiError } from './deals.ts';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

/** A manager account. Admins also add colleagues. */
export type Manager = { id: number; email: string; name: string; admin: boolean };

const toManager = (r: { id: number; email: string; name: string; admin: number }): Manager =>
  ({ id: r.id, email: r.email, name: r.name, admin: r.admin === 1 });

function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(password, salt, 32).toString('base64')}`;
}

function checkPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split('$');
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export class AuthService {
  db: DB;
  constructor(db: DB) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS managers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        failed_logins INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        manager_id INTEGER NOT NULL REFERENCES managers(id),
        expires_at TEXT NOT NULL
      );
    `);
    const cols = db.prepare('PRAGMA table_info(managers)').all() as { name: string }[];
    if (!cols.some((c) => c.name === 'admin')) {
      // Accounts made before roles existed: the first one becomes the admin.
      db.exec('ALTER TABLE managers ADD COLUMN admin INTEGER NOT NULL DEFAULT 0');
      db.exec('UPDATE managers SET admin = 1 WHERE id = (SELECT MIN(id) FROM managers)');
    }
  }

  addManager(email: string, name: string, password: string, admin = false): Manager {
    if (password.length < 8) throw new ApiError(400, 'Пароль должен быть не короче 8 символов');
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new ApiError(400, 'Укажите почту сотрудника');
    if (!name.trim()) throw new ApiError(400, 'Укажите имя сотрудника');
    if (this.db.prepare('SELECT 1 FROM managers WHERE email = ?').get(e)) throw new ApiError(409, 'Сотрудник с такой почтой уже есть');
    this.db.prepare('INSERT INTO managers (email, name, password, admin) VALUES (?, ?, ?, ?)').run(e, name.trim(), hashPassword(password), admin ? 1 : 0);
    return toManager(this.db.prepare('SELECT id, email, name, admin FROM managers WHERE email = ?').get(e) as never);
  }

  /** Everyone with access to the manager's cabinet; only an admin may see and change the team. */
  list(by: Manager): Manager[] {
    if (!by.admin) throw new ApiError(403, 'Список сотрудников доступен только администратору');
    return (this.db.prepare('SELECT id, email, name, admin FROM managers ORDER BY id').all() as never[]).map(toManager);
  }

  invite(by: Manager, b: { email?: string; name?: string; password?: string; admin?: boolean }) {
    if (!by.admin) throw new ApiError(403, 'Добавлять сотрудников может только администратор');
    return this.addManager(String(b.email ?? ''), String(b.name ?? ''), String(b.password ?? ''), b.admin === true);
  }

  hasManagers() {
    return (this.db.prepare('SELECT COUNT(*) AS c FROM managers').get() as { c: number }).c > 0;
  }

  login(email: string, password: string) {
    const row = this.db.prepare('SELECT * FROM managers WHERE email = ?').get(String(email ?? '').trim().toLowerCase()) as
      | (Manager & { password: string; failed_logins: number; locked_until: string | null })
      | undefined;
    const wrong = new ApiError(401, 'Неверная почта или пароль');
    if (!row) throw wrong;
    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      throw new ApiError(429, 'Слишком много неудачных попыток. Попробуйте через 15 минут.');
    }
    if (!checkPassword(String(password ?? ''), row.password)) {
      const failed = row.failed_logins + 1;
      const lock = failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MS).toISOString() : null;
      this.db.prepare('UPDATE managers SET failed_logins = ?, locked_until = ? WHERE id = ?').run(lock ? 0 : failed, lock, row.id);
      throw wrong;
    }
    this.db.prepare('UPDATE managers SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(row.id);
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO sessions (token, manager_id, expires_at) VALUES (?, ?, ?)').run(
      token, row.id, new Date(Date.now() + SESSION_TTL_MS).toISOString());
    return { token, manager: toManager(row as never) };
  }

  /** Returns the manager for a "Bearer <token>" header, or throws 401. */
  check(authorization: string | undefined): Manager {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const m = this.db.prepare(`SELECT m.id, m.email, m.name, m.admin FROM sessions s JOIN managers m ON m.id = s.manager_id
      WHERE s.token = ? AND s.expires_at > ?`).get(token, new Date().toISOString()) as never;
    if (!m) throw new ApiError(401, 'Войдите в кабинет менеджера');
    return toManager(m);
  }

  logout(authorization: string | undefined) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
}
