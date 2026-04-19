import path from 'path';

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

    const currentDir = path.dirname(currentFilePath).replace(/\\/g, '/');
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
        importedProjectRelative = path.posix
          .join(currentDir, normalizedImportString)
          .replace(/\\/g, '/');
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
    const sourceDir = path.dirname(newSourcePath);
    let relativePath = path.relative(sourceDir, newTargetPath);

    // Enforce POSIX slashes (Windows fix)
    relativePath = relativePath.split(path.sep).join('/');

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
   * Generates a map of old paths to new paths using Structural Mirroring.
   */
  static generateMap(files, routeMap = {}, navigationSchema = {}) {
    const pathMap = {};
    const routeGroup =
      navigationSchema.type === 'tabs'
        ? '(tabs)'
        : navigationSchema.type === 'drawer'
          ? '(drawer)'
          : null;

    for (const file of files) {
      if (file.isVirtual) {
        pathMap[file.relativeToProject] = file.relativeToProject;
        continue;
      }

      const oldPath = file.relativeToProject;
      let refinedPath;

      if (routeMap[oldPath]) {
        refinedPath = routeMap[oldPath];

        if (routeGroup) {
          const normalizedTabs = (navigationSchema.tabs || []).map((p) =>
            p.toLowerCase()
          );
          const normalizedDrawer = (navigationSchema.drawerScreens || []).map(
            (p) => p.toLowerCase()
          );
          const normalizedPath = refinedPath.toLowerCase();

          const groupBase = refinedPath.startsWith('src/app/')
            ? 'src/app'
            : 'app';

          if (!refinedPath.includes(`${groupBase}/${routeGroup}/`)) {
            if (
              navigationSchema.type === 'tabs' &&
              normalizedTabs.includes(normalizedPath)
            ) {
              refinedPath = refinedPath.replace(
                `${groupBase}/`,
                `${groupBase}/${routeGroup}/`
              );
            } else if (
              navigationSchema.type === 'drawer' &&
              normalizedDrawer.includes(normalizedPath)
            ) {
              refinedPath = refinedPath.replace(
                `${groupBase}/`,
                `${groupBase}/${routeGroup}/`
              );
            }
          }
        }
      } else {
        refinedPath = this.determineNewPath(file);
      }

      // Uniform casing for routing paths in app/ or src/app/
      if (
        refinedPath.startsWith('app/') ||
        refinedPath.startsWith('src/app/')
      ) {
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
    let normalizedPath = file.relativeToProject.replace(/\\/g, '/');

    const ext = path.extname(normalizedPath);
    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      const newExt = file.hasJSX ? '.tsx' : '.ts';
      return normalizedPath.replace(/\.[tj]sx?$/i, newExt);
    }

    return normalizedPath;
  }
}
