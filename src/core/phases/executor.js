import path from 'path';
import fs from 'fs-extra';
import { buildFileContext } from '../parser/contextBuilder.js';
import { convertFileWithAI } from '../ai/aiClient.js';
import {
  saveConvertedFile,
  ensureNativeProject,
} from '../services/nativeWriter.js';
import { DependencyManager } from '../helpers/dependencyManager.js';
import { Verifier } from './verifier.js';
import { Healer } from './healer.js';
import { Doctor } from '../utils/doctor.js';

/**
 * @typedef {import('../../types').MigrationPlan} MigrationPlan
 * @typedef {import('../../types').GlobalMigrationContext} GlobalMigrationContext
 * @typedef {import('../services/stateManager').StateManager} StateManager
 */

import {
  CONFLICT_MAP,
  WEB_ONLY_BLOCKLIST,
  COMMON_DEPENDENCIES,
} from '../config/libraryRules.js';

export class Executor {
  /**
   * @param {GlobalMigrationContext} context
   * @param {StateManager} stateManager
   * @param {Object} projectContext - The full project context object from contextBuilder
   * @param {Object} options - { sdkVersion }
   */
  constructor(context, stateManager, projectContext, options = {}) {
    this.context = context;
    this.stateManager = stateManager;
    this.projectContext = projectContext;
    this.options = options;

    // Use facts from context
    const styleSystem = this.context.facts.tech?.styling || 'StyleSheet';

    this.dependencyManager = new DependencyManager({
      styleSystem: styleSystem,
    });
    this.verifier = new Verifier();
    this.healer = new Healer(this.verifier, options);
  }

