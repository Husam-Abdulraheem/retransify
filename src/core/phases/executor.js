import path from 'path';
import fs from 'fs-extra';
import { buildFileContext } from '../contextBuilder.js';
import { convertFileWithAI } from '../aiClient.js';
import { saveConvertedFile, ensureNativeProject } from '../nativeWriter.js';
import { DependencyManager } from '../helpers/dependencyManager.js';
import { Verifier } from './verifier.js';
import { Healer } from './healer.js';

/**
 * @typedef {import('../../types').MigrationPlan} MigrationPlan
 * @typedef {import('../../types').GlobalMigrationContext} GlobalMigrationContext
 * @typedef {import('../stateManager').StateManager} StateManager
 */

// Conflict Map: Key is the library installed in the project. Value is an array of conflicting libraries that should NOT be installed.
const CONFLICT_MAP = {
  'expo-router': ['@react-navigation/native', 'react-router-dom', 'react-router', '@react-navigation/stack', '@react-navigation/bottom-tabs'],
  'nativewind': ['styled-components', 'emotion', '@emotion/native', 'styled-components/native'],
  'twrnc': ['nativewind', 'styled-components'],
  'react-native-reanimated': [], // Typically co-exists, but good to track
};

// Blocklist for libraries that are strictly for web and break React Native
const WEB_ONLY_BLOCKLIST = [
  '@radix-ui',
  'lucide-react', // Should use 'lucide-react-native'
  'react-dom',
  'framer-motion', // Should use 'moti' or 'react-native-reanimated'
  'clsx',
  'tailwind-merge',
  'class-variance-authority',
  'react-icons' // Should use 'react-native-vector-icons' or 'lucide-react-native'
];

export class Executor {
  /**
   * @param {GlobalMigrationContext} globalContext
   * @param {MigrationPlan} plan
   * @param {StateManager} stateManager
   * @param {Object} projectContext - The full project context object from contextBuilder
   * @param {Object} options - { sdkVersion }
   */
  constructor(globalContext, plan, stateManager, projectContext, options = {}) {
    this.globalContext = globalContext;
    this.plan = plan;
    this.stateManager = stateManager;
    this.projectContext = projectContext;
    this.options = options;
    
    this.dependencyManager = new DependencyManager();
    this.verifier = new Verifier();
    this.healer = new Healer(this.verifier, options);
  }

  async execute() {
    console.log('🏗️  Starting execution phase...');

    // We need the project path to run installations later
    const rnProjectPath = await ensureNativeProject(this.options.sdkVersion);

    // 1. Read Target `package.json` to get installed packages
    let installedPackages = [];
    try {
        const pkgJsonPath = path.join(rnProjectPath, 'package.json');
        if (await fs.pathExists(pkgJsonPath)) {
            const pkg = await fs.readJson(pkgJsonPath);
            installedPackages = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
            console.log(`ℹ️  Target project has ${installedPackages.length} installed packages.`);
        }
    } catch (e) {
        console.warn("⚠️  Could not read target package.json:", e.message);
    }

    for (const filePath of this.plan.files) {
      if (this.stateManager.isConverted(filePath)) {
        console.log(`⏩ Skipping already converted: ${filePath}`);
        continue;
      }

      console.log(`\n🔄 Converting ${filePath}...`);
      
      try {
        const fileContext = buildFileContext(filePath, this.projectContext);
        
        // Inject global context & Smart Path Map
        fileContext.globalContext = this.globalContext; 
        if (this.plan?.pathMap) {
            fileContext.pathMap = this.plan.pathMap;
        }

        // [NEW] Inject Installed Packages for AI Awareness
        fileContext.installedPackages = installedPackages;

        // Convert (Now returns Object { code, dependencies })
        let { code, dependencies } = await convertFileWithAI(fileContext, this.options);
        
        // [NEW] Filter Dependencies (Conflict Resolution)
        dependencies = this.filterDependencies(dependencies, installedPackages);

        // Track Dependencies
        if (dependencies && dependencies.length > 0) {
            console.log(`   📦 Found deps: ${dependencies.join(', ')}`);
            this.dependencyManager.add(dependencies);
        }

        // Save using Smart Path if available, else fallback to 'src/' mirror
        let destPath = this.plan?.pathMap?.[filePath] || `src/${filePath}`;
        
        await saveConvertedFile(destPath, code, this.options.sdkVersion);
        
        // --- Verification & Healing Layer ---
        const errors = await this.verifier.verify(rnProjectPath, destPath);
        if (errors.length > 0) {
            const healed = await this.healer.heal(rnProjectPath, destPath, code, errors);
            if (!healed) {
                console.warn(`⚠️  Warning: ${filePath} contains unresolved errors even after healing.`);
                // We mark as error logic could fail soft or hard here.
                // For now, we proceed but log it.
            }
        }
        
        // Update State
        this.stateManager.markAsComplete(filePath);
        console.log(`✅ Success: ${filePath}`);

      } catch (error) {
        console.error(`❌ Failed: ${filePath}`, error.message);
        this.stateManager.markAsError(filePath, error.message);
      }
      
      // ⏳ Throttling for Rate Limits
      await new Promise(r => setTimeout(r, 2000));
    }

    // --- Batch Install Dependencies ---
    console.log('\n📦 Installing collected dependencies...');
    await this.dependencyManager.installAll(rnProjectPath);

    console.log('\n🎉 Execution phase complete!');
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
          if (WEB_ONLY_BLOCKLIST.some(blocked => dep.startsWith(blocked) || dep === blocked)) {
              console.log(`🛡️  Blocked web-only dependency: '${dep}'`);
              continue;
          }

          // 3. Check for conflicts
          let isConflicting = false;
          for (const [installedKey, conflictingList] of Object.entries(CONFLICT_MAP)) {
              if (installedSet.has(installedKey) && conflictingList.includes(dep)) {
                  console.log(`🛡️  Blocked conflicting dependency: '${dep}' (conflicts with installed '${installedKey}')`);
                  isConflicting = true;
                  break;
              }
          }

          if (!isConflicting) {
              filtered.push(dep);
          }
      }
      return filtered;
  }
}
