import path from 'path';
import fs from 'fs-extra';

export class StatePersistenceService {
  static STATE_FILENAME = '.retransify-state.json';

  /**
   * Load the state from the target project directory
   * @param {string} targetProjectPath
   * @returns {Promise<Object>}
   */
  static async loadState(targetProjectPath) {
    const statePath = path.join(
      targetProjectPath,
      '.retransify',
      this.STATE_FILENAME
    );

    if (await fs.pathExists(statePath)) {
      try {
        return await fs.readJson(statePath);
      } catch (err) {
        console.warn(
          `[StatePersistence] Failed to read state file: ${err.message}`
        );
        return { completedFiles: {} };
      }
    }

    return { completedFiles: {} };
  }

  /**
   * Update a file's completion state
   * @param {string} targetProjectPath
   * @param {string} sourceRelativePath
   * @param {Object} data - { hash, targetPath, timestamp }
   */
  static async updateFile(targetProjectPath, sourceRelativePath, data) {
    const stateDir = path.join(targetProjectPath, '.retransify');
    const statePath = path.join(stateDir, this.STATE_FILENAME);

    await fs.ensureDir(stateDir);

    let state = { completedFiles: {} };
    if (await fs.pathExists(statePath)) {
      try {
        state = await fs.readJson(statePath);
      } catch {
        // Reset if corrupted
      }
    }

    state.completedFiles[sourceRelativePath] = {
      ...data,
      timestamp: new Date().toISOString(),
    };

    await fs.writeJson(statePath, state, { spaces: 2 });
  }

  /**
   * Check if a file is unchanged and already processed
   * @param {Object} state - The loaded state object
   * @param {string} sourceRelativePath
   * @param {string} currentHash
   * @returns {boolean}
   */
  static isUnchanged(state, sourceRelativePath, currentHash) {
    if (!state || !state.completedFiles) return false;

    const entry = state.completedFiles[sourceRelativePath];
    if (!entry) return false;

    return entry.hash === currentHash;
  }
}
