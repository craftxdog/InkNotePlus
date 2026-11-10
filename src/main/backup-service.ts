import { realpath } from 'node:fs/promises';
import type { RestoreSummary, BackupStatus } from '../shared/transfer';
import type { BackupFiles } from './backup-files';

export class BackupService {
  #status: BackupStatus;
  #queue: Promise<unknown> = Promise.resolve();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #pending = false;
  #operations = 0;

  constructor(
    private readonly options: {
      files: BackupFiles;
      directory: string | null;
      saveDirectory: (directory: string | null) => void;
      onStatus: (status: BackupStatus) => void;
    },
  ) {
    this.#status = {
      directory: options.directory,
      state: 'idle',
      lastCompletedAt: null,
    };
    this.schedule();
  }

  get status(): BackupStatus {
    return this.#status;
  }

  get hasPendingWork(): boolean {
    return this.#pending || this.#operations > 0;
  }

  schedule(): void {
    if (!this.#status.directory) return;
    this.#pending = true;
    this.armTimer(1_000);
  }

  private armTimer(delay: number): void {
    this.#timer ??= setTimeout(() => {
      this.#timer = undefined;
      void this.enqueue(async () => {
        if (this.#pending) await this.write(false);
      });
    }, delay).unref();
  }

  enable(selection: string): Promise<BackupStatus> {
    return this.enqueue(async () => {
      if ((await realpath(selection)) === this.#status.directory)
        return this.write(true);
      const { directory, completedAt } =
        await this.options.files.create(selection);
      this.options.saveDirectory(directory);
      this.publish({ directory, lastCompletedAt: completedAt, state: 'idle' });
      // Include edits committed while the first copy was being written.
      this.schedule();
      return this.#status;
    });
  }

  disable(): Promise<BackupStatus> {
    return this.enqueue(async () => {
      this.options.saveDirectory(null);
      this.clearPending();
      this.publish({ directory: null, lastCompletedAt: null, state: 'idle' });
      return this.#status;
    });
  }

  runNow(): Promise<BackupStatus> {
    return this.enqueue(() => this.write(true));
  }

  restore(
    directory: string,
    confirm: (notes: number) => Promise<boolean>,
  ): Promise<RestoreSummary | null> {
    return this.enqueue(async () => {
      const backup = await this.options.files.read(directory);
      if (!(await confirm(backup.notes.length))) return null;
      const summary = await this.options.files.restore(backup);
      this.schedule();
      return summary;
    });
  }

  drain(): Promise<void> {
    return this.enqueue(async () => {
      if (this.#pending) await this.write(false);
    });
  }

  dispose(): void {
    this.clearPending();
  }

  private clearPending(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#pending = false;
  }

  private async write(verify: boolean): Promise<BackupStatus> {
    const { directory } = this.#status;
    this.clearPending();
    if (!directory) return this.#status;
    this.publish({ state: 'running' });
    try {
      const lastCompletedAt = await this.options.files.update(
        directory,
        verify,
      );
      this.publish({ state: 'idle', lastCompletedAt });
    } catch {
      this.publish({ state: 'error' });
      this.#pending = true;
      this.armTimer(30_000);
    }
    return this.#status;
  }

  private publish(patch: Partial<BackupStatus>): void {
    this.#status = { ...this.#status, ...patch };
    this.options.onStatus(this.#status);
  }

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    this.#operations++;
    const next = this.#queue.then(run).finally(() => {
      this.#operations--;
    });
    this.#queue = next.catch(() => {});
    return next;
  }
}
