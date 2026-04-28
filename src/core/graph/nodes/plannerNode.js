// src/core/graph/nodes/plannerNode.js
import { AstManager } from '../../services/AstManager.js';
import path from 'path';
import { PathMapper } from '../../helpers/pathMapper.js';
import { printStep, printSubStep, printWarning } from '../../utils/ui.js';
import { BlueprintManager } from '../blueprints/BlueprintManager.js';

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
  printStep('Planner — ordering files for conversion');

  const {
    filesQueue,
    routeMap = {},
    navigationSchema = {},
    globalProviders = [],
  } = state;

  // Deterministic Expo Router root (chosen by user): always `app/`
  const appRoot = 'app';

  // ── 0. Inject Blueprints (Root Layout, Group Layout, Redirects) ────────────
  BlueprintManager.injectBlueprints(
    filesQueue,
    navigationSchema,
    globalProviders
  );

  // ── 1. Generate path map using PathMapper (using new routeMap) ──
  const pathMap = PathMapper.generateMap(
    filesQueue,
    routeMap,
    navigationSchema
  );
  if (state.assetMap) {
    Object.assign(pathMap, state.assetMap);
  }
  printSubStep(`Path map generated for ${Object.keys(pathMap).length} files`);

  // ── 1.1. Semantic Grouping Router (Tabs / Drawer) ─────────────
  if (navigationSchema.type === 'tabs' || navigationSchema.type === 'drawer') {
    const groupName = navigationSchema.type; // 'tabs' أو 'drawer'
    const explicitScreens = navigationSchema.screens || []; // شاشات محددة مسبقاً (إن وجدت)
    let groupedCount = 0;

    Object.keys(pathMap).forEach((sourcePath) => {
      const expoPath = pathMap[sourcePath];

      // القاعدة 1: يُمنع منعاً باتاً وضع المسارات الديناميكية داخل التبويبات
      if (expoPath.includes('[')) return;

      // GUARD: يمنع نقل الملف الوهمي الجذر (الذي وظيفته إعادة التوجيه) إلى داخل التابات
      const fileObj = filesQueue.find(
        (f) => f.relativeToProject === sourcePath
      );
      if (fileObj?.isVirtual && expoPath === 'app/index.tsx') return;

      // القاعدة 2: تحديد ما إذا كان الملف شاشة رئيسية تستحق أن تكون Tab/Drawer
      const isIndex = expoPath === 'app/index.tsx';
      const isExplicit = explicitScreens.includes(expoPath);
      // التقاط الشاشات المسطحة ذات المستوى الأول (مثل app/profile.tsx) وتجاهل المتعمقة (مثل app/ui/alert.tsx)
      const isTopLevelStatic =
        expoPath.split('/').length === 2 && !expoPath.includes('_layout');

      // إذا حقق الشروط، ولم نتجاوز الحد الأقصى للتبويبات (5 كحد أقصى لمنع التشوه البصري)
      if (
        (isIndex ||
          isExplicit ||
          (explicitScreens.length === 0 && isTopLevelStatic)) &&
        groupedCount < 5
      ) {
        // نقل الملف من الجذر إلى مجلد المجموعة: app/dashboard.tsx -> app/(tabs)/dashboard.tsx
        pathMap[sourcePath] = expoPath.replace('app/', `app/(${groupName})/`);
        groupedCount++;
      }
    });
    printSubStep(
      `Smart Routing: Moved ${groupedCount} screens into /(${groupName}) layout.`
    );
  }

  // ── 1.5. Ensure Root Index (Smart Mapping) ─────────────────────────────
  // Determine the target index based on navigation schema.
  // GUARD: Virtual fallback files MUST stay at the root app/index.tsx to act as
  // global entry points/fallbacks. Only real discovered components should move into groups.
  const isGroupNav =
    navigationSchema.type === 'tabs' || navigationSchema.type === 'drawer';
  const groupName = navigationSchema.type === 'tabs' ? 'tabs' : 'drawer';

  // We'll decide the final path later based on whether we are using a real file or a virtual one.
  const groupIndexPath = isGroupNav
    ? `${appRoot}/(${groupName})/index.tsx`
    : `${appRoot}/index.tsx`;
  const rootIndexPath = `${appRoot}/index.tsx`;

  // Check if the target index is already mapped (by RouteAnalyzer or prior step)
  const hasRootIndex = Object.values(pathMap).some(
    (p) => p === groupIndexPath || p === rootIndexPath
  );

  // ── Priority 1: HomeScreenResolver AST-driven dual mapping ───────────
  const homeResolution = state.homeResolution || null;

  if (homeResolution?.homeFilePath) {
    // ✅ Real component discovered -> Map to Group Index if applicable
    pathMap[homeResolution.homeFilePath] = groupIndexPath;
    printSubStep(`[HomeResolver] Mapped true home screen → ${groupIndexPath}`);

    if (homeResolution.appFilePath) {
      const layoutPath = `${appRoot}/_layout.tsx`;
      pathMap[homeResolution.appFilePath] = layoutPath;
      printSubStep(
        `[HomeResolver] Mapped App container → ${layoutPath} (preserves Providers)`
      );

      const virtualLayoutIndex = filesQueue.findIndex(
        (f) => f.isVirtual && f.relativeToProject === layoutPath
      );
      if (virtualLayoutIndex !== -1) {
        filesQueue.splice(virtualLayoutIndex, 1);
        delete pathMap[layoutPath];
      }
    }
  } else if (!hasRootIndex) {
    // ── Priority 2: Name-based fallback (App.jsx / App.tsx) ──────────
    const appComponentFile = filesQueue.find((f) =>
      f.relativeToProject.match(/App\.(jsx|tsx|js|ts)$/i)
    );

    if (appComponentFile) {
      pathMap[appComponentFile.relativeToProject] = groupIndexPath;
      printSubStep(`Mapped main App component to ${groupIndexPath}`);
    } else {
      // ── Priority 3: Virtual index file (STRICTLY AT ROOT) ──────────
      BlueprintManager.ensureFallbackIndex(
        filesQueue,
        pathMap,
        groupIndexPath,
        rootIndexPath
      );
    }
  } else if (!homeResolution) {
    const appComponentFile = filesQueue.find((f) =>
      f.relativeToProject.match(/App\.(jsx|tsx|js|ts)$/i)
    );
    if (appComponentFile) {
      const layoutPath = `${appRoot}/_layout.tsx`;
      pathMap[appComponentFile.relativeToProject] = layoutPath;
      printSubStep(`Mapped main App component to ${layoutPath} (wrapper)`);

      const virtualLayoutIndex = filesQueue.findIndex(
        (f) => f.isVirtual && f.relativeToProject === layoutPath
      );
      if (virtualLayoutIndex !== -1) {
        filesQueue.splice(virtualLayoutIndex, 1);
        delete pathMap[layoutPath];
      }
    }
  }

  // ── 2. Build dependency graph from file imports ─────────────
  const dependencyGraph = buildDependencyGraph(filesQueue);

  // ── 3. Sort files (Topological Sort - dependencies processed first) ──
  const sortedFiles = topologicalSort(dependencyGraph, filesQueue);
  printSubStep(`Conversion order (${sortedFiles.length} files):`);

  sortedFiles.slice(0, 5).forEach((f, i) => {
    const filePath = f.relativeToProject || f.filePath;
    printSubStep(`${i + 1}. ${filePath}`, 1);
  });

  if (sortedFiles.length > 5) {
    printSubStep(`... and ${sortedFiles.length - 5} more`, 1, true);
  } else if (sortedFiles.length > 0) {
    // If we have files but <= 5, the last one should have the end branch
    // But for a list, it's cleaner to just mark the last item explicitly if it's the end of the step.
    // However, the conversion order is an intermediate step.
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

  const project = AstManager.getWebProject();

  // 2. Add files to the project and initialize the graph tree
  for (const fileObj of filesQueue) {
    graph[fileObj.relativeToProject] = [];
    try {
      project.addSourceFileAtPath(fileObj.absolutePath);
    } catch {
      printWarning(`Planner skipped: ${fileObj.absolutePath}`);
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
