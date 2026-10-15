export interface PlayerPosition {
  x: number;
  y: number;
  z: number;
}

export interface PlayerJoinEvent extends PlayerPosition {
  username: string;
  dimension: string;
}

export interface EntityPositionResponse extends PlayerPosition {
  username: string;
}

export interface EntityDimensionResponse {
  username: string;
  dimension: string;
}

const DEFAULT_DIMENSION = 'overworld';
const USERNAME_PATTERN = '[a-zA-Z0-9_]{3,16}';
const NUMBER_PATTERN = '-?\\d+(?:\\.\\d+)?(?:E-?\\d+)?';

const SERVER_READY_REGEX = /Done \([\d.,]+s\)! For help, type "help"/;
const JOIN_REGEX = new RegExp(
  `:\\s(${USERNAME_PATTERN})\\[[^\\]]*\\] logged in with entity id \\d+ at \\((?:\\[([^\\]]+)\\])?\\s*(${NUMBER_PATTERN}),\\s*(${NUMBER_PATTERN}),\\s*(${NUMBER_PATTERN})\\)`
);
const LEAVE_REGEX = new RegExp(`:\\s(${USERNAME_PATTERN}) left the game`);
const POSITION_RESPONSE_REGEX = new RegExp(
  `:\\s(${USERNAME_PATTERN}) has the following entity data: \\[(${NUMBER_PATTERN})d, (${NUMBER_PATTERN})d, (${NUMBER_PATTERN})d\\]`
);
const DIMENSION_RESPONSE_REGEX = new RegExp(
  `:\\s(${USERNAME_PATTERN}) has the following entity data: "(?:[a-z0-9_.-]+:)?([a-z0-9_./-]+)"`
);

/** Bukkit/Paper world folder names mapped to vanilla dimension ids. */
const WORLD_NAME_TO_DIMENSION: Record<string, string> = {
  world: 'overworld',
  world_nether: 'the_nether',
  world_the_end: 'the_end'
};

const toBlockCoordinate = (raw: string): number => Math.round(parseFloat(raw));

export const normalizeDimension = (raw: string | undefined): string => {
  if (!raw) return DEFAULT_DIMENSION;
  const withoutNamespace = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
  return WORLD_NAME_TO_DIMENSION[withoutNamespace] ?? withoutNamespace;
};

export const isServerReadyLine = (line: string): boolean => SERVER_READY_REGEX.test(line);

export const parsePlayerJoin = (line: string): PlayerJoinEvent | null => {
  const match = line.match(JOIN_REGEX);
  if (!match) return null;

  const [, username, world, x, y, z] = match;
  return {
    username,
    dimension: normalizeDimension(world),
    x: toBlockCoordinate(x),
    y: toBlockCoordinate(y),
    z: toBlockCoordinate(z)
  };
};

export const parsePlayerLeave = (line: string): string | null => line.match(LEAVE_REGEX)?.[1] ?? null;

export const parsePositionResponse = (line: string): EntityPositionResponse | null => {
  const match = line.match(POSITION_RESPONSE_REGEX);
  if (!match) return null;

  const [, username, x, y, z] = match;
  return { username, x: toBlockCoordinate(x), y: toBlockCoordinate(y), z: toBlockCoordinate(z) };
};

export const parseDimensionResponse = (line: string): EntityDimensionResponse | null => {
  const match = line.match(DIMENSION_RESPONSE_REGEX);
  if (!match) return null;

  const [, username, dimension] = match;
  return { username, dimension: normalizeDimension(dimension) };
};
