import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

import type { DB } from './db.ts';

/** A consistent copy of the database into a new file, safe while the app keeps working. */
export function snapshot(db: DB, file: string) {
  db.prepare('VACUUM INTO ?').run(file);
}

/** One copy a day in `dir`, the last `keep` of them kept: sdelka-2026-10-05.db, sdelka-2026-10-06.db, … */
export class BackupService {
  db: DB;
  dir: string;
  keep: number;
  constructor(db: DB, dir: string, keep = 14) {
    this.db = db;
    this.dir = dir;
    this.keep = keep;
  }

  /** Makes today's copy unless it exists; returns its file name when a new one was made. */
  daily(now = new Date()) {
    mkdirSync(this.dir, { recursive: true });
    const name = `sdelka-${now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })}.db`;
    const existing = this.list();
    if (existing.includes(name)) return null;
    // Copied under a temporary name first: a copy cut short by a crash is not taken for today's backup.
    const part = path.join(this.dir, `${name}.part`);
    rmSync(part, { force: true });
    snapshot(this.db, part);
    renameSync(part, path.join(this.dir, name));
    for (const old of [...existing, name].sort().slice(0, -this.keep)) rmSync(path.join(this.dir, old), { force: true });
    return name;
  }

  list() {
    return readdirSync(this.dir).filter((f) => /^sdelka-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  }
}
