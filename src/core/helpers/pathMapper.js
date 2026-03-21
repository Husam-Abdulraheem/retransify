import path from 'path';

export class PathMapper {
  /**
   * Calculates the exact new relative import paths for a file based on pathMap.
   * @param {string} currentFilePath - Original path (relative to project)
   * @param {string} currentFileContent - Original file content
   * @param {Object} pathMap - Map of old paths to new paths
   * @returns {Object} { [oldImportString]: newExactImportString }
   */
  static calculateExactImports(currentFilePath, currentFileContent, pathMap) {
    const exactImports = {};
    if (!currentFileContent || !currentFilePath || !pathMap)
      return exactImports;

    // Matches exactly: import ... from './something' or '../something'
    // Regex explanation:
    // (?:from|import)\s+['"](\.[^'"]+)['"] - matches `from './path'` or `import './path'`
    const importRegex = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;
    let match;

    const currentDir = path.dirname(currentFilePath).replace(/\\/g, '/'); // e.g., "src/components"
    const newCurrentPath = pathMap[currentFilePath] || currentFilePath; // e.g., "components/Button.tsx"
    const newCurrentDir = path.dirname(newCurrentPath).replace(/\\/g, '/'); // e.g., "components"

    while ((match = importRegex.exec(currentFileContent)) !== null) {
      const importString = match[1]; // e.g., "../utils/helpers"

      // 1. Resolve absolute path of the imported file in the original structure
      let importedProjectRelative = path.posix
        .join(currentDir, importString)
        .replace(/\\/g, '/');

      // 2. Find the mapped new path
      let newImportedPath = null;

      if (pathMap[importedProjectRelative]) {
        newImportedPath = pathMap[importedProjectRelative];
      } else {
        // Prefix match for missing extensions
        for (const [oldPath, newPath] of Object.entries(pathMap)) {
          const oldPathBase = oldPath.replace(/\.[^/.]+$/, '');
          if (oldPathBase === importedProjectRelative) {
            newImportedPath = newPath;
            break;
          }
        }
      }

      // 3. Calculate the exact new relative import
      if (newImportedPath) {
        let exactRelative = path.posix.relative(newCurrentDir, newImportedPath);

        // Remove extension from the new import string for clean TS/JS imports
        exactRelative = exactRelative.replace(/\.[^/.]+$/, '');

        // path.relative might return "components/Board", but it must be a relative import starting with "."
        if (!exactRelative.startsWith('.')) {
          exactRelative = './' + exactRelative;
        }

        exactImports[importString] = exactRelative;
      }
    }

    return exactImports;
  }

  /**
   * Generates a map of old paths to new paths based on file role and conventions.
   * @param {Array<Object>} files - List of file objects from fileScanner
   * @returns {Object} { pathMap: { [oldPath]: newPath }, tree: Object }
   */
  static generateMap(files) {
    const pathMap = {};

    for (const file of files) {
      const oldPath = file.relativeToProject;
      const refinedPath = this.determineNewPath(file);
      pathMap[oldPath] = refinedPath;
    }

    return pathMap;
  }

  /**
   * Determines the new path for a single file.
   * @param {Object} file - fileObject from scanner
   * @returns {string} importable new path
   */
  static determineNewPath(file) {
    // 🎯 1. Aggressive Stripping: Remove src directory from start
    let normalizedPath = file.relativeToProject.replace(/\\/g, '/');
    if (normalizedPath.startsWith('src/')) {
      normalizedPath = normalizedPath.substring(4);
    }

    const parts = normalizedPath.split('/');
    const filename = parts[parts.length - 1];
    const basename = path.basename(filename, path.extname(filename));

    // 2. Check folder names
    if (
      this.isInFolder(parts, 'pages') ||
      this.isInFolder(parts, 'screens') ||
      this.isInFolder(parts, 'views')
    ) {
      return `app/${this.cleanPath(parts, ['pages', 'screens', 'views'])}`.replace(
        /\.jsx?$/,
        '.tsx'
      );
    }

    if (this.isInFolder(parts, 'components')) {
      return `components/${this.cleanPath(parts, ['components'])}`.replace(
        /\.jsx?$/,
        '.tsx'
      );
    }

    if (this.isInFolder(parts, 'hooks')) {
      return `hooks/${this.cleanPath(parts, ['hooks'])}`.replace(
        /\.jsx?$/,
        '.ts'
      );
    }

    if (this.isInFolder(parts, 'services') || this.isInFolder(parts, 'api')) {
      return `services/${this.cleanPath(parts, ['services', 'api'])}`.replace(
        /\.jsx?$/,
        '.ts'
      );
    }

    if (this.isInFolder(parts, 'utils') || this.isInFolder(parts, 'helpers')) {
      return `utils/${this.cleanPath(parts, ['utils', 'helpers'])}`.replace(
        /\.jsx?$/,
        '.ts'
      );
    }

    if (
      this.isInFolder(parts, 'context') ||
      this.isInFolder(parts, 'contexts') ||
      this.isInFolder(parts, 'providers')
    ) {
      return `context/${this.cleanPath(parts, ['context', 'contexts', 'providers'])}`.replace(
        /\.jsx?$/,
        '.tsx'
      );
    }

    if (
      this.isInFolder(parts, 'assets') ||
      this.isInFolder(parts, 'images') ||
      this.isInFolder(parts, 'icons')
    ) {
      return `assets/${this.cleanPath(parts, ['assets', 'images', 'icons'])}`;
    }

    // 3. Filenames heuristics
    if (basename.startsWith('use')) {
      return `hooks/${filename.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx')}`;
    }

    if (basename.endsWith('Screen') || basename.endsWith('Page')) {
      return `app/${filename.replace(/\.jsx?$/, '.tsx')}`;
    }

    // 4. Fallback: Root Files
    // Mandatory routing for entry files (supports tsx and jsx)
    if (/^App\.(js|jsx|ts|tsx)$/.test(normalizedPath)) {
      return `app/index.tsx`;
    }

    if (/^(main|index)\.(js|jsx|ts|tsx)$/.test(normalizedPath)) {
      return `app/_layout.tsx`;
    }

    // 🎯 5. Final Fallback: Return clean path without adding imaginary "src/"
    // Will place remaining files in root neatly as standard in Expo Router
    return normalizedPath.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx');
  }

  static isInFolder(parts, folderName) {
    return parts.includes(folderName);
  }

  static cleanPath(parts, folderNamesToRemove) {
    // Remove folder name from path to avoid duplication
    const newParts = parts.filter((p) => !folderNamesToRemove.includes(p));
    return newParts.join('/');
  }
}
