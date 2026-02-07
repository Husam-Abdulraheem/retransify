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
      await runSilentCommand('npx expo install --check', projectPath, '🩺 diagnostic check...');
      console.log('✅ Doctor: Project dependencies are healthy.');
      return true;
    } catch (error) {
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
  static async fixDependencies(projectPath) {
    console.log('🚑 Doctor: Attempting to fix dependencies...');

    // Attempt 1: The "Humble" Fix
    try {
      console.log('🩹 Doctor: Applying standard fix (Level 1)...');
      await runSilentCommand('npx expo install --fix', projectPath, 'Running expo install --fix...');
      console.log('✅ Doctor: Standard fix applied successfully.');
      return;
    } catch (error) {
      console.warn('⚠️ Doctor: Standard fix failed. Escalating to Deep Clean...');
    }

    // Attempt 2: The "Deep Clean" Option
    // Delete node_modules and package-lock.json using fs-extra for Windows compatibility
    try {
      console.log('🧼 Doctor: Initiating Deep Clean & Repair (Level 2)...');
      
      const nodeModulesPath = path.join(projectPath, 'node_modules');
      const lockFilePath = path.join(projectPath, 'package-lock.json');
      const yarnLockPath = path.join(projectPath, 'yarn.lock');

      if (await fs.pathExists(nodeModulesPath)) {
        console.log('🗑️ Removing node_modules...');
        await fs.remove(nodeModulesPath);
      }
      
      if (await fs.pathExists(lockFilePath)) {
        console.log('🗑️ Removing package-lock.json...');
        await fs.remove(lockFilePath);
      }

      if (await fs.pathExists(yarnLockPath)) {
        console.log('🗑️ Removing yarn.lock...');
        await fs.remove(yarnLockPath);
      }

      // [NEW] Enforce Overrides (Resolution Strategy)
      // This forces peer dependencies to align with the installed React version.
      await this.applyDependencyOverrides(projectPath);

      // Reinstall fresh
      console.log('🔄 Doctor: Reinstalling dependencies (clean slate)...');
      await runSilentCommand('npx expo install', projectPath, 'Clean install...');
      
      // One final fix pass to be sure
      await runSilentCommand('npx expo install --fix', projectPath, 'Final fix pass...');
      
      console.log('✅ Doctor: Deep Clean recovery completed successfully.');

    } catch (deepCleanError) {
      console.error('❌ Doctor: Critical failure even after Deep Clean.');
      console.error(deepCleanError.message);
      throw deepCleanError; // Re-throw to stop execution if everything fails
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
        if (!await fs.pathExists(packageJsonPath)) return;

        const pkg = await fs.readJson(packageJsonPath);
        
        // Find the installed React version (or default to 18.2.0 if missing, which is common for current Expo)
        // Ideally we respect what's there or what Expo installed.
        const reactVersion = pkg.dependencies?.['react'] || pkg.devDependencies?.['react'];

        if (reactVersion) {
            console.log(`🛡️ Doctor: Enforcing React version: ${reactVersion} via overrides...`);
            
            // npm uses 'overrides'
            pkg.overrides = {
                ...pkg.overrides,
                "react": reactVersion,
                "react-refresh": "~0.14.0" // Common conflict point
            };

            // yarn uses 'resolutions'
            pkg.resolutions = {
                ...pkg.resolutions,
                "react": reactVersion,
                "react-refresh": "~0.14.0"
            };

            await fs.writeJson(packageJsonPath, pkg, { spaces: 2 });
            console.log('✅ Doctor: Overrides applied to package.json.');
        } else {
            console.log('ℹ️ Doctor: React version not found in package.json, skipping overrides.');
        }

    } catch (e) {
        console.warn('⚠️ Doctor: Failed to apply overrides (non-critical):', e.message);
    }
  }
}
