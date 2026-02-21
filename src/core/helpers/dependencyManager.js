import path from 'path';
import fs from 'fs-extra';
import { runSilentCommand } from './shell.js';
import { CONFLICT_MAP, LEGACY_TO_EXPO_MAP } from '../config/libraryRules.js';
import { setupNativeWind } from '../services/nativeWriter.js';
import { autoConfigureBabel } from '../utils/babelManager.js';
import { Doctor } from '../utils/doctor.js';

export class DependencyManager {
  /**
   * @param {Object} options
   * @param {string} options.styleSystem - 'NativeWind' or 'StyleSheet'
   */
  constructor(options = {}) {
    this.styleSystem = options.styleSystem || 'StyleSheet';
    this.pendingPackages = new Set();

    // [STRICT] Core packages that MUST be ignored to prevent version conflicts
    this.ignored = new Set([
      'react',
      'react-native',
      'expo', // Native target, so we ignore or block this
    ]);

    // [STRICT] Conflict Map: Legacy/Incompatible -> Modern Expo Equivalent
    // Imported from centralized rules
    this.conflictMap = { ...LEGACY_TO_EXPO_MAP };

    // Dynamic Conflict Mapping based on Style System
    if (this.styleSystem === 'NativeWind') {
      const nativeWindConflicts = CONFLICT_MAP['nativewind'] || [];
      nativeWindConflicts.forEach((conf) => {
        this.conflictMap[conf] = 'nativewind';
      });
    } else {
      // Strict StyleSheet: Ensure we don't accidentally allow them if not mapped
    }
  }

  /**
   * Add packages to the pending queue with strict sanitization and conflict resolution.
   * @param {string[]} packages - Array of raw package strings (e.g. "axios@latest", "lodash")
   */
  add(packages) {
    if (!packages || !Array.isArray(packages)) return;

    packages.forEach((pkg) => {
      // 1. Sanitize: Remove versions (@latest, @1.0.0) and sub-paths
      // "axios@latest" -> "axios"
      // "@react-navigation/native/src" -> "@react-navigation/native" (simplified logic: just take package name)
      // handling scoped packages like @scope/pkt
      let cleanPkg;
      if (pkg.startsWith('@')) {
        // Re-add scope if it was stripped by sloppy split or check specifically
        const parts = pkg.split('@');
        // parts[0] is empty, parts[1] is scope/name, parts[2] is version
        cleanPkg = '@' + parts[1];
      } else {
        cleanPkg = pkg.split('@')[0];
      }

      // Remove sub-paths (e.g. package/sub) - usually needed for imports but not for install
      // BUT for some libs like @expo/vector-icons, it's fine.
      // Generally npm install package/sub works if it's a valid package, but usually it's package.
      // Let's assume standard package names.

      // 2. Conflict Resolution / Auto-Mapping
      if (Object.prototype.hasOwnProperty.call(this.conflictMap, cleanPkg)) {
        const replacement = this.conflictMap[cleanPkg];

        if (replacement === null) {
          // Explicitly blocked
          // console.log(`🛡️ Blocked package: ${cleanPkg}`);
          return;
        }

        if (replacement && replacement !== 'fetch') {
          // If the replacement is NOT in ignored list (unlikely for COMMON_DEPS), install it.
          if (!this.ignored.has(replacement)) {
            this.pendingPackages.add(replacement);
          }
        }
        return;
      }

      // 3. Filter Ignored & Core Packages
      if (this.ignored.has(cleanPkg)) {
        return;
      }

      // 4. Queue valid package
      this.pendingPackages.add(cleanPkg);
    });
  }

  /**
   * The ONLY method authorized to trigger installation.
   * Installs all pending packages in a single "One Shot" batch.
   * @param {string} projectPath
   */
  async installAll(projectPath) {
    if (this.pendingPackages.size === 0) {
      console.log('📦 No new dependencies to install.');
      return;
    }

    // Convert Set to Array
    const toInstall = Array.from(this.pendingPackages);
    console.log(
      `📦 Preparing to install ${toInstall.length} collected packages...`
    );

    try {
      // 1. Check if already installed (Optimistic Check)
      // We rely on package.json to avoid redundant expo install calls
      const packageJsonPath = path.join(projectPath, 'package.json');
      let currentDeps = {};
      if (await fs.pathExists(packageJsonPath)) {
        const pkg = await fs.readJson(packageJsonPath);
        currentDeps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
        };
      }

      const missingPackages = toInstall.filter((p) => !currentDeps[p]);

      if (missingPackages.length === 0) {
        console.log(
          '✅ All packages are already in package.json. Skipping install.'
        );
        this.pendingPackages.clear();
        return;
      }

      const installCmd = `npx expo install ${missingPackages.join(' ')}`;

      // 2. EXECUTE THE ONE SHOT INSTALL
      await runSilentCommand(
        installCmd,
        projectPath,
        `📦 Installing: ${missingPackages.length} packages (Batch)...`
      );

      console.log('✅ Batch installation complete.');

      // 3. Post-Install Configs (NativeWind, Babel)
      // We can trigger these here or rely on Executor.
      // For strict SOC, Executor calls them, but DependencyManager is "managing dependencies",
      // so checking if we installed nativewind and setting it up is acceptable helper logic.
      if (missingPackages.includes('nativewind')) {
        await setupNativeWind(projectPath);
      }

      await autoConfigureBabel(projectPath);

      this.pendingPackages.clear();
    } catch {
      console.error('❌ Batch install failed.');

      // [FAIL-FAST STRATEGY]
      // Instead of retrying randomly, we delegate to Key Doctor Strategy.
      // We throw so the Executor knows we failed, OR we call Doctor here.
      // The plan says: "Implement Fail-Fast Doctor Strategy... Integration: Add logic to be invoked specifically if Phase 2 fails."

      console.log('🚑 Initiating Emergency Doctor Protocol...');
      await Doctor.fixDependencies(projectPath, toInstall);
      // If Doctor throws, it bubbles up. If it returns, we assume fixed.
      this.pendingPackages.clear();
    }
  }
}
