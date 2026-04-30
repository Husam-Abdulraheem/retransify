import crypto from 'crypto';
import fs from 'fs-extra';

/**
 * Calculates SHA-256 hash of a string
 * @param {string} content
 * @returns {string}
 */
export function calculateHash(content) {
  if (!content) return '';
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Calculates SHA-256 hash of a file on disk
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function calculateFileHash(filePath) {
  try {
    if (!(await fs.pathExists(filePath))) return '';
    const content = await fs.readFile(filePath, 'utf8');
    return calculateHash(content);
  } catch {
    return '';
  }
}
