import path from 'path';
import fs from 'fs-extra';
import { runSilentCommand } from '../helpers/shell.js';

export class Doctor {
  /**
   * Run a health check on the project dependencies.
   * Uses `npx expo install --check` to verify compatibility.
   * @param {string} projectPath
   * @returns {Promise<boolean>} true if healthy, false if issues found
   */
  static async checkHealth(projectPath) {
    console.log('🩺 Doctor: Checking dependency health...');
    try {
      await runSilentCommand(
        'npx expo install --check',
        projectPath,
        '🩺 diagnostic check...'
      );
      console.log('✅ Doctor: Project dependencies are healthy.');
      return true;
    } catch {
      console.warn('⚠️ Doctor: Health check found issues.');
      return false;
    }
  }

  /**
   * Attempt to fix dependency issues using a graded strategy.
   * Level 1: `npx expo install --fix`
   * Level 2: Deep Clean (Delete node_modules & lockfile -> Enforce Overrides -> Reinstall)
   * @param {string} projectPath
   */
  /**
   * Attempt to fix dependency issues using a graded strategy with STRICT verification.
   * Logic:
   * 1. Diagnose (Log only).
   * 2. Deep Clean: rm node_modules, package-lock, cache clean.
   * 3. Reinstall: npx expo install (NO flags).
   * 4. Verify: npx expo doctor.
   * 5. Fail Fast: If verification fails, THROW fatal error.
   *
   * @param {string} projectPath
   * @param {string[]} failedPackages - Optional list of packages that failed to install
   */
  static async fixDependencies(projectPath, failedPackages = []) {
    console.log('🚑 Doctor: Initiating Strict Dependency Repair...');

    // 1. Diagnose (Pre-cleanup) - Logging only for debug
    if (failedPackages.length > 0) {
      console.warn(
        `⚠️ Doctor Diagnosis: Failure involving: ${failedPackages.join(', ')}`
      );
    }

    // 2. Deep Clean (The "nuclear" option)
    try {
      console.log('🧼 Doctor: Performing Deep Clean...');

      const nodeModulesPath = path.join(projectPath, 'node_modules');
      const lockFilePath = path.join(projectPath, 'package-lock.json');
      const yarnLockPath = path.join(projectPath, 'yarn.lock');
      const expoPath = path.join(projectPath, '.expo');

      await fs.remove(nodeModulesPath);
      await fs.remove(lockFilePath);
      await fs.remove(yarnLockPath);
      await fs.remove(expoPath);

      console.log('🧹 Doctor: Cleaning npm cache...');
      // Allow this to fail silently if permission denied, not critical
      try {
        await runSilentCommand(
          'npm cache clean --force',
          projectPath,
          'Cleaning cache...'
        );
      } catch {
        /* ignore */
      }

      // 3. Reinstall (Strict)
      console.log('🔄 Doctor: Reinstalling dependencies (Fresh Start)...');
      // Just npx expo install. This reads package.json and installs correct versions.
      await runSilentCommand(
        'npx expo install',
        projectPath,
        'Installing dependencies...'
      );

      // 4. Verify (Fail Fast)
      console.log('🩺 Doctor: Verifying installation health...');
      try {
        await runSilentCommand(
          'npx expo doctor',
          projectPath,
          'Final verification...'
        );
        console.log('✅ Doctor: Recovery successful. Project is healthy.');
      } catch (doctorError) {
        console.error('❌ Doctor: Verification FAILED after deep clean.');
        console.error(
          '❌ The current dependency set is incompatible with this Expo SDK version.'
        );

        // FAIL FAST
        throw new Error('FATAL: Dependency mismatch unresolved by Doctor.', {
          cause: doctorError,
        });
      }
    } catch (deepCleanError) {
      console.error('❌ Doctor: Critical failure during repair process.');
      throw deepCleanError;
    }
  }

  /**
   * Enforces specific versions for critical libraries like React in package.json
   * to preventing peer dependency conflicts (ERRESOLVE).
   * @param {string} projectPath
   */
  static async applyDependencyOverrides(projectPath) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (!(await fs.pathExists(packageJsonPath))) return;

      const pkg = await fs.readJson(packageJsonPath);

      // Find the installed React version (or default to 18.2.0 if missing, which is common for current Expo)
      // Ideally we respect what's there or what Expo installed.
      const reactVersion =
        pkg.dependencies?.['react'] || pkg.devDependencies?.['react'];

      if (reactVersion) {
        console.log(
          `🛡️ Doctor: Enforcing React version: ${reactVersion} via overrides...`
        );

        // npm uses 'overrides'
        pkg.overrides = {
          ...pkg.overrides,
          react: reactVersion,
          'react-refresh': '~0.14.0', // Common conflict point
        };

        // yarn uses 'resolutions'
        pkg.resolutions = {
          ...pkg.resolutions,
          react: reactVersion,
          'react-refresh': '~0.14.0',
        };

        await fs.writeJson(packageJsonPath, pkg, { spaces: 2 });
        console.log('✅ Doctor: Overrides applied to package.json.');
      } else {
        console.log(
          'ℹ️ Doctor: React version not found in package.json, skipping overrides.'
        );
      }
    } catch (e) {
      console.warn(
        '⚠️ Doctor: Failed to apply overrides (non-critical):',
        e.message
      );
    }
  }
}
