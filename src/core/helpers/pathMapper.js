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
      const oldPath = file.relativeToSrc; // e.g. "pages/Home.jsx"
      const refinedPath = this.determineNewPath(file);
      pathMap[oldPath] = refinedPath;
    }

    return pathMap;
  }

  /**
   * Determines the new path for a single file.
   * @param {Object} fileString or fileObject
   * @returns {string} importable new path
   */
  static determineNewPath(file) {
    // Basic heuristics based on directory or filename
    const parts = file.relativeToSrc.split('/');
    const filename = parts[parts.length - 1];
    const basename = path.basename(filename, path.extname(filename)); // No extension
    const ext = path.extname(filename);
    
    // 1. Check folder names (strongest signal)
    if (this.isInFolder(parts, 'pages') || this.isInFolder(parts, 'screens') || this.isInFolder(parts, 'views')) {
      // It's a screen/page -> app/
      // Handle "index" or main files
        return `app/${this.cleanPath(parts, ['pages', 'screens', 'views'])}`
            .replace(/\.jsx?$/, '.tsx'); // Recommend TSX for Expo
    }

    if (this.isInFolder(parts, 'components')) {
      return `components/${this.cleanPath(parts, ['components'])}`
            .replace(/\.jsx?$/, '.tsx');
    }

    if (this.isInFolder(parts, 'hooks')) {
      return `hooks/${this.cleanPath(parts, ['hooks'])}`
            .replace(/\.jsx?$/, '.ts'); // Hooks are usually logic
    }
    
    if (this.isInFolder(parts, 'services') || this.isInFolder(parts, 'api')) {
      return `services/${this.cleanPath(parts, ['services', 'api'])}`
            .replace(/\.jsx?$/, '.ts');
    }

    if (this.isInFolder(parts, 'utils') || this.isInFolder(parts, 'helpers')) {
      return `utils/${this.cleanPath(parts, ['utils', 'helpers'])}`
            .replace(/\.jsx?$/, '.ts');
    }
    
    if (this.isInFolder(parts, 'context') || this.isInFolder(parts, 'contexts') || this.isInFolder(parts, 'providers')) {
       return `context/${this.cleanPath(parts, ['context', 'contexts', 'providers'])}`
             .replace(/\.jsx?$/, '.tsx'); // Contexts often have JSX
    }

    if (this.isInFolder(parts, 'assets') || this.isInFolder(parts, 'images') || this.isInFolder(parts, 'icons')) {
        return `assets/${this.cleanPath(parts, ['assets', 'images', 'icons'])}`;
    }

    // 2. Filename heuristics (if folder didn't match cleanly)
    if (basename.startsWith('use')) {
      return `hooks/${filename.replace(/\.js$/, '.ts')}`;
    }
    
    if (basename.endsWith('Screen') || basename.endsWith('Page')) {
        return `app/${filename.replace(/\.jsx?$/, '.tsx')}`;
    }

    // 3. Fallback: Mirror structure but inside "src" or root if appropriate
    // If it's effectively a root file like App.js or index.js
    if (file.relativeToSrc === 'App.js' || file.relativeToSrc === 'App.jsx') {
        return `app/index.tsx`; // Main App component usually becomes the index page
    }
    
    if (file.relativeToSrc === 'main.js' || file.relativeToSrc === 'main.jsx' || file.relativeToSrc === 'index.js') {
        return `app/_layout.tsx`; // The entry point that wraps everything usually becomes the layout
    }

    // Default: keep in a 'src' folder to avoid cluttering root, or just mirror
    return `src/${file.relativeToSrc.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx')}`;
  }

  static isInFolder(parts, folderName) {
    return parts.includes(folderName);
  }

  static cleanPath(parts, folderNamesToRemove) {
      // Remove the folder name from the path to avoid "components/components/Button.tsx"
      // But keep the structure *after* that folder.
      // Example: src/components/ui/Button.jsx -> parts: [ui, Button.jsx] (if we stripped src/components)
      
      // Let's filtered out the keyword folders
      const newParts = parts.filter(p => !folderNamesToRemove.includes(p));
      return newParts.join('/');
  }
}
