import fs from 'fs-extra';
import path from 'path';



const STATE_DIR = '.retransify';
const STATE_FILE = 'state.json';

const GLOBAL_FAILURE_THRESHOLD = 20;
const MAX_HISTORY_LENGTH = 10;

/**
 * @typedef {Object} MigrationState
 * 
 * @typedef {'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ERROR' | 'SKIPPED' | 'FAILED_PERMANENTLY'} MigrationStatusType
 */

export const MigrationStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR',
  SKIPPED: 'SKIPPED',
  FAILED_PERMANENTLY: 'FAILED_PERMANENTLY'
};

export class StateManager {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.stateFilePath = path.join(projectPath, STATE_DIR, STATE_FILE);
    this.state = this._loadState();
  }

  /**
   * @private
   */
  _loadState() {
    if (fs.existsSync(this.stateFilePath)) {
      try {
        const rawState = fs.readJsonSync(this.stateFilePath);
        return this._migrate(rawState);
      } catch (error) {
        console.warn('⚠️ Failed to load migration state, starting fresh.', error);
      }
    }
    return this._getInitialState();
  }

  _getInitialState() {
    return {
      version: 2,
      meta: {
        totalFailures: 0,
        aborted: false,
        lastUpdated: new Date().toISOString()
      },
      files: {}
    };
  }

  /**
   * Migrates older state versions to the current schema.
   * @param {Object} oldState 
   */
  _migrate(oldState) {
    if (!oldState.version) {
      // Migrate v1 ( { fileStatus: {}, lastUpdated: ... } ) -> v2
      console.log('📦 Migrating State from v1 to v2...');
      const newState = this._getInitialState();
      
      if (oldState.fileStatus) {
        for (const [filePath, status] of Object.entries(oldState.fileStatus)) {
          newState.files[filePath] = {
            status: status, // Map directly as v1 strings match v2 enum mostly
            attempts: status === MigrationStatus.COMPLETED ? 1 : 0,
            lastErrorHash: null,
            history: []
          };
        }
      }
      return newState;
    }
    
    // Future migrations go here (e.g., v2 -> v3)
    
    return oldState;
  }

  _saveState() {
    this.state.meta.lastUpdated = new Date().toISOString();
    
    // Atomic Write: Write to .tmp then rename
    const tmpPath = `${this.stateFilePath}.tmp`;
    
    try {
      // Ensure dir exists
      fs.ensureDirSync(path.dirname(this.stateFilePath));
      
      fs.writeJsonSync(tmpPath, this.state, { spaces: 2 });
      fs.renameSync(tmpPath, this.stateFilePath);
    } catch (error) {
      console.error('❌ CRITICAL: Failed to save state atomically:', error);
    }
  }

  /**
   * @param {string} filePath 
   * @param {MigrationStatusType} newStatus 
   * @param {Object} [metadata] - { errorMsg, errorHash, etc. }
   */
  updateStatus(filePath, newStatus, metadata = {}) {
    // circuit breaker check
    if (this.state.meta.aborted) {
      console.warn('🛑 Operation aborted due to high failure rate. Fix issues and reset state.');
      return;
    }

    // Ensure file entry exists
    if (!this.state.files[filePath]) {
      this.state.files[filePath] = {
        status: MigrationStatus.PENDING,
        attempts: 0,
        lastErrorHash: null,
        history: []
      };
    }

    const fileData = this.state.files[filePath];
    const currentStatus = fileData.status;

    // Strict Validations
    if (currentStatus === MigrationStatus.COMPLETED && newStatus === MigrationStatus.ERROR) {
      throw new Error(`❌ Illegal Transition: Cannot move ${filePath} from COMPLETED to ERROR.`);
    }

    // Update Data
    fileData.status = newStatus;
    
    if (newStatus === MigrationStatus.IN_PROGRESS) {
      fileData.attempts += 1;
    }

    if (newStatus === MigrationStatus.ERROR) {
      this.state.meta.totalFailures += 1;
      
      if (metadata.errorHash) {
          fileData.lastErrorHash = metadata.errorHash;
      }
      
      // Check Global Circuit Breaker
      if (this.state.meta.totalFailures > GLOBAL_FAILURE_THRESHOLD) {
          this.state.meta.aborted = true;
          console.error(`🛑 ABORTING: Total failures (${this.state.meta.totalFailures}) exceeded threshold.`);
      }
    }

    // History Logic
    const historyEntry = {
      status: newStatus,
      timestamp: new Date().toISOString(),
      ...metadata
    };
    
    fileData.history.push(historyEntry);
    
    // Truncate History
    if (fileData.history.length > MAX_HISTORY_LENGTH) {
      fileData.history.shift();
    }

    // Save Immediately
    this._saveState();
  }

  /**
   * @param {string} filePath 
   */
  markAsComplete(filePath) {
    this.updateStatus(filePath, MigrationStatus.COMPLETED);
  }

  /**
   * @param {string} filePath 
   * @param {string} errorMsg
   * @param {string} [errorHash]
   */
  markAsError(filePath, errorMsg, errorHash = null) {
      this.updateStatus(filePath, MigrationStatus.ERROR, { errorMsg, errorHash });
  }

  /**
   * @param {string} filePath 
   * @returns {boolean}
   */
  isConverted(filePath) {
    return this.state.files[filePath]?.status === MigrationStatus.COMPLETED;
  }

  /**
   * @param {string} filePath 
   * @returns {MigrationStatus}
   */
  getStatus(filePath) {
    return this.state.files[filePath]?.status || MigrationStatus.PENDING;
  }
  
  /**
   * @returns {Object}
   */
   getState() {
     return this.state;
   }
   
   /**
    * Returns the file data object including history and attempts
    * @param {string} filePath
    */
   getFileData(filePath) {
       return this.state.files[filePath];
   }
}
