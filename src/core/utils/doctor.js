import path from 'path';
import fs from 'fs-extra';
import { runSilentCommand } from '../helpers/shell.js';

export class Doctor {
  /**
   * Run a health check strictly on project dependencies.
   * Uses `npx expo install --check` to verify compatibility without triggering unrelated warnings.
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
   * Attempt to fix dependency issues using a robust, graded strategy strictly bound to Expo SDK.
   * Level 1 (Soft): `npx expo install --fix`
   * Level 2 (Medium): Apply Overrides + `npm cache clean` + `npx expo install --fix`
   * Level 3 (Nuclear): Deep Clean -> Apply Overrides -> `npm install` -> `npx expo install --fix`
   *
   * @param {string} projectPath
   * @param {string[]} failedPackages - Optional list of packages that failed to install
   */
  static async fixDependencies(projectPath, failedPackages = []) {
    console.log('🚑 Doctor: Initiating Tiered Dependency Repair...');

    if (failedPackages.length > 0) {
      console.warn(
        `⚠️ Doctor Diagnosis: Failure involving: ${failedPackages.join(', ')}`
      );
    }

    // ==========================================
    // LEVEL 1: Soft Fix (Fastest)
    // ==========================================
    console.log('🔧 Level 1: Attempting soft fix (expo install --fix)...');
    try {
      await runSilentCommand(
        'npx expo install --fix',
        projectPath,
        'Applying minor SDK alignments...'
      );

      if (await this.checkHealth(projectPath)) {
        console.log('✅ Doctor: Level 1 repair successful.');
        return;
      }
    } catch (e) {
      console.log('⚠️ Doctor: Level 1 repair failed to resolve all issues.');
    }

    // ==========================================
    // LEVEL 2: Overrides & Cache Clean (Medium)
    // ==========================================
    console.log('🛡️ Level 2: Escalating to Overrides and Cache flush...');
    try {
      // 1. Force structural fixes to package.json
      await this.applyDependencyOverrides(projectPath);

      // 2. Clear corrupted npm cache
      try {
        await runSilentCommand(
          'npm cache clean --force',
          projectPath,
          'Cleaning cache...'
        );
      } catch {
        /* ignore cache errors */
      }

      // 3. Let Expo aggressively realign versions based on overrides
      await runSilentCommand(
        'npx expo install --fix',
        projectPath,
        'Aligning dependencies using Expo strictly...'
      );

      if (await this.checkHealth(projectPath)) {
        console.log('✅ Doctor: Level 2 repair successful.');
        return;
      }
    } catch (e) {
      console.log('⚠️ Doctor: Level 2 repair failed. Preparing for surgery.');
    }

    // ==========================================
    // LEVEL 3: Deep Clean (The Nuclear Option)
    // ==========================================
    console.log('🧼 Level 3: Performing Deep Clean (Nuclear Option)...');
    try {
      const nodeModulesPath = path.join(projectPath, 'node_modules');
      const lockFilePath = path.join(projectPath, 'package-lock.json');
      const yarnLockPath = path.join(projectPath, 'yarn.lock');

      // 1. تدمير البيئة الفاسدة
      await fs.remove(nodeModulesPath);
      await fs.remove(lockFilePath);
      await fs.remove(yarnLockPath);

      console.log('🛡️ Doctor: Applying Overrides to fresh package.json...');

      // 2. تحصين الأساس قبل التثبيت (هذا ما يمنع ERESOLVE)
      await this.applyDependencyOverrides(projectPath);

      console.log('🔄 Doctor: Hydrating base dependencies cleanly...');

      // 3. التثبيت النظيف (سينجح لأننا طبقنا الـ Overrides ومسحنا الكاش/الـ locks)
      await runSilentCommand(
        'npm install',
        projectPath,
        'Fresh base installation...'
      );

      // 4. تسليم القيادة لـ Expo لضبط النسخ النهائية
      await runSilentCommand(
        'npx expo install --fix',
        projectPath,
        'Finalizing Expo dependencies...'
      );

      // الفحص النهائي الصارم
      const isHealthy = await this.checkHealth(projectPath);
      if (!isHealthy) {
        throw new Error('Health check failed after Deep Clean.');
      }

      console.log(
        '✅ Doctor: Level 3 recovery successful. Project is healthy.'
      );
    } catch (criticalError) {
      console.error('❌ Doctor: All repair levels FAILED.');
      console.error(
        '❌ The dependency tree is fundamentally incompatible with this Expo SDK.'
      );
      throw new Error('FATAL: Dependency mismatch unresolved by Doctor.', {
        cause: criticalError,
      });
    }
  }

  /**
   * Enforces specific versions for critical libraries like React in package.json
   * to prevent peer dependency conflicts (ERRESOLVE).
   * @param {string} projectPath
   */
  static async applyDependencyOverrides(projectPath) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (!(await fs.pathExists(packageJsonPath))) return;

      const pkg = await fs.readJson(packageJsonPath);

      // Locate the installed React version
      const reactVersion =
        pkg.dependencies?.['react'] || pkg.devDependencies?.['react'];

      if (reactVersion) {
        console.log(
          `🛡️ Doctor: Enforcing React version: ${reactVersion} via overrides...`
        );

        // npm overrides
        pkg.overrides = {
          ...pkg.overrides,
          react: reactVersion,
          'react-refresh': '~0.14.0', // Common conflict point
        };

        // yarn resolutions
        pkg.resolutions = {
          ...pkg.resolutions,
          react: reactVersion,
          'react-refresh': '~0.14.0',
        };

        await fs.writeJson(packageJsonPath, pkg, { spaces: 2 });
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
