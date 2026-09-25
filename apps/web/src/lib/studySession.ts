/** One browser tab's identifier for a course/access route. No learner data is stored here. */
export class TabStudySession {
  private id: string | undefined;
  persistent = true;
  private readonly scope: string;

  constructor(scope: string) { this.scope = scope; }

  getId(): string {
    if (this.id) return this.id;
    try {
      this.id = window.sessionStorage.getItem(`plog-study-session:${this.scope}`) || undefined;
    } catch {
      this.persistent = false;
    }
    return this.id ?? this.restart();
  }

  restart(): string {
    this.id = crypto.randomUUID();
    try {
      window.sessionStorage.setItem(`plog-study-session:${this.scope}`, this.id);
      this.persistent = true;
    } catch {
      // Keep the new ID in this mounted panel, even if storage is blocked or full.
      // Falling back to the old stored ID would silently undo a restart.
      this.persistent = false;
    }
    return this.id;
  }
}
