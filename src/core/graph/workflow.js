// src/core/graph/workflow.js
import { StateGraph, END } from '@langchain/langgraph';
import { GraphState, NODE_NAMES, MAX_HEAL_ATTEMPTS } from './state.js';
import { analyzerNode } from './nodes/analyzerNode.js';
import { plannerNode } from './nodes/plannerNode.js';
import { executorNode } from './nodes/executorNode.js';
import { verifierNode } from './nodes/verifierNode.js';
import { healerNode } from './nodes/healerNode.js';
import { autoInstallerNode } from './nodes/autoInstallerNode.js';
import { contextUpdaterNode } from './nodes/contextUpdaterNode.js';
import { diskWriterNode } from './nodes/diskWriterNode.js';
import { filePickerNode } from './nodes/filePickerNode.js';
import { createModelPair } from '../ai/aiFactory.js';
import { DependencyManager } from '../helpers/dependencyManager.js';
import { RouteAnalyzer } from '../scanners/RouteAnalyzer.js';
import { ensureNativeProject } from '../services/nativeWriter.js';
import { Verifier } from '../utils/verifier.js';
import path from 'path';
import fs from 'fs-extra';

// ── Build Workflow ─────────────────────────────────────────────────────────

/**
 * Builds and returns a compiled StateGraph ready for execution
 *
 * @param {{ fastModel, smartModel }} models
 * @returns {CompiledGraph}
 */
function buildWorkflow(models) {
  const workflow = new StateGraph(GraphState);

  // ── Register Nodes ──────────────────────────────────────
  // Each node receives (state) and returns the updated part of the state

  workflow.addNode(NODE_NAMES.ANALYZER, (state) => analyzerNode(state));

  workflow.addNode(NODE_NAMES.PLANNER, (state) => plannerNode(state));

  workflow.addNode(NODE_NAMES.FILE_PICKER, (state) => filePickerNode(state));

  workflow.addNode(NODE_NAMES.EXECUTOR, (state) => executorNode(state, models));

  workflow.addNode(NODE_NAMES.VERIFIER, (state) => verifierNode(state));

  workflow.addNode(NODE_NAMES.HEALER, (state) => healerNode(state, models));

  workflow.addNode(NODE_NAMES.AUTO_INSTALLER, (state) =>
    autoInstallerNode(state)
  );

  workflow.addNode(NODE_NAMES.CONTEXT_UPDATER, (state) =>
    contextUpdaterNode(state)
  );

  workflow.addNode(NODE_NAMES.DISK_WRITER, (state) => diskWriterNode(state));

  // ── Define Static Edges ────────────────────────────
  workflow.setEntryPoint(NODE_NAMES.ANALYZER);

  workflow.addEdge(NODE_NAMES.ANALYZER, NODE_NAMES.PLANNER);
  workflow.addEdge(NODE_NAMES.PLANNER, NODE_NAMES.FILE_PICKER);

  // After FilePicker -> check if there is a file to process
  workflow.addConditionalEdges(NODE_NAMES.FILE_PICKER, shouldProcessFile, {
    process: NODE_NAMES.EXECUTOR,
    skip: NODE_NAMES.FILE_PICKER, // Skipped file -> fetch next file
    done: END, // Empty list -> done
  });

  // After Executor -> check if generation succeeded
  workflow.addConditionalEdges(NODE_NAMES.EXECUTOR, didExecutorSucceed, {
    success: NODE_NAMES.VERIFIER,
    failure: NODE_NAMES.FILE_PICKER, // Generation failed -> move to next file
  });

  // After Verifier -> either Healer (if failed) or ContextUpdater (if succeeded)
  workflow.addConditionalEdges(NODE_NAMES.VERIFIER, shouldHealOrContinue, {
    install: NODE_NAMES.AUTO_INSTALLER,
    heal: NODE_NAMES.HEALER,
    continue: NODE_NAMES.CONTEXT_UPDATER,
    giveUp: NODE_NAMES.DISK_WRITER, // Exceeded MAX_HEAL_ATTEMPTS -> write what you have
  });

  // After Healer -> always returns to Verifier to check the fix
  workflow.addEdge(NODE_NAMES.HEALER, NODE_NAMES.VERIFIER);

  // After Auto Installer -> always returns to Verifier
  workflow.addEdge(NODE_NAMES.AUTO_INSTALLER, NODE_NAMES.VERIFIER);

  workflow.addEdge(NODE_NAMES.CONTEXT_UPDATER, NODE_NAMES.DISK_WRITER);

  // After DiskWriter -> fetch next file or finish
  workflow.addEdge(NODE_NAMES.DISK_WRITER, NODE_NAMES.FILE_PICKER);

  return workflow.compile();
}

// ── Conditional Edge Functions ────────────────────────────

/**
 * Should process the current file, skip it, or finish?
 */
function shouldProcessFile(state) {
  if (!state.filesQueue || state.filesQueue.length === 0) {
    if (!state.currentFile) {
      return 'done'; // Everything is done
    }
  }

  if (!state.currentFile) {
    // Either a skipped file or the list is empty
    if (!state.filesQueue || state.filesQueue.length === 0) {
      return 'done';
    }
    return 'skip'; // Fetch next file
  }

  return 'process'; // Process current file
}