  async execute() {
    console.log(
      '🏗️  Starting execution phase (Strict 5-Phase Architecture)...'
    );

    // 0. Initialize Dependency Manager (The Collector)
    // Already did in constructor.

    // 1. Prepare Environment (Pure I/O)
    const rnProjectPath = await ensureNativeProject(
      this.options.sdkVersion,
      this.dependencyManager
    );

    // [STRICT] Conditional Tailwind Support
    const styleSystem = this.context.facts.tech?.styling || 'StyleSheet';
    if (styleSystem === 'NativeWind') {
      console.log('🌪️  NativeWind detected. Queueing Tailwind chain...');
      this.dependencyManager.add([
        'nativewind',
        'tailwindcss',
        'clsx',
        'tailwind-merge',
      ]);
    } else {
      console.log('🎨 StyleSheet detected. Skipping Tailwind dependencies.');
    }

    // 2. Read Target `package.json`
    let installedPackages = [];
    try {
      const pkgJsonPath = path.join(rnProjectPath, 'package.json');
      if (await fs.pathExists(pkgJsonPath)) {
        const pkg = await fs.readJson(pkgJsonPath);
        installedPackages = Object.keys({
          ...pkg.dependencies,
          ...pkg.devDependencies,
        });
      }
    } catch (e) {
      console.warn('⚠️  Could not read target package.json:', e.message);
    }

    // 3. Iterate & Convert Files
    // Read Decisions from Context
    const executionOrder = this.context.decisions.executionOrder || [];
    const pathMap = this.context.decisions.pathMap || {};

    for (const filePath of executionOrder) {
      if (this.stateManager.isConverted(filePath)) {
        console.log(`⏩ Skipping already converted: ${filePath}`);
        // Record result as success in context too, to keep it in sync
        this.context.addResult(filePath, 'success');
        continue;
      }

      console.log(`\n🔄 Processing ${filePath}...`);

      const baseName = path.basename(filePath);

      // 🛑 1. Force Deletion (The Kill Switch): Remove Web Mount File
      // Expo Router doesn't need main.tsx or index.js with render
      if (
        /^(main|index)\.(tsx|jsx|js|ts)$/i.test(baseName) &&
        filePath.includes('src')
      ) {
        console.log(`🚫 [DROP] Ignoring Web Mount File: ${filePath}`);
        this.context.addResult(filePath, 'skipped');
        continue;
      }

      try {
        const sourceRoot = this.context.facts.sourceRoot || '.';
        const writePhaseIgnores = this.context.facts.writePhaseIgnores || [];

        // 1. Blacklist Check
        const shouldIgnore = writePhaseIgnores.some((regex) =>
          regex.test(filePath)
        );
        if (shouldIgnore) {
          console.log(`🚫 Blocked by Profile Rule: ${filePath}`);
          this.context.addResult(filePath, 'skipped');
          continue;
        }

        const fileContext = buildFileContext(filePath, this.projectContext);

        fileContext.globalContext = this.context;
        if (pathMap) {
          fileContext.pathMap = pathMap;
        }

        // Inject Installed Packages
        fileContext.installedPackages = installedPackages;

        // 🎯 2. Smart Hijack: Catch App.tsx wherever it is
        let isAppEntry = false;
        if (/^App\.(tsx|jsx|js|ts)$/i.test(baseName)) {
          isAppEntry = true;
        } else if (
          this.context.facts.mainEntryPoint &&
          (filePath === this.context.facts.mainEntryPoint ||
            path.resolve(filePath) ===
              path.resolve(this.context.facts.mainEntryPoint))
        ) {
          isAppEntry = true;
        }

        if (isAppEntry) {
          fileContext.isMainEntry = true;
          console.log(`🎯 [HIJACK] Core App file detected: ${filePath}`);
        }

        let { code, dependencies } = await convertFileWithAI(
          fileContext,
          this.options
        );

        // Filter & Queue Dependencies
        const filteredDeps = this.filterDependencies(
          dependencies,
          installedPackages
        );
        if (filteredDeps.length > 0) {
          console.log(`   📦 Found deps: ${filteredDeps.join(', ')}`);
          this.dependencyManager.add(filteredDeps);
        }
        // Determine normalized path after stripping src
        let destPath = this._resolveDestPath(filePath, pathMap, sourceRoot);

        // 🎯 3. Final Routing: Force save path to Expo root
        if (fileContext.isMainEntry) {
          console.log(
            `🚀 [ROUTING] Forcing ${filePath} to be saved as -> app/index.tsx`
          );
          destPath = 'app/index.tsx';
        }

        await saveConvertedFile(
          destPath,
          code,
          this.options.sdkVersion,
          this.dependencyManager
        );

        // Update State
        this.stateManager.markAsComplete(filePath);
        this.context.addResult(filePath, 'success');
        console.log(`✅ Success: ${filePath}`);
      } catch (error) {
        console.error(`❌ Failed: ${filePath}`, error.message);
        this.stateManager.markAsError(filePath, error.message);
        this.context.addResult(filePath, 'failed');
      }

      // ⏳ Throttling
      await new Promise((r) => setTimeout(r, 2000));
    }

    // 4. Configuration Phase (Handled by dependency finalizer mostly)

    // 5. Batch Installation (The One Shot)
    console.log('\n📦 [ONE-SHOT] Installing ALL collected dependencies...');
    await this.dependencyManager.installAll(rnProjectPath);

    // 6. Final Health Check (Doctor)
    console.log('\n🩺 Performing final health check...');
    const isHealthy = await Doctor.checkHealth(rnProjectPath);
    if (!isHealthy) {
      console.log('🚑 Issues detected. Auto-fixing...');
      await Doctor.fixDependencies(rnProjectPath);
    }

    console.log('\n🎉 Execution phase complete!');

    // 7. Post-Install Verification & Healing Strategy (Strict Mode - Batch)
    console.log(
      '\n🧹 Starting Phase 7: Post-Install Verification & Healing (Strict Check)...'
    );

    let hasIssues = true;
    const MAX_GLOBAL_LOOPS = this.context.maxHealingAttempts || 3;
    let loopCount = 0;

    while (hasIssues && loopCount < MAX_GLOBAL_LOOPS) {
      loopCount++;
      console.log(`\n🔁 Verification Loop ${loopCount}/${MAX_GLOBAL_LOOPS}`);
      hasIssues = false; // Assume clean until found otherwise

      const filesToHeal = [];

      // Step 7a: Scan for errors
      for (const filePath of executionOrder) {
        // Only check completed files
        if (!this.stateManager.isConverted(filePath)) continue;

        const sourceRoot = this.context.facts.sourceRoot || '.';
        const destPath = this._resolveDestPath(filePath, pathMap, sourceRoot);

        // Strict Verification writing to Context
        const strictErrors = await this.verifier.verify(
          this.context,
          rnProjectPath,
          destPath,
          true
        );

        if (strictErrors.length > 0) {
          console.log(
            `🚑 Issues found in ${filePath}. Checked against Healing Contract...`
          );
          hasIssues = true;

          // Generare Error Hash for Deduplication/Loop Detection
          const errorHash = Buffer.from(strictErrors.join(''))
            .toString('base64')
            .substring(0, 16);

          // Check Healing Contract
          if (this.context.canHeal(filePath, errorHash)) {
            filesToHeal.push({ filePath, destPath, strictErrors, errorHash });
          } else {
            console.warn(
              `🛑 Skipping healing for ${filePath}: Contract denied (Max attempts or Loop detected).`
            );
            this.context.markAsUnrecoverable(
              filePath,
              'Healing Contract Denied'
            );
          }
        }
      }

      if (filesToHeal.length === 0) {
        console.log(
          '✅ No post-install issues found (or all denied). Project is stable.'
        );
        break;
      }

      console.log(`🩹 Attempting to heal ${filesToHeal.length} files...`);
      const pendingFixes = [];

      // Step 7b: Heal
      for (const {
        filePath,
        destPath,
        strictErrors,
        errorHash,
      } of filesToHeal) {
        const currentCodePath = path.join(rnProjectPath, destPath);
        let currentCode;
        try {
          currentCode = await fs.readFile(currentCodePath, 'utf-8');
        } catch {
          continue;
        }

        // Trigger Healer
        const { fixedCode, dependencies, success } = await this.healer.heal(
          this.context,
          rnProjectPath,
          destPath,
          currentCode,
          strictErrors,
          errorHash
        );

        if (success && fixedCode !== currentCode) {
          pendingFixes.push({ destPath, fixedCode, filePath });

          if (dependencies && dependencies.length > 0) {
            console.log(
              `   📦 [${filePath}] requires: ${dependencies.join(', ')}`
            );
            this.dependencyManager.add(dependencies);
          }
        } else {
          console.warn(`❌ Healer failed to fix ${filePath}.`);
        }
      }

      // Step 7c: Install New Deps
      if (pendingFixes.length > 0) {
        console.log(
          '\n📦 Installing any new dependencies required by fixes...'
        );
        await this.dependencyManager.installAll(rnProjectPath);

        // Step 7d: Apply Fixes
        console.log('\n💾 Applying valid fixes to disk...');
        for (const { destPath, fixedCode, filePath } of pendingFixes) {
          await saveConvertedFile(
            destPath,
            fixedCode,
            this.options.sdkVersion,
            this.dependencyManager
          );
          console.log(`✅ Fixed (Applied): ${filePath}`);
        }
      } else {
        console.log('⚠️ No fixes were generated in this pass.');
        break;
      }
    }

    // 8. Final Project-Wide Verification (Batch Mode)
    await this.verifier.verifyProject(rnProjectPath);

    console.log('\n✨ All phases completed.');
  }

