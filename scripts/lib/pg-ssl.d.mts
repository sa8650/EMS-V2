import type { ClientConfig } from 'pg';
export function pgClientConfig(
  raw: string,
  opts?: { caPath?: string; readFile?: (path: string) => string },
): { config: ClientConfig; warning?: string };