/**
 * Did ExecutorNode succeed in generating the code?
 */
function didExecutorSucceed(state) {
  if (!state.generatedCode || state.generatedCode.length < 10) {
    console.warn('⚠️  [Workflow] ExecutorNode failed - moving to next file');
    return 'failure';
  }
  return 'success';
}

/**
 * Should heal the code or continue, or install packages?
 */
function shouldHealOrContinue(state) {
  const { errors = [], missingDependencies = [], healAttempts = 0 } = state;

  if (missingDependencies.length > 0) {
    return 'install';
  }

  if (errors.length === 0) {
    return 'continue'; // No errors -> continue
  }

  if (healAttempts >= MAX_HEAL_ATTEMPTS) {
    console.warn(
      `🛑 [Workflow] Exceeded maximum heal attempts (${MAX_HEAL_ATTEMPTS}) - writing as is`
    );
    return 'giveUp'; // Exceeded limit -> write what you have
  }

  return 'heal'; // There are errors and attempts are still available
}

// ── Main Execution Function ───────────────────────────────────────────────────

/**
 * Runs the full migration workflow
 *
 * @param {string} projectPath - Web React project path
 * @param {Array} filesQueue - Array of file objects from FileScanner
 * @param {Object} options - { sdkVersion, provider, fastModelOverride, smartModelOverride }
 */
export async function runMigrationWorkflow(
  projectPath,
  filesQueue,
  options = {}
) {
  console.log('\n🚀 [Workflow] Starting migration workflow...');
  console.log(`   📁 Project: ${projectPath}`);
  console.log(`   📋 Number of files: ${filesQueue.length}`);

  // ── 1. Initialize Models ─────────────────────────────────────────
  const models = createModelPair({
    provider: options.provider,
    fastModelOverride: options.fastModelOverride,
    smartModelOverride: options.smartModelOverride,
  });

  // ── 2. Initialize DependencyManager ───────────────────────────────
  const dependencyManager = new DependencyManager({
    styleSystem: options.styleSystem || 'StyleSheet',
  });

  // ── 3. Initialize React Native Project ──────────────────────────────
  console.log('\n📱 [Workflow] Setting up React Native project...');
  const rnProjectPath = await ensureNativeProject(
    options.sdkVersion,
    dependencyManager
  );

  // ── 3.5. Phase 1: Pre-flight Dependency Resolution & Route Extraction ────────────────
  console.log(
    '\n📦 [Workflow] Executing Project-Wide Dependency Resolution (Phase 1)...'
  );
  await dependencyManager.scanAndResolve(filesQueue, models.fastModel);
  await dependencyManager.installAll(rnProjectPath);

  // ── 3.6. Route Extraction & Projection ──────────────────────────
  const routeMap = await RouteAnalyzer.analyze(projectPath, filesQueue);
  if (Object.keys(routeMap).length > 0) {
    await RouteAnalyzer.projectRoutes(rnProjectPath, routeMap);
  }

  // ── 4. Read Installed Packages ───────────────────────────────────
  let installedPackages = [];
  try {
    const pkgJsonPath = path.join(rnProjectPath, 'package.json');
    if (await fs.pathExists(pkgJsonPath)) {
      const pkg = await fs.readJson(pkgJsonPath);
      installedPackages = Object.keys({
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      });
    }
  } catch (e) {
    console.warn('⚠️  [Workflow] Failed to read package.json:', e.message);
  }

  // ── 5. Initial State ──────────────────────────────────────
  const initialState = {
    projectPath,
    rnProjectPath,
    filesQueue,
    pathMap: {},
    routeMap,
    facts: {},
    vectorStore: null,
    vectorIdMap: {},
    currentFile: null,
    generatedCode: null,
    generatedDependencies: [],
    healAttempts: 0,
    lastErrorHash: null,
    completedFiles: [],
    errors: [],
    errorLog: [],
    dependencyManager,
    installedPackages,
    options,
  };

  // ── 6. Build and Run Graph ──────────────────────────────────
  const graph = buildWorkflow(models);

  console.log('\n▶️  [Workflow] Running Graph...\n');

  try {
    const finalState = await graph.invoke(initialState, {
      // Avoid timeout on large projects
      recursionLimit: Math.max(filesQueue.length * 10, 100),
    });

    // ── 8. Final Project Verification with TypeScript ──────────────────
    console.log('\n🔍 [Workflow] Final project verification...');
    const verifier = new Verifier();
    await verifier.verifyProject(rnProjectPath);

    // ── 9. Completion Report ─────────────────────────────────────
    const completed = finalState.completedFiles?.length || 0;
    const failed = finalState.errorLog?.length || 0;

    console.log('\n✨ [Workflow] Migration completed!');
    console.log(`   ✅ Succeeded: ${completed} files`);
    console.log(`   ❌ Failed: ${failed} files`);
    console.log(`   📁 New Project: ${rnProjectPath}`);

    if (failed > 0) {
      console.log('\n⚠️  Files that failed:');
      finalState.errorLog?.forEach((e) =>
        console.log(`   - ${e.filePath}: ${e.error}`)
      );
    }

    return finalState;
  } catch (err) {
    console.error('\n💥 [Workflow] Error running Graph:', err.message);
    throw err;
  }
}
