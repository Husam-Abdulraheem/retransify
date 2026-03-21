import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoInstallerNode } from '../src/core/graph/nodes/autoInstallerNode.js';
import * as childProcess from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('autoInstallerNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should install missing dependencies and increment attempts', async () => {
    const state = {
      missingDependencies: ['lucide-react-native', '@react-navigation/native'],
      installAttempts: 0,
      rnProjectPath: '/mock/path',
      errors: [],
    };

    const result = await autoInstallerNode(state);

    expect(childProcess.execSync).toHaveBeenCalledWith(
      'npx expo install lucide-react-native @react-navigation/native',
      expect.objectContaining({ cwd: '/mock/path' })
    );

    expect(result).toEqual({
      missingDependencies: [],
      installAttempts: 1,
    });
  });

  it('should trigger circuit breaker if attempts >= 2', async () => {
    const state = {
      missingDependencies: ['fake-pkg'],
      installAttempts: 2,
      rnProjectPath: '/mock/path',
      errors: ['Previous error'],
    };

    const result = await autoInstallerNode(state);

    expect(childProcess.execSync).not.toHaveBeenCalled();

    expect(result.missingDependencies).toEqual([]);
    expect(result.installAttempts).toBe(3);
    expect(result.errors).toContain('Previous error');
    expect(
      result.errors.some((err) =>
        err.includes('Failed to auto-install package: fake-pkg')
      )
    ).toBeTruthy();
  });

  it('should do nothing if missingDependencies is empty', async () => {
    const state = {
      missingDependencies: [],
      installAttempts: 1,
    };

    const result = await autoInstallerNode(state);

    expect(childProcess.execSync).not.toHaveBeenCalled();
    expect(result).toEqual({ installAttempts: 2 });
  });
});
