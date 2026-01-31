import fs from 'fs-extra';
import path from 'path';

/**
 * @typedef {import('../types').MigrationState} MigrationState
 * @typedef {import('../types').MigrationStatus} MigrationStatus
 */

const STATE_DIR = '.retransify';
const STATE_FILE = 'state.json';

export class StateManager {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.stateFilePath = path.join(projectPath, STATE_DIR, STATE_FILE);
    this.state = this._loadState();
  }

  /**
   * @returns {MigrationState}
   * @private
   */
  _loadState() {
    if (fs.existsSync(this.stateFilePath)) {
      try {
        return fs.readJsonSync(this.stateFilePath);
      } catch (error) {
        console.warn('⚠️ Failed to load migration state, starting fresh.', error);
      }
    }
    return { fileStatus: {}, lastUpdated: new Date().toISOString() };
  }

  _saveState() {
    this.state.lastUpdated = new Date().toISOString();
    // outputJsonSync creates the directory if it doesn't exist
    fs.outputJsonSync(this.stateFilePath, this.state, { spaces: 2 });
  }

  /**
   * @param {string} filePath 
   * @param {MigrationStatus} status 
   * @param {string} [errorMsg] 
   */
  updateStatus(filePath, status, errorMsg = null) {
    this.state.fileStatus[filePath] = status;
    if (errorMsg) {
       // In a real app we might store errors in a separate map or object structure
       // For now, we print it or could add an 'errors' object to state
       console.error(`❌ Error in ${filePath}: ${errorMsg}`);
    }
    this._saveState();
  }

  /**
   * @param {string} filePath 
   */
  markAsComplete(filePath) {
    this.updateStatus(filePath, 'COMPLETED');
  }

  /**
   * @param {string} filePath 
   * @param {string} errorMsg
   */
  markAsError(filePath, errorMsg) {
    this.updateStatus(filePath, 'ERROR', errorMsg);
  }

  /**
   * @param {string} filePath 
   * @returns {boolean}
   */
  isConverted(filePath) {
    return this.state.fileStatus[filePath] === 'COMPLETED';
  }

  /**
   * @param {string} filePath 
   * @returns {MigrationStatus}
   */
  getStatus(filePath) {
    return this.state.fileStatus[filePath] || 'PENDING';
  }
  
  /**
   * @returns {MigrationState}
   */
   getState() {
     return this.state;
   }
}
