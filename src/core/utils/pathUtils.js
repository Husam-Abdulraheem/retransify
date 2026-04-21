import path from 'path';

/**
 * Normalizes a path string to use POSIX-style forward slashes.
 * Replaces backslashes with forward slashes, which is the internal standard for Retransify.
 *
 * @param {string} p - The path to normalize
 * @returns {string} - The normalized path with forward slashes
 */
export function normalizePath(p) {
  if (typeof p !== 'string') return p;
  return p.replace(/\\/g, '/');
}

/**
 * Safely calculates a relative path and normalizes it to use forward slashes.
 *
 * @param {string} from - Starting directory
 * @param {string} to - Destination path
 * @returns {string} - Normalized relative path
 */
export function getRelativePath(from, to) {
  const rel = path.relative(from, to);
  return normalizePath(rel);
}

/**
 * Safely joins paths and normalizes the result to use forward slashes.
 *
 * @param {...string} parts - Path segments to join
 * @returns {string} - Normalized joined path
 */
export function joinPaths(...parts) {
  const joined = path.join(...parts);
  return normalizePath(joined);
}
