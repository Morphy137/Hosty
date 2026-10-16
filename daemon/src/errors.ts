export type DaemonErrorCode =
  | 'INVALID_LOADER'
  | 'INVALID_VERSION'
  | 'INVALID_PAYLOAD'
  | 'INVALID_FILENAME'
  | 'CONFIG_NOT_FOUND'
  | 'SERVER_RUNNING'
  | 'INSTALL_IN_PROGRESS'
  | 'INSTALL_CANCELLED'
  | 'UPSTREAM_ERROR'
  | 'INVALID_FOLDER'
  | 'BRIDGE_ASSET_MISSING'
  | 'GAME_UNAVAILABLE'
  | 'SETTINGS_CORRUPT'
  | 'INTERNAL_ERROR';

const HTTP_STATUS_BY_CODE: Record<DaemonErrorCode, number> = {
  INVALID_LOADER: 400,
  INVALID_VERSION: 400,
  INVALID_PAYLOAD: 400,
  INVALID_FILENAME: 400,
  CONFIG_NOT_FOUND: 404,
  SERVER_RUNNING: 409,
  INSTALL_IN_PROGRESS: 409,
  INSTALL_CANCELLED: 409,
  UPSTREAM_ERROR: 502,
  INVALID_FOLDER: 400,
  BRIDGE_ASSET_MISSING: 500,
  GAME_UNAVAILABLE: 409,
  SETTINGS_CORRUPT: 500,
  INTERNAL_ERROR: 500
};

/** Domain error carrying a stable machine-readable code that the client maps to i18n keys. */
export class DaemonError extends Error {
  public readonly httpStatus: number;

  constructor(
    public readonly code: DaemonErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DaemonError';
    this.httpStatus = HTTP_STATUS_BY_CODE[code];
  }
}

export interface ErrorResponseBody {
  error: { code: DaemonErrorCode; message: string };
}

export const toErrorResponse = (err: unknown): { status: number; body: ErrorResponseBody } => {
  if (err instanceof DaemonError) {
    return { status: err.httpStatus, body: { error: { code: err.code, message: err.message } } };
  }

  const message = err instanceof Error ? err.message : 'Unexpected error';
  return { status: HTTP_STATUS_BY_CODE.INTERNAL_ERROR, body: { error: { code: 'INTERNAL_ERROR', message } } };
};
