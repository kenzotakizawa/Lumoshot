import { existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

export interface ResolveScreenshotRefOptions {
  outputDirectory: string;
}

/**
 * Resolves a screenshot reference into an absolute image path.
 * Supported refs:
 * - "step_NN" alias: resolves to the first matching PNG in outputDirectory.
 * - any path: resolved against CWD and verified to exist.
 */
export function resolveScreenshotRef(
  ref: string,
  options: ResolveScreenshotRefOptions,
): string {
  if (/^step_\d+$/.test(ref)) {
    const files: string[] = readdirSync(options.outputDirectory);
    const match = files.find((f: string) => f.startsWith(ref) && f.endsWith('.png'));
    if (match) return join(options.outputDirectory, match);
    throw new Error(`No screenshot found for ref "${ref}" in ${options.outputDirectory}`);
  }

  const abs = resolve(ref);
  if (!existsSync(abs)) throw new Error(`Screenshot not found: ${abs}`);
  return abs;
}

