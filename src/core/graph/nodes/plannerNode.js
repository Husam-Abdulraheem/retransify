// src/core/graph/nodes/plannerNode.js
import { Project } from 'ts-morph';
import path from 'path';
import { PathMapper } from '../../helpers/pathMapper.js';
import { printStep, printSubStep, printWarning } from '../../utils/ui.js';

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

  const { filesQueue, routeMap = {}, navigationSchema = {} } = state;

  // Deterministic Expo Router root (chosen by user): always `app/`
  const appRoot = 'app';

  // ── 0.1. ALWAYS Inject Root Layout (The Host for Providers & Layouts) ────────────
  const rootLayoutPath = `${appRoot}/_layout.tsx`;
  if (!filesQueue.some((f) => f.relativeToProject === rootLayoutPath)) {
    filesQueue.push({
      filePath: rootLayoutPath,
      relativeToProject: rootLayoutPath,
      absolutePath: `__virtual/${rootLayoutPath}`,
      isVirtual: true,
      hasJSX: true,
      content: [
        '// [VIRTUAL FILE INJECTED BY RETRANSIFY]',
        `import { Stack } from 'expo-router';`,
        `export default function RootLayout() {`,
        `  // AI will dynamically inject Providers and Custom Headers here based on AST Context.`,
        `  return <Stack screenOptions={{ headerShown: true }} />;\n}`,
      ].join('\n'),
    });
  }

  // ── 0.2. Inject Virtual Files for Route Groups ────────────
  if (navigationSchema.type === 'tabs' || navigationSchema.type === 'drawer') {
    const groupName = navigationSchema.type === 'tabs' ? 'tabs' : 'drawer';
    const groupLayoutPath = `${appRoot}/(${groupName})/_layout.tsx`;

    // 1. Inject group layout
    if (!filesQueue.some((f) => f.relativeToProject === groupLayoutPath)) {
      const navComponent = navigationSchema.type === 'tabs' ? 'Tabs' : 'Drawer';
      const importPath =
        navigationSchema.type === 'drawer'
          ? 'expo-router/drawer'
          : 'expo-router';
      filesQueue.push({
        filePath: groupLayoutPath,
        relativeToProject: groupLayoutPath,
        absolutePath: `__virtual/${groupLayoutPath}`,
        isVirtual: true,
        hasJSX: true,
        content: [
          '// [VIRTUAL FILE INJECTED BY RETRANSIFY]',
          `import { ${navComponent} } from '${importPath}';`,
          `export default function GroupLayout() {`,
          `  // CRITICAL: Prevent double-headers in Tabs/Drawer`,
          `  return <${navComponent} screenOptions={{ headerShown: false }} />;`,
          `}`,
        ].join('\n'),
      });
    }

    // 2. Inject redirect index
    const rootIndexPath = `${appRoot}/index.tsx`;
    if (!filesQueue.some((f) => f.relativeToProject === rootIndexPath)) {
      filesQueue.push({
        filePath: rootIndexPath,
        relativeToProject: rootIndexPath,
        absolutePath: `__virtual/${rootIndexPath}`,
        isVirtual: true,
        hasJSX: true,
        content: [
          '// [VIRTUAL FILE INJECTED BY RETRANSIFY]',
          `// TARGET: This file MUST redirect the app root / to the navigation group /(${groupName}).`,
          `// CRITICAL INSTRUCTION: You MUST import { Redirect } from 'expo-router' and return <Redirect href="/(${groupName})" />.`,
          `// DO NOT redirect to "/". You MUST redirect specifically to "/(${groupName})".`,
          `import { Redirect } from 'expo-router';`,
          `export default function Index() { return null; }`,
        ].join('\n'),
      });
    }
  }

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
  // Determine the target index based on navigation schema
  const isGroupNav =
    navigationSchema.type === 'tabs' || navigationSchema.type === 'drawer';
  const groupName = navigationSchema.type === 'tabs' ? 'tabs' : 'drawer';
  const targetIndexPath = isGroupNav
    ? `${appRoot}/(${groupName})/index.tsx`
    : `${appRoot}/index.tsx`;

  // 1. Check if the target index is already mapped
  const hasRootIndex = Object.values(pathMap).some(
    (p) => p === targetIndexPath
  );

  if (!hasRootIndex) {
    // 2. Search for the actual App component to use as entry point
    const appComponentFile = filesQueue.find((f) =>
      f.relativeToProject.match(/App\.(jsx|tsx|js|ts)$/i)
    );

    if (appComponentFile) {
      // Map App component to be the correct starting screen (Root or Tab)
      pathMap[appComponentFile.relativeToProject] = targetIndexPath;
      printSubStep(`Mapped main App component to ${targetIndexPath}`);
    } else {
      // 3. Safe Fallback: Inject a virtual index file to prevent app crash
      filesQueue.push({
        filePath: targetIndexPath,
        relativeToProject: targetIndexPath,
        absolutePath: `__virtual/${targetIndexPath}`,
        isVirtual: true,
        hasJSX: true,
        content: [
          '// [VIRTUAL FILE INJECTED BY RETRANSIFY]',
          `import { View, Text } from 'react-native';`,
          `export default function Index() {`,
          `  return (`,
          `    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>`,
          `      <Text>No explicit route or App component found.</Text>`,
          `    </View>`,
          `  );`,
          `}`,
        ].join('\n'),
      });
      pathMap[targetIndexPath] = targetIndexPath;
      printWarning(
        `No root index found. Injected virtual fallback: ${targetIndexPath}`
      );
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
