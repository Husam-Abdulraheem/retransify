// src/core/graph/nodes/plannerNode.js
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

  const { filesQueue } = state;

  // ── 1. Generate path map using PathMapper (no modification) ──
  const pathMap = PathMapper.generateMap(filesQueue);
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

// ── Build simple dependency graph ─────────────────────────────────────────────

/**
 * Builds a simple dependency graph based on imports in each file
 * @param {Array} filesQueue
 * @returns {Object} { filePath: [dependencyFilePaths] }
 */
function buildDependencyGraph(filesQueue) {
  const graph = {};
  const filePathSet = new Set(
    filesQueue.map((f) => f.relativeToProject || f.filePath)
  );

  for (const fileObj of filesQueue) {
    const filePath = fileObj.relativeToProject || fileObj.filePath;
    graph[filePath] = [];

    // Use imports extracted from FileScanner if available
    const imports = fileObj.imports || [];

    for (const imp of imports) {
      const source = imp.source || imp;
      // Only relative imports matter (local files)
      if (source.startsWith('.')) {
        // Attempt to find imported file in files list
        const resolvedPath = resolveRelativeImport(
          filePath,
          source,
          filePathSet
        );
        if (resolvedPath) {
          graph[filePath].push(resolvedPath);
        }
      }
    }
  }

  return graph;
}

/**
 * Attempts to resolve relative import path
 */
function resolveRelativeImport(currentFile, importSource, filePathSet) {
  const parts = currentFile.split('/');
  parts.pop(); // Remove current file name
  const dir = parts.join('/');

  const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];
  const candidates = [
    `${dir}/${importSource}`,
    ...extensions.map((ext) => `${dir}/${importSource}${ext}`),
    ...extensions.map((ext) => `${dir}/${importSource}/index${ext}`),
  ];

  for (const candidate of candidates) {
    const normalized = candidate
      .replace(/\/\.\//g, '/')
      .replace(/\/[^/]+\/\.\.\//g, '/');
    if (filePathSet.has(normalized)) return normalized;
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
