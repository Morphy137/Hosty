import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { DAEMON_WS_URL } from '../config/daemon';
import {
  INITIAL_DAEMON_SOCKET_STATE,
  daemonSocketReducer,
  parseDaemonMessage,
  type DaemonSocketState
} from '../state/daemonSocketReducer';
import type { DaemonAction, SocketConnectionState } from '../types/daemon';
import { computeBackoffDelay } from '../utils/backoff';

export interface DaemonSocket extends DaemonSocketState {
  connectionState: SocketConnectionState;
  /** Sends an action to the daemon. Returns false when the socket is not open. */
  sendAction: (action: DaemonAction, data?: unknown) => boolean;
  clearError: () => void;
  clearInventory: () => void;
  resetProvisionLogs: (lines: string[]) => void;
}

/** Maintains a WebSocket connection to the daemon with automatic exponential-backoff reconnects. */
export function useDaemonSocket(url: string = DAEMON_WS_URL): DaemonSocket {
  const [state, dispatch] = useReducer(daemonSocketReducer, INITIAL_DAEMON_SOCKET_STATE);
  const [connectionState, setConnectionState] = useState<SocketConnectionState>('connecting');
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let currentSocket: WebSocket | null = null;

    const scheduleReconnect = () => {
      const delay = computeBackoffDelay(reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        setConnectionState('connecting');
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      const socket = new WebSocket(url);
      currentSocket = socket;
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttempt = 0;
        setConnectionState('open');
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        const message = parseDaemonMessage(event.data);
        if (message) dispatch({ kind: 'message', message });
      };

      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (disposed) return;
        setConnectionState('closed');
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      currentSocket?.close();
      socketRef.current = null;
    };
  }, [url]);

  const sendAction = useCallback((action: DaemonAction, data?: unknown) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ action, data }));
    return true;
  }, []);

  const clearError = useCallback(() => dispatch({ kind: 'clearError' }), []);
  const clearInventory = useCallback(() => dispatch({ kind: 'clearInventory' }), []);
  const resetProvisionLogs = useCallback(
    (lines: string[]) => dispatch({ kind: 'resetProvisionLogs', lines }),
    []
  );

  return { ...state, connectionState, sendAction, clearError, clearInventory, resetProvisionLogs };
}
