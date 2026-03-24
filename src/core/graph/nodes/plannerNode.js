// src/core/graph/nodes/plannerNode.js
import { Project } from 'ts-morph';
import path from 'path';
import { PathMapper } from '../../helpers/pathMapper.js';

/**
 * PlannerNode - Orders files and creates the paths map
 *
 * Inputs from state:
 * - state.filesQueue: Array of file objects (from FileScanner)
 *
 * Outputs to state:
 * - state.filesQueue: Sorted array (Topological Sort - dependencies first)
 * - state.pathMap: Map of old -> new paths
 *
 * @param {import('../state.js').GraphState} state
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function plannerNode(state) {
  console.log('\n🗺️  [PlannerNode] Starting conversion ordering planning...');

  const { filesQueue, routeMap = {} } = state;

  // ── 1. Generate path map using PathMapper (using new routeMap) ──
  const pathMap = PathMapper.generateMap(filesQueue, routeMap);
  console.log(
    `📍 [PlannerNode] Generated path map for ${Object.keys(pathMap).length} files`
  );

  // ── 2. Build dependency graph from file imports ─────────────
  const dependencyGraph = buildDependencyGraph(filesQueue);

  // ── 3. Sort files (Topological Sort - dependencies processed first) ──
  const sortedFiles = topologicalSort(dependencyGraph, filesQueue);
  console.log(`✅ [PlannerNode] Conversion order: ${sortedFiles.length} files`);

  // Print first 5 files for verification
  sortedFiles.slice(0, 5).forEach((f, i) => {
    const filePath = f.relativeToProject || f.filePath;
    console.log(`   ${i + 1}. ${filePath}`);
  });
  if (sortedFiles.length > 5) {
    console.log(`   ... and ${sortedFiles.length - 5} more files`);
  }

  return {
    filesQueue: sortedFiles,
    pathMap,
  };
}

// ── Build AST-based dependency graph using ts-morph ───────────────────────────

function buildDependencyGraph(filesQueue) {
  const graph = {};
  const filePathSet = new Set(filesQueue.map((f) => f.relativeToProject));

  // 1. Initialize a very lightweight ts-morph project in memory
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    // No need for deep dependency resolution here, just a quick structural (AST) scan
    skipFileDependencyResolution: true,
  });

  // 2. Add files to the project and initialize the graph tree
  for (const fileObj of filesQueue) {
    graph[fileObj.relativeToProject] = [];
    try {
      project.addSourceFileAtPath(fileObj.absolutePath);
    } catch {
      console.warn(
        `⚠️ [PlannerNode] Failed to load file into ts-morph: ${fileObj.absolutePath}`
      );
    }
  }

  // 3. Extract imports with high precision via the AST
  for (const fileObj of filesQueue) {
    const filePath = fileObj.relativeToProject;
    const sourceFile = project.getSourceFile(fileObj.absolutePath);

    if (!sourceFile) continue;

    // Get all imports and exports
    const importDeclarations = sourceFile.getImportDeclarations();
    const exportDeclarations = sourceFile.getExportDeclarations();

    // Extract Module Specifiers like './components/Button'
    const moduleSpecifiers = [
      ...importDeclarations.map((decl) => decl.getModuleSpecifierValue()),
      ...exportDeclarations
        .map((decl) => decl.getModuleSpecifierValue())
        .filter(Boolean),
    ];

    for (const source of moduleSpecifiers) {
      if (source && source.startsWith('.')) {
        const resolvedPath = resolveRelativeImport(
          filePath,
          source,
          filePathSet
        );
        if (resolvedPath) {
          // Add dependency: this file depends on resolvedPath
          graph[filePath].push(resolvedPath);
        }
      }
    }
  }

  return graph;
}

/**
 * Attempts to resolve relative import path accurately using path.posix
 */
function resolveRelativeImport(currentFile, importSource, filePathSet) {
  const dir = path.posix.dirname(currentFile);
  const resolvedRaw = path.posix.join(dir, importSource);

  const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];

  const candidates = [
    resolvedRaw,
    ...extensions.map((ext) => `${resolvedRaw}${ext}`),
    ...extensions.map((ext) => `${resolvedRaw}/index${ext}`),
  ];

  for (const candidate of candidates) {
    if (filePathSet.has(candidate)) return candidate;
  }

  return null;
}
// ── Topological Sort ──────────────────────────────────────────────────────────

/**
 * Sorts files so dependencies (utils, hooks) come before components using them
 *
 * @param {Object} graph - { filePath: [dependencies] }
 * @param {Array} filesQueue - Original array of file objects
 * @returns {Array} Sorted array of file objects
 */
function topologicalSort(graph, filesQueue) {
  const visited = new Set();
  const tempVisited = new Set();
  const sortedPaths = [];

  const visit = (node) => {
    if (tempVisited.has(node)) return; // Cycle detected - ignore
    if (visited.has(node)) return;

    tempVisited.add(node);

    const dependencies = graph[node] || [];
    for (const dep of dependencies) {
      visit(dep);
    }

    tempVisited.delete(node);
    visited.add(node);
    sortedPaths.push(node);
  };

  for (const node of Object.keys(graph)) {
    visit(node);
  }

  // Convert sorted paths back to original file objects
  const fileMap = {};
  filesQueue.forEach((f) => {
    const key = f.relativeToProject || f.filePath;
    fileMap[key] = f;
  });

  // Reorder while preserving files not added to graph
  const sortedFiles = sortedPaths
    .filter((p) => fileMap[p])
    .map((p) => fileMap[p]);

  // Add any files not in graph (unvisited)
  const sortedSet = new Set(sortedPaths);
  filesQueue.forEach((f) => {
    const key = f.relativeToProject || f.filePath;
    if (!sortedSet.has(key)) {
      sortedFiles.push(f);
    }
  });

  return sortedFiles;
}
