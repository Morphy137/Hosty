import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { ProvisionPhase } from './ServerInstaller';

export type ProvisionJobStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface ProvisionJob {
  id: string;
  instanceId: string;
  loader: string;
  version: string;
  status: ProvisionJobStatus;
  phase: ProvisionPhase | 'queued';
  bytesReceived: number;
  bytesTotal: number | null;
  /** 0-100 while downloading with a known size; null when the total is unknown. */
  percent: number | null;
  error: { code: string; message: string } | null;
}

export interface ProvisionJobEvents {
  update: [job: ProvisionJob];
}

/** Tracks long-running installations so the HTTP request can return immediately. */
export class ProvisionJobManager extends EventEmitter<ProvisionJobEvents> {
  private readonly jobs = new Map<string, ProvisionJob>();
  private readonly controllers = new Map<string, AbortController>();

  public create(init: { instanceId: string; loader: string; version: string }): {
    job: ProvisionJob;
    signal: AbortSignal;
  } {
    const job: ProvisionJob = {
      id: randomUUID(),
      ...init,
      status: 'running',
      phase: 'queued',
      bytesReceived: 0,
      bytesTotal: null,
      percent: null,
      error: null
    };
    const controller = new AbortController();
    this.jobs.set(job.id, job);
    this.controllers.set(job.id, controller);
    this.emit('update', { ...job });
    return { job: { ...job }, signal: controller.signal };
  }

  public get(id: string): ProvisionJob | undefined {
    const job = this.jobs.get(id);
    return job ? { ...job } : undefined;
  }

  public hasRunning(): boolean {
    return [...this.jobs.values()].some((job) => job.status === 'running');
  }

  public update(id: string, patch: Partial<Omit<ProvisionJob, 'id'>>): void {
    const job = this.jobs.get(id);
    if (!job) return;
    Object.assign(job, patch);
    if (patch.bytesReceived !== undefined || patch.bytesTotal !== undefined) {
      job.percent =
        job.bytesTotal && job.bytesTotal > 0
          ? Math.min(100, Math.round((job.bytesReceived / job.bytesTotal) * 100))
          : null;
    }
    this.emit('update', { ...job });
  }

  /** Requests cancellation. Returns false when the job is unknown or already finished. */
  public cancel(id: string): boolean {
    const job = this.jobs.get(id);
    const controller = this.controllers.get(id);
    if (!job || !controller || job.status !== 'running') return false;
    controller.abort();
    return true;
  }

  public finish(id: string, status: Exclude<ProvisionJobStatus, 'running'>, error?: ProvisionJob['error']): void {
    this.update(id, { status, error: error ?? null, ...(status === 'done' ? { percent: 100 } : {}) });
    this.controllers.delete(id);
  }
}

export const provisionJobs = new ProvisionJobManager();
