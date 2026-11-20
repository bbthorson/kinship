import type { ReplayGuard } from './service-auth';

/** `INSERT OR IGNORE` is the atomic check-and-set: one of two racing claims changes zero rows. */
export class D1ReplayGuard implements ReplayGuard {
  constructor(private db: D1Database, private now: () => number = Date.now) {}

  async claim(id: string, expiresAtS: number): Promise<boolean> {
    const res = await this.db.prepare('INSERT OR IGNORE INTO seen_tokens (id, expires_at) VALUES (?, ?)').bind(id, expiresAtS).run();
    return res.meta.changes === 1;
  }

  /** Called from the scheduled handler. */
  async sweep(): Promise<void> {
    await this.db.prepare('DELETE FROM seen_tokens WHERE expires_at < ?').bind(Math.floor(this.now() / 1000) - 60).run();
  }
}