  /**
   * Filters out libraries that conflict with what is already installed.
   * @param {string[]} newDeps - Dependencies suggested by AI
   * @param {string[]} installedDeps - Dependencies already in package.json
   * @returns {string[]} Filtered list
   */
  filterDependencies(newDeps, installedDeps) {
    if (!newDeps || newDeps.length === 0) return [];

    const installedSet = new Set(installedDeps);
    const filtered = [];

    for (const dep of newDeps) {
      // 1. Skip if already installed
      if (installedSet.has(dep)) continue;

      // 2. Block Web-Only Libraries
      if (
        WEB_ONLY_BLOCKLIST.some(
          (blocked) => dep.startsWith(blocked) || dep === blocked
        )
      ) {
        console.log(`🛡️  Blocked web-only dependency: '${dep}'`);
        continue;
      }

      // 3. Check for conflicts
      let isConflicting = false;
      for (const [installedKey, conflictingList] of Object.entries(
        CONFLICT_MAP
      )) {
        if (installedSet.has(installedKey) && conflictingList.includes(dep)) {
          console.log(
            `🛡️  Blocked conflicting dependency: '${dep}' (conflicts with installed '${installedKey}')`
          );
          isConflicting = true;
          break;
        }
      }

      if (!isConflicting) {
        // [STRICT] Suspicious Library Check
        if (
          !dep.startsWith('expo-') &&
          !dep.startsWith('@expo/') &&
          !dep.startsWith('react-native-') &&
          !COMMON_DEPENDENCIES.includes(dep)
        ) {
          console.warn(
            `⚠️  Warning: AI suggested '${dep}', which is not a standard Expo library. Review manually.`
          );
        }
        filtered.push(dep);
      }
    }
    return filtered;
  }

  /**
   * Resolves the destination path aggressively to ensure NO nested src/ directories.
   */
  _resolveDestPath(filePath, pathMap, sourceRoot) {
    // Take path from pathMap if it exists, otherwise use original path
    let targetPath =
      pathMap && pathMap[filePath] ? pathMap[filePath] : filePath;

    // Normalize paths to avoid Windows/Mac errors
    let stripped = targetPath.replace(/\\/g, '/');
    const root = (sourceRoot || '.').replace(/\\/g, '/');

    // Force stripping of src/ directory if at the start or after root
    if (stripped.startsWith('src/')) {
      stripped = stripped.substring(4);
    } else if (root !== '.' && stripped.startsWith(root + '/')) {
      stripped = stripped.substring(root.length + 1);
    }

    // Additional cleanup: if path contains /src/ in the middle (e.g. components/src/Input)
    stripped = stripped.replace(/\/src\//g, '/');

    return stripped;
  }
}
