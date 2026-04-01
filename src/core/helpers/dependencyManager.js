import path from 'path';
import fs from 'fs-extra';
import { Project } from 'ts-morph';
import { runSilentCommand } from './shell.js';
import {
  CONFLICT_MAP,
  LEGACY_TO_EXPO_MAP,
  WEB_ONLY_BLOCKLIST,
  COMMON_DEPENDENCIES,
} from '../config/libraryRules.js';
import { setupNativeWind } from '../services/StyleConfigurator.js';
import { autoConfigureBabel } from '../utils/babelManager.js';
import { Doctor } from '../utils/doctor.js';
import {
  printSubStep,
  printSubStepLast,
  printError,
  startSubSpinner,
  stopSpinner,
} from '../utils/ui.js';

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
   * Scans all files in the project for imports, resolves them, and queues the necessary packages.
   * @param {Array} filesQueue
   * @param {Object} fastModel
   */
  async scanAndResolve(filesQueue, fastModel) {
    if (!filesQueue || filesQueue.length === 0) return;
    printSubStep(`Scanning ${filesQueue.length} files for dependencies...`);

    const project = new Project({ useInMemoryFileSystem: true });

    for (const file of filesQueue) {
      if (!file.content) {
        try {
          const absolutePath = path.isAbsolute(file.filePath)
            ? file.filePath
            : path.join(process.cwd(), file.filePath);
          file.content = await fs.readFile(absolutePath, 'utf-8');
        } catch {
          file.content = '';
        }
      }

      if (!file.content) continue;

      const ext = file.filePath.match(/\.(tsx|ts|jsx|js)$/i)?.[0] || '.tsx';
      const sourceFile = project.createSourceFile(
        `temp_resolve_${Date.now()}${ext}`,
        file.content
      );

      const importDeclarations = sourceFile.getImportDeclarations();
      const importsList = importDeclarations.map((imp) =>
        imp.getModuleSpecifierValue()
      );

      file.imports = importsList;
      file.resolvedDeps = {
        safe: [],
        replaced: [],
        blocked: [],
        unknown: [],
        stubs: [],
      };

      for (const source of importsList) {
        if (source.startsWith('.') || source.startsWith('/')) continue;
        if (isCorePkg(source)) continue;

        if (isWebOnly(source)) {
          file.resolvedDeps.blocked.push(source);
          continue;
        }

        let cleanPkg = source.startsWith('@')
          ? '@' + source.split('@')[1]
          : source.split('@')[0];

        if (
          this.conflictMap[cleanPkg] !== undefined ||
          this.ignored.has(cleanPkg) ||
          isKnownExpoOrRN(cleanPkg)
        ) {
          this.add([cleanPkg]);
          file.resolvedDeps.safe.push(cleanPkg);
          continue;
        }

        // unknown — check with AI or npm
        if (fastModel) {
          const suggestion = await suggestAlternative(cleanPkg, fastModel);
          if (suggestion.action === 'use_expo' && suggestion.package) {
            this.conflictMap[cleanPkg] = suggestion.package;
            this.add([suggestion.package]);
            file.resolvedDeps.replaced.push({
              original: cleanPkg,
              replacement: suggestion.package,
            });
            // AI suggested an expo alternative
          } else if (suggestion.action === 'stub') {
            this.conflictMap[cleanPkg] = null;
          } else {
            const exists = await checkNpmPackage(cleanPkg);
            if (exists) {
              this.add([cleanPkg]);
              file.resolvedDeps.safe.push(cleanPkg);
              this.conflictMap[cleanPkg] = cleanPkg;
            } else {
              file.resolvedDeps.stubs.push(cleanPkg);
              this.conflictMap[cleanPkg] = null;
            }
          }
        } else {
          this.add([cleanPkg]);
        }
      }
    }
  }

  /**
   * The ONLY method authorized to trigger installation.
   * Installs all pending packages in a single "One Shot" batch.
   * @param {string} projectPath
   */
  async installAll(projectPath) {
    if (this.pendingPackages.size === 0) {
      printSubStepLast('All dependencies already in package.json');
      return;
    }

    // Convert Set to Array
    const toInstall = Array.from(this.pendingPackages);
    printSubStep(`Batch installing ${toInstall.length} packages...`);

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
        printSubStepLast('All packages already installed. Skipping.');
        this.pendingPackages.clear();
        return;
      }

      const installCmd = `npx expo install ${missingPackages.join(' ')}`;

      // 2. EXECUTE THE ONE SHOT INSTALL
      startSubSpinner(`Installing: ${missingPackages.length} packages...`);
      await runSilentCommand(
        installCmd,
        projectPath,
        null // Message handled by spinner
      );
      stopSpinner();

      printSubStepLast('Batch installation complete ✔');

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
      printError('Batch install failed. Initiating Doctor Protocol...');
      await Doctor.fixDependencies(projectPath, toInstall);
      this.pendingPackages.clear();
    }
  }
}

// ── Helper Functions ─────────────────────────────────────────────────────────

function isCorePkg(source) {
  const corePkgs = ['react', 'react-native', 'react-dom', 'expo'];
  return corePkgs.some((p) => source === p || source.startsWith(`${p}/`));
}

function isWebOnly(source) {
  return WEB_ONLY_BLOCKLIST.some(
    (blocked) => source === blocked || source.startsWith(`${blocked}/`)
  );
}

function isKnownExpoOrRN(source) {
  return (
    source.startsWith('expo-') ||
    source.startsWith('@expo/') ||
    source.startsWith('react-native-') ||
    source.startsWith('@react-navigation/') ||
    COMMON_DEPENDENCIES.includes(source)
  );
}

async function suggestAlternative(packageName, fastModel) {
  const prompt = `You are a React Native expert. A web package "${packageName}" needs a React Native/Expo alternative.
Respond with JSON only:
{
  "action": "use_expo" | "stub" | "keep",
  "package": "expo-package-name or null",
  "reason": "brief reason"
}
If there's a good Expo/RN alternative, use "use_expo".
If no alternative exists and it's UI-only, use "stub".
If it works in RN already, use "keep".`;

  try {
    const response = await fastModel.invoke(prompt);
    let text = response.content || response;
    if (typeof text === 'string') {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) text = jsonMatch[0];
      return JSON.parse(text);
    }
    return { action: 'keep', package: null };
  } catch {
    return { action: 'keep', package: null };
  }
}

async function checkNpmPackage(packageName) {
  try {
    runSilentCommand(`npm view ${packageName} name`, process.cwd(), null);
    return true;
  } catch {
    return false;
  }
}
