import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "../types/bindings";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const TURN_LEASE_MS = 5 * 60 * 1000;

export type StudySessionStateRecord = {
  concept_id: number;
  reached: boolean;
  hint_index: number;
  last_grade: string;
  active: boolean;
};

export type StudySessionSnapshot = {
  revision: number;
  states: Record<string, StudySessionStateRecord>;
};

/** 1学習セッションの状態を、バージョン付きで原子的に保存する。 */
export class StudySession extends DurableObject<Bindings> {
  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS session_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          revision INTEGER NOT NULL,
          payload TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS session_lock (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          token TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
    });
  }

  /** LLMを呼ぶ前に1セッション1ターンへ直列化する。期限切れなら自動回復する。 */
  async tryAcquire(token: string): Promise<{
    acquired: boolean;
    retryAfterMs: number;
  }> {
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "DELETE FROM session_lock WHERE id = 1 AND expires_at <= ?",
      now,
    );
    const inserted = this.ctx.storage.sql
      .exec<{ token: string }>(
        `INSERT INTO session_lock (id, token, expires_at)
         VALUES (1, ?, ?)
         ON CONFLICT (id) DO NOTHING
         RETURNING token`,
        token,
        now + TURN_LEASE_MS,
      )
      .toArray();
    if (inserted.length > 0) return { acquired: true, retryAfterMs: 0 };

    const lock = this.ctx.storage.sql
      .exec<{ token: string; expires_at: number }>(
        "SELECT token, expires_at FROM session_lock WHERE id = 1",
      )
      .toArray()[0];
    if (lock?.token === token) return { acquired: true, retryAfterMs: 0 };
    return {
      acquired: false,
      retryAfterMs: Math.max(1, (lock?.expires_at ?? now + 1) - now),
    };
  }

  async getSnapshot(): Promise<StudySessionSnapshot> {
    const row = this.ctx.storage.sql
      .exec<{ revision: number; payload: string; expires_at: number }>(
        "SELECT revision, payload, expires_at FROM session_state WHERE id = 1",
      )
      .toArray()[0];
    if (!row) return { revision: 0, states: {} };
    if (row.expires_at <= Date.now()) {
      this.ctx.storage.sql.exec("DELETE FROM session_state WHERE id = 1");
      return { revision: 0, states: {} };
    }
    return {
      revision: row.revision,
      states: JSON.parse(row.payload) as Record<string, StudySessionStateRecord>,
    };
  }

  async commit(
    expectedRevision: number,
    states: Record<string, StudySessionStateRecord>,
    lockToken: string,
  ): Promise<boolean> {
    const lock = this.ctx.storage.sql
      .exec<{ token: string; expires_at: number }>(
        "SELECT token, expires_at FROM session_lock WHERE id = 1",
      )
      .toArray()[0];
    if (!lock || lock.token !== lockToken || lock.expires_at <= Date.now()) {
      return false;
    }

    const nextRevision = expectedRevision + 1;
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const payload = JSON.stringify(states);
    const rows =
      expectedRevision === 0
        ? this.ctx.storage.sql
            .exec<{ revision: number }>(
              `INSERT INTO session_state (id, revision, payload, expires_at)
               VALUES (1, ?, ?, ?)
               ON CONFLICT (id) DO NOTHING
               RETURNING revision`,
              nextRevision,
              payload,
              expiresAt,
            )
            .toArray()
        : this.ctx.storage.sql
            .exec<{ revision: number }>(
              `UPDATE session_state
                  SET revision = ?, payload = ?, expires_at = ?
                WHERE id = 1 AND revision = ?
              RETURNING revision`,
              nextRevision,
              payload,
              expiresAt,
              expectedRevision,
            )
            .toArray();
    if (rows.length === 0) return false;
    this.ctx.storage.sql.exec(
      "DELETE FROM session_lock WHERE id = 1 AND token = ?",
      lockToken,
    );
    try {
      await this.ctx.storage.setAlarm(expiresAt);
    } catch {
      // Expiration is cleanup only; a failed alarm must not turn a committed turn into an error.
    }
    return true;
  }

  async release(lockToken: string): Promise<void> {
    this.ctx.storage.sql.exec(
      "DELETE FROM session_lock WHERE id = 1 AND token = ?",
      lockToken,
    );
  }

  async alarm(): Promise<void> {
    const row = this.ctx.storage.sql
      .exec<{ expires_at: number }>(
        "SELECT expires_at FROM session_state WHERE id = 1",
      )
      .toArray()[0];
    if (!row || row.expires_at <= Date.now()) {
      this.ctx.storage.sql.exec("DELETE FROM session_state WHERE id = 1");
      return;
    }
    await this.ctx.storage.setAlarm(row.expires_at);
  }
}
