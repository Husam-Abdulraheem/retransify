import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { StateManager, MigrationStatus } from './stateManager.js';

const TEST_PROJECT_PATH = path.resolve(
  __dirname,
  '../../../../test-state-manager'
);
const STATE_DIR = '.retransify';
const STATE_FILE = 'state.json';
const STATE_PATH = path.join(TEST_PROJECT_PATH, STATE_DIR, STATE_FILE);

describe('StateManager', () => {
  let stateManager;

  beforeEach(() => {
    fs.ensureDirSync(path.join(TEST_PROJECT_PATH, STATE_DIR));
    // Clean up before each test
    if (fs.existsSync(STATE_PATH)) {
      fs.removeSync(STATE_PATH);
    }
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(TEST_PROJECT_PATH)) {
      fs.removeSync(TEST_PROJECT_PATH);
    }
  });

  it('should initialize with default state v2', () => {
    stateManager = new StateManager(TEST_PROJECT_PATH);
    const state = stateManager.getState();

    expect(state.version).toBe(2);
    expect(state.meta.totalFailures).toBe(0);
    expect(state.files).toEqual({});
  });

  it('should migrate v1 state to v2', () => {
    // Setup v1 state
    const v1State = {
      fileStatus: {
        'file1.js': 'COMPLETED',
        'file2.js': 'ERROR',
      },
      lastUpdated: '2023-01-01T00:00:00.000Z',
    };
    fs.writeJsonSync(STATE_PATH, v1State);

    stateManager = new StateManager(TEST_PROJECT_PATH);
    const state = stateManager.getState();

    expect(state.version).toBe(2);
    expect(state.files['file1.js'].status).toBe('COMPLETED');
    expect(state.files['file1.js'].attempts).toBe(1);
    expect(state.files['file2.js'].status).toBe('ERROR');
    expect(state.files['file2.js'].attempts).toBe(0);
  });

  it('should update file status correctly', () => {
    stateManager = new StateManager(TEST_PROJECT_PATH);

    stateManager.updateStatus('test.js', MigrationStatus.IN_PROGRESS);
    let fileData = stateManager.getFileData('test.js');
    expect(fileData.status).toBe(MigrationStatus.IN_PROGRESS);
    expect(fileData.attempts).toBe(1);

    stateManager.markAsComplete('test.js');
    fileData = stateManager.getFileData('test.js');
    expect(fileData.status).toBe(MigrationStatus.COMPLETED);
  });

  it('should forbid COMPLETED -> ERROR transition', () => {
    stateManager = new StateManager(TEST_PROJECT_PATH);
    stateManager.markAsComplete('good.js');

    expect(() => {
      stateManager.markAsError('good.js', 'Something went wrong');
    }).toThrow(/Illegal Transition/);
  });

  it('should allow ERROR -> IN_PROGRESS transition (Retry)', () => {
    stateManager = new StateManager(TEST_PROJECT_PATH);
    stateManager.markAsError('retry.js', 'First fail');

    expect(() => {
      stateManager.updateStatus('retry.js', MigrationStatus.IN_PROGRESS);
    }).not.toThrow();

    const fileData = stateManager.getFileData('retry.js');
    expect(fileData.status).toBe(MigrationStatus.IN_PROGRESS);
    expect(fileData.attempts).toBe(1); // Incremented
  });

  it('should track failure history and limit length', () => {
    stateManager = new StateManager(TEST_PROJECT_PATH);

    for (let i = 0; i < 15; i++) {
      stateManager.updateStatus('history.js', MigrationStatus.IN_PROGRESS);
      stateManager.markAsError('history.js', `Error ${i}`);
    }

    const fileData = stateManager.getFileData('history.js');
    expect(fileData.history.length).toBe(10); // MAX_HISTORY_LENGTH
    expect(fileData.history[9].errorMsg).toBe('Error 14');
  });

  it('should trigger circuit breaker after threshold', () => {
    stateManager = new StateManager(TEST_PROJECT_PATH);

    // Threshold is 20
    for (let i = 0; i < 21; i++) {
      stateManager.markAsError(`file${i}.js`, 'fail');
    }

    expect(stateManager.getState().meta.aborted).toBe(true);

    // Subsequent updates should be ignored/logged
    const consoleSpy = vi.spyOn(console, 'warn');
    stateManager.updateStatus('new.js', MigrationStatus.IN_PROGRESS);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('aborted'));
    expect(stateManager.getFileData('new.js')).toBeUndefined();
  });

  it('should persist state to disk immediately', () => {
    stateManager = new StateManager(TEST_PROJECT_PATH);
    stateManager.updateStatus('persist.js', MigrationStatus.PENDING);

    const storedState = fs.readJsonSync(STATE_PATH);
    expect(storedState.files['persist.js'].status).toBe(
      MigrationStatus.PENDING
    );
  });
});
