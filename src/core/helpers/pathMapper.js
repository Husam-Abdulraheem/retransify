import path from 'path';
import {
  normalizePath,
  joinPaths,
  getRelativePath,
} from '../utils/pathUtils.js';
import { AstManager } from '../services/AstManager.js';

export class PathMapper {
  /**
   * Calculates the exact new relative import paths for a file based on pathMap.
   * Handles Path Aliases dynamically and Node-style resolution.
   *
   * @param {string} currentFilePath - Original path (relative to project)
   * @param {string} currentFileContent - Original file content
   * @param {Object} pathMap - Map of old paths to new paths
   * @param {Object} pathAliases - Dynamic aliases from tsconfig/jsconfig
   * @returns {Object} { [oldImportString]: newExactImportString }
   */
  static calculateExactImports(
    currentFilePath,
    currentFileContent,
    pathMap,
    pathAliases = {}
  ) {
    const exactImports = {};
    if (!currentFileContent || !currentFilePath || !pathMap)
      return exactImports;

    const importRegex = /(?:from|import|require\()\s*['"]([^'"]+)['"]/g;
    let match;

    const currentDir = normalizePath(path.dirname(currentFilePath));
    const newCurrentPath = pathMap[currentFilePath] || currentFilePath;

    while ((match = importRegex.exec(currentFileContent)) !== null) {
      const importString = match[1];

      let isAlias = false;
      let normalizedImportString = importString;

      for (const [alias, targets] of Object.entries(pathAliases)) {
        const aliasPrefix = alias.replace(/\*$/, '');
        if (importString.startsWith(aliasPrefix)) {
          isAlias = true;
          const targetPrefix = targets[0].replace(/\*$/, '');
          normalizedImportString = importString.replace(
            aliasPrefix,
            targetPrefix
          );
          break;
        }
      }

      if (!importString.startsWith('.') && !isAlias) {
        continue;
      }

      let importedProjectRelative;
      if (normalizedImportString.startsWith('.')) {
        importedProjectRelative = joinPaths(currentDir, normalizedImportString);
      } else {
        importedProjectRelative = normalizedImportString;
      }

      const possiblePaths = [
        importedProjectRelative,
        `${importedProjectRelative}.js`,
        `${importedProjectRelative}.jsx`,
        `${importedProjectRelative}.ts`,
        `${importedProjectRelative}.tsx`,
        `${importedProjectRelative}/index.js`,
        `${importedProjectRelative}/index.jsx`,
        `${importedProjectRelative}/index.ts`,
        `${importedProjectRelative}/index.tsx`,
      ];

      let newImportedPath = null;
      for (const possible of possiblePaths) {
        if (pathMap[possible]) {
          newImportedPath = pathMap[possible];
          break;
        }
      }

      if (!newImportedPath) {
        const dynamicMatch = Object.keys(pathMap).find((key) =>
          key.startsWith(`${importedProjectRelative}.`)
        );
        if (dynamicMatch) {
          newImportedPath = pathMap[dynamicMatch];
        }
      }

      if (newImportedPath) {
        exactImports[importString] = this.calculateExactRelativePath(
          newCurrentPath,
          newImportedPath
        );
      }
    }

    return exactImports;
  }

  /**
   * Calculates the exact POSIX-compliant relative path between two files.
   * Handles trimming of '/index' for cleaner imports.
   */
  static calculateExactRelativePath(newSourcePath, newTargetPath) {
    let relativePath = getRelativePath(
      path.dirname(newSourcePath),
      newTargetPath
    );

    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    // Remove extensions ONLY for JS/TS/JSX/TSX files
    if (/\.(jsx?|tsx?)$/i.test(relativePath)) {
      relativePath = relativePath.replace(/\.(jsx?|tsx?)$/i, '');
    }

    // Fix index imports (e.g. ./components/Button/index -> ./components/Button)
    if (relativePath.endsWith('/index')) {
      relativePath = relativePath.slice(0, -6);
      if (relativePath === '.') relativePath = './index'; // Edge case for root index
    }

    return relativePath;
  }

  /**
   * Universal Route Classifier (Tabs/Drawer/Stack)
   */
  static determineExpoRoutePath(fileRole, expoPath, navigationSchema) {
    if (fileRole !== 'route') {
      return expoPath;
    }

    // Strip app/ prefix and .tsx extension for analysis
    const rawRoute = expoPath
      .replace(/^app\//, '')
      .replace(/\.tsx$/, '')
      .replace(/^\/+|\/+$/g, '');

    const expoBaseRoute = rawRoute === '' ? 'index' : rawRoute;

    const isDynamic =
      expoBaseRoute.includes('[') || expoBaseRoute.includes('*');
    const isDeepNested = expoBaseRoute.includes('/');

    const navType = navigationSchema?.type || 'tabs';
    const mainRoutes = navigationSchema?.mainRoutes || [];

    let isTopLevelGroup = false;
    if (mainRoutes.length > 0) {
      // mainRoutes from agent might be web-style (/dashboard) or expo-style (app/dashboard.tsx)
      const normalizedMainRoutes = mainRoutes.map(
        (t) =>
          t
            .replace(/^app\//, '')
            .replace(/\.tsx$/, '')
            .replace(/^\/+|\/+$/g, '') || 'index'
      );
      isTopLevelGroup = normalizedMainRoutes.includes(expoBaseRoute);
    }

    // Final Decision
    if (isDynamic || isDeepNested || !isTopLevelGroup) {
      return `app/${expoBaseRoute}.tsx`;
    } else {
      if (navType === 'none' || navType === 'stack') {
        return `app/${expoBaseRoute}.tsx`;
      } else {
        return `app/(${navType})/${expoBaseRoute}.tsx`;
      }
    }
  }

  /**
   * Generates a map of old paths to new paths using Structural Mirroring.
   */
  static generateMap(files, routeMap = {}, navigationSchema = {}) {
    const pathMap = {};

    for (const file of files) {
      if (file.isVirtual) {
        pathMap[file.relativeToProject] = file.relativeToProject;
        continue;
      }

      const oldPath = file.relativeToProject;
      let refinedPath;

      // Semantic Role Protection
      if (
        file.role &&
        ['context', 'provider', 'hook', 'util', 'data'].includes(file.role)
      ) {
        refinedPath = this.determineNewPath(file);
      } else if (routeMap[oldPath]) {
        const baseExpoPath = routeMap[oldPath];
        refinedPath = this.determineExpoRoutePath(
          'route',
          baseExpoPath,
          navigationSchema
        );
      } else {
        refinedPath = this.determineNewPath(file);
      }

      // Uniform casing for routing paths in app/
      if (refinedPath.startsWith('app/')) {
        refinedPath = refinedPath
          .split('/')
          .map((segment) =>
            segment.includes('[') && segment.includes(']')
              ? segment
              : segment.toLowerCase()
          )
          .join('/');
      }

      pathMap[oldPath] = refinedPath;
    }

    return pathMap;
  }

  /**
   * Determines the new path for a single file using Structural Mirroring.
   * Preserves original domain architecture and prefix (src/).
   */
  static determineNewPath(file) {
    let normalizedPath = normalizePath(file.relativeToProject);

    const ext = path.extname(normalizedPath);
    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      const newExt = file.hasJSX ? '.tsx' : '.ts';
      return normalizedPath.replace(/\.[tj]sx?$/i, newExt);
    }

    return normalizedPath;
  }

  /**
   * Uses ts-morph to deterministically extract all local import paths from a
   * file's content and resolves them to project-relative paths.
   *
   * This is used by ExecutorNode for Deterministic JIT Context retrieval.
   * Using ts-morph (NOT Regex) ensures correctness with multi-line imports,
   * comments, and complex syntax.
   *
   * @param {string} fileContent - Source code of the file being converted
   * @param {string} currentFilePath - Project-relative path of the current file
   * @param {Object} pathAliases - Path aliases from tsconfig/jsconfig (optional)
   * @returns {string[]} Array of normalized project-relative paths for all local imports
   */
  static async resolveLocalImports(
    fileContent,
    currentFilePath,
    pathAliases = {}
  ) {
    if (!fileContent || !currentFilePath) return [];

    let sourceFile;
    try {
      const tempProject = AstManager.getWebProject();
      sourceFile = tempProject.createSourceFile('__temp__.tsx', fileContent);
    } catch {
      return [];
    }

    const currentDir = normalizePath(path.dirname(currentFilePath));
    const resolved = [];

    for (const imp of sourceFile.getImportDeclarations()) {
      let spec = imp.getModuleSpecifierValue();

      // Resolve path aliases to relative paths
      for (const [alias, targets] of Object.entries(pathAliases)) {
        const aliasPrefix = alias.replace(/\*$/, '');
        if (spec.startsWith(aliasPrefix)) {
          const targetPrefix = (targets[0] || '').replace(/\*$/, '');
          spec = spec.replace(aliasPrefix, targetPrefix);
          break;
        }
      }

      // Only process local/relative imports
      if (!spec.startsWith('.') && !spec.startsWith('/')) continue;

      // Resolve to project-relative path using posix
      const joined = joinPaths(currentDir, spec);

      // Attempt all common extensions (ts-morph won't resolve without file system)
      const candidates = [
        joined,
        `${joined}.js`,
        `${joined}.jsx`,
        `${joined}.ts`,
        `${joined}.tsx`,
        `${joined}/index.js`,
        `${joined}/index.jsx`,
        `${joined}/index.ts`,
        `${joined}/index.tsx`,
      ];

      resolved.push(...candidates);
    }

    return [...new Set(resolved)];
  }
}
