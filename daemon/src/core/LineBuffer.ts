/**
 * Splits arbitrary stdout chunks into complete lines.
 * Child process `data` events do not respect line boundaries: one chunk may hold
 * several lines or only part of one, so regex parsing must run on whole lines.
 */
export class LineBuffer {
  private pending = '';

  public push(chunk: string): string[] {
    const combined = this.pending + chunk;
    const parts = combined.split(/\r?\n/);
    this.pending = parts.pop() ?? '';
    return parts;
  }

  public flush(): string[] {
    if (!this.pending) return [];
    const rest = this.pending;
    this.pending = '';
    return [rest];
  }
}
