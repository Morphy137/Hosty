import { describe, it, expect } from 'vitest';
import {
  parseErrorResponse,
  toErrorPayload,
  DaemonApiError,
  UNKNOWN_ERROR_CODE
} from '../src/api/daemonApi';
import { toConfigPayload, updateEntryValue } from '../src/utils/configEntries';

describe('daemonApi utilities', () => {
  it('parses structured error response', async () => {
    const mockResponse = new Response(
      JSON.stringify({ error: { code: 'SERVER_RUNNING', message: 'Cannot modify' } }),
      { status: 409, statusText: 'Conflict' }
    );
    const apiError = await parseErrorResponse(mockResponse);
    expect(apiError).toBeInstanceOf(DaemonApiError);
    expect(apiError.code).toBe('SERVER_RUNNING');
    expect(apiError.status).toBe(409);
    expect(apiError.message).toBe('Cannot modify');
  });

  it('falls back to UNKNOWN when response error payload is malformed', async () => {
    const mockResponse = new Response('Non-JSON HTML Error', {
      status: 502,
      statusText: 'Bad Gateway'
    });
    const apiError = await parseErrorResponse(mockResponse);
    expect(apiError.code).toBe(UNKNOWN_ERROR_CODE);
    expect(apiError.status).toBe(502);
  });

  it('normalizes various error types with toErrorPayload', () => {
    const apiErr = new DaemonApiError('JAVA_NOT_FOUND', 'Java missing', 400);
    expect(toErrorPayload(apiErr)).toEqual({ code: 'JAVA_NOT_FOUND', message: 'Java missing' });

    const stdErr = new Error('Generic error');
    expect(toErrorPayload(stdErr)).toEqual({ code: UNKNOWN_ERROR_CODE, message: 'Generic error' });

    expect(toErrorPayload('string error')).toEqual({
      code: UNKNOWN_ERROR_CODE,
      message: 'string error'
    });
  });

  it('converts config entries array to payload map', () => {
    const entries = [
      { key: 'motd', value: 'Hello', type: 'string' as const },
      { key: 'port', value: 25565, type: 'number' as const }
    ];
    expect(toConfigPayload(entries)).toEqual({ motd: 'Hello', port: 25565 });
  });

  it('updates entry value by key', () => {
    const entries = [
      { key: 'motd', value: 'Hello', type: 'string' as const },
      { key: 'online', value: true, type: 'boolean' as const }
    ];
    const updated = updateEntryValue(entries, 'online', false);
    expect(updated[1].value).toBe(false);
  });
});
