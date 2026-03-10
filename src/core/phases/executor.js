import path from 'path';
import fs from 'fs-extra';
import { ensureNativeProject } from '../services/nativeWriter.js';
import { DependencyManager } from '../helpers/dependencyManager.js';
import { Doctor } from '../utils/doctor.js';
import { createMigrationWorkflow } from '../graph/workflow.js';

import {
  CONFLICT_MAP,
  WEB_ONLY_BLOCKLIST,
  COMMON_DEPENDENCIES,
} from '../config/libraryRules.js';

export class Executor {
  /**
   * @param {Object} context
   * @param {Object} stateManager - Parameter kept for backwards compatibility but unused
   * @param {Object} projectContext
   * @param {Object} options - { sdkVersion }
   */
  constructor(context, stateManager, projectContext, options = {}) {
    this.context = context;
    this.projectContext = projectContext;
    this.options = options;

    const styleSystem = this.context?.facts?.tech?.styling || 'StyleSheet';
    this.dependencyManager = new DependencyManager({
      styleSystem: styleSystem,
    });
  }

  async execute() {
    console.log('🏗️  Starting execution phase (LangGraph Architecture)...');

    const rnProjectPath = await ensureNativeProject(
      this.options.sdkVersion,
      this.dependencyManager
    );

    const styleSystem = this.context?.facts?.tech?.styling || 'StyleSheet';
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

    const workflow = createMigrationWorkflow();

    const initialState = {
      projectPath: process.cwd(),
      filesQueue: [],
      pathMap: {},
      vectorStore: null,
      vectorIdMap: {},
      currentFile: null,
      generatedCode: null,
      errors: null,
      healerRetryCount: 0,
    };

    console.log('🔄 Running LangGraph Migration Workflow...');

    // Invoke the graph
    const finalState = await workflow.invoke(initialState);

    console.log('✅ Graph workflow complete.');

    console.log('\n📦 [ONE-SHOT] Installing ALL collected dependencies...');
    await this.dependencyManager.installAll(rnProjectPath);

    console.log('\n🩺 Performing final health check...');
    const isHealthy = await Doctor.checkHealth(rnProjectPath);
    if (!isHealthy) {
      console.log('🚑 Issues detected. Auto-fixing...');
      await Doctor.fixDependencies(rnProjectPath);
    }

    console.log('\n🎉 Execution phase complete!');
  }

  /**
   * Filters out libraries that conflict with what is already installed.
   */
  filterDependencies(newDeps, installedDeps) {
    if (!newDeps || newDeps.length === 0) return [];

    const installedSet = new Set(installedDeps);
    const filtered = [];

    for (const dep of newDeps) {
      if (installedSet.has(dep)) continue;

      if (
        WEB_ONLY_BLOCKLIST.some(
          (blocked) => dep.startsWith(blocked) || dep === blocked
        )
      ) {
        console.log(`🛡️  Blocked web-only dependency: '${dep}'`);
        continue;
      }

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
}
