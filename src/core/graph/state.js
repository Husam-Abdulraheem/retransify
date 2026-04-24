// src/core/graph/state.js
import { Annotation } from '@langchain/langgraph';

/**
 * GraphState - The shared state that passes between all Nodes
 * Replaces GlobalMigrationContext and StateManager
 *
 * Each field contains a reducer that determines how the value is updated
 * (_, x) => x  means: "replace the current value with the new value"
 */
export const GraphState = Annotation.Root({
  // ── Project Information ──────────────────────────────────────
  projectPath: Annotation({
    reducer: (_, x) => x,
    default: () => '',
  }),

  // Destination React Native project path (populated after ensureNativeProject)
  targetProjectPath: Annotation({
    reducer: (_, x) => x,
    default: () => '',
  }),

  // Analyzer results (tech stack, entry files, etc.)
  facts: Annotation({
    reducer: (prev, x) => ({ ...prev, ...x }),
    default: () => ({}),
  }),

  // ── File List ────────────────────────────────────────────────
  // Array of file objects remaining for conversion (from FileScanner)
  filesQueue: Annotation({
    reducer: (_, x) => x,
    default: () => [],
  }),

  // Map of old -> new paths (from PathMapper)
  pathMap: Annotation({
    reducer: (_, x) => x,
    default: () => ({}),
  }),

  // Extracted routing map (original -> new Expo path)
  routeMap: Annotation({
    reducer: (_, x) => x,
    default: () => ({}),
  }),

  // Extracted metadata for each route (links count, inputs count, etc.)
  routeMetadata: Annotation({
    reducer: (_, x) => x,
    default: () => ({}),
  }),

  // Selected layout architecture determined by layoutAgent (tabs, drawer, modal, etc.)
  navigationSchema: Annotation({
    reducer: (_, x) => x,
    default: () => ({}),
  }),

  // ── Current File ─────────────────────────────────────────────
  // File object currently being processed
  currentFile: Annotation({
    reducer: (_, x) => x,
    default: () => null,
  }),

  // Code generated from ExecutorNode (before writing to disk)
  generatedCode: Annotation({
    reducer: (_, x) => x,
    default: () => null,
  }),

  // ── Context Store ────────────────────────────────────────────
  // ContextStore instance (populated in AnalyzerNode) — pure KV store,
  // holds pre-indexed file summaries for Deterministic JIT retrieval.
  vectorStore: Annotation({
    reducer: (_, x) => x,
    default: () => null,
  }),

  // ── State Management ─────────────────────────────────────────
  // Number of Healing attempts for current file (reset with each new file)
  healAttempts: Annotation({
    reducer: (_, x) => x,
    default: () => 0,
  }),

  // Hash of last error (to detect infinite loops in Healer)
  lastErrorHash: Annotation({
    reducer: (_, x) => x,
    default: () => null,
  }),

  // Successfully processed files (for resumption on interruption)
  completedFiles: Annotation({
    reducer: (prev, x) => {
      const set = new Set(prev);
      if (Array.isArray(x)) x.forEach((f) => set.add(f));
      else set.add(x);
      return Array.from(set);
    },
    default: () => [],
  }),

  // ── Global Providers ─────────────────────────────────────────
  // Providers detected in the project (e.g., Redux Provider, Theme Provider)
  globalProviders: Annotation({
    reducer: (_, x) => x,
    default: () => [],
  }),

  // Global Header
  globalHeader: Annotation({
    reducer: (_, x) => x,
    default: () => null,
  }),

  // True home screen discovered by HomeScreenResolver via 4-step AST chain.
  // Shape: { homeFilePath: string, homeComponentName: string, appFilePath: string|null } | null
  homeResolution: Annotation({
    reducer: (_, x) => x,
    default: () => null,
  }),

  // ── Errors ───────────────────────────────────────────────────
  // Current file errors (populated from VerifierNode)
  errors: Annotation({
    reducer: (_, x) => x,
    default: () => [],
  }),

  // Complete error log across all files
  errorLog: Annotation({
    reducer: (prev, x) => [...prev, ...x],
    default: () => [],
  }),

  // Missing dependencies to be auto-installed
  missingDependencies: Annotation({
    reducer: (_, x) => x,
    default: () => [],
  }),

  // Number of installation attempts per file
  installAttempts: Annotation({
    reducer: (_, x) => x,
    default: () => 0,
  }),

  // Number of transient-error retry attempts for the current file (reset in filePickerNode)
  retryCount: Annotation({
    reducer: (_, x) => x,
    default: () => 0,
  }),

  // ── Dependency Management ────────────────────────────────────
  // DependencyManager instance (populated at start of workflow)
  dependencyManager: Annotation({
    reducer: (_, x) => x,
    default: () => null,
  }),

  // Currently installed packages in RN project (to avoid repetition)
  installedPackages: Annotation({
    reducer: (_, x) => x,
    default: () => [],
  }),

  // ── Execution Options ────────────────────────────────────────
  options: Annotation({
    reducer: (_, x) => x,
    default: () => ({}),
  }),

  // إضافة الحقول المفقودة لمنع تسرب البيانات (Data Leaks)
  generatedDependencies: Annotation({
    reducer: (_, x) => x,
    default: () => [],
  }),
  assetMap: Annotation({
    reducer: (_, x) => x,
    default: () => ({}),
  }),
  unresolvedErrors: Annotation({
    reducer: (prev, x) => [...prev, ...(Array.isArray(x) ? x : [x])],
    default: () => [],
  }),
  // Libraries that failed to auto-install (will be reported in final report)
  failedDependencies: Annotation({
    reducer: (prev, x) => [
      ...new Set([...prev, ...(Array.isArray(x) ? x : [x])]),
    ],
    default: () => [],
  }),
});

/**
 * Node path constants - used in workflow.js for Edges
 */
export const NODE_NAMES = {
  ANALYZER: 'analyzerNode',
  PLANNER: 'plannerNode',
  EXECUTOR: 'executorNode',
  VERIFIER: 'verifierNode',
  HEALER: 'healerNode',
  AUTO_INSTALLER: 'autoInstallerNode',
  CONTEXT_UPDATER: 'contextUpdaterNode',
  DISK_WRITER: 'diskWriterNode',
  FILE_PICKER: 'filePickerNode', // Helper node: pulls next file from filesQueue
  RETRY_HANDLER: 'retryNode', // Handles transient 503/429 with exponential backoff
  GLOBAL_AUDIT: 'globalAuditNode',
  REPORTER: 'reporterNode',
  AUTO_HEALER: 'autoHealerNode',
};

export const MAX_HEAL_ATTEMPTS = 3;
