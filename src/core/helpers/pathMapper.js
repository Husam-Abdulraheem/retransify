import path from 'path';

export class PathMapper {
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
