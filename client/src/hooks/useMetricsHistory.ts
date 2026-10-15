import { useState } from 'react';
import type { Metrics, ServerStatus } from '../types/daemon';

export const METRICS_HISTORY_SIZE = 60;

export interface MetricsHistory {
  cpu: number[];
  ramPercent: number[];
  tps: number[];
}

const EMPTY: MetricsHistory = { cpu: [], ramPercent: [], tps: [] };

const push = (series: number[], value: number): number[] => {
  const next = [...series, value];
  return next.length > METRICS_HISTORY_SIZE ? next.slice(next.length - METRICS_HISTORY_SIZE) : next;
};

interface Tracked {
  history: MetricsHistory;
  metrics: Metrics;
  status: ServerStatus;
}

/** Keeps a short rolling window of CPU / RAM / TPS samples while the server is online. */
export function useMetricsHistory(metrics: Metrics, status: ServerStatus): MetricsHistory {
  const [tracked, setTracked] = useState<Tracked>({ history: EMPTY, metrics, status });

  // Derive the next window from the new props during render (no effect, no extra commit).
  if (tracked.metrics !== metrics || tracked.status !== status) {
    let history = tracked.history;
    if (status !== 'ONLINE') {
      if (history.cpu.length > 0 && (tracked.status === 'ONLINE' || status === 'OFFLINE')) history = EMPTY;
    } else {
      const ramPercent = metrics.maxRamMb > 0 ? (metrics.ramMb / metrics.maxRamMb) * 100 : 0;
      history = {
        cpu: push(history.cpu, metrics.cpu),
        ramPercent: push(history.ramPercent, ramPercent),
        tps: push(history.tps, metrics.tps ?? 20)
      };
    }
    setTracked({ history, metrics, status });
    return history;
  }

  return tracked.history;
}
