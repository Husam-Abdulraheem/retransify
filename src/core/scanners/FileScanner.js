import fs from 'fs-extra';
import path from 'path';
import { FrameworkDetector } from '../detectors/FrameworkDetector.js';
import { PROJECT_PROFILES, ALLOWED_EXTENSIONS } from '../config/profiles.js';

/**
 * Smart File Scanner
 * Uses a 2-Pass Strategy to scan only important files.
 */
export async function scanProject(projectRoot, options = {}) {
  // 1. Determine framework type (either passed manually or detected automatically)
  let frameworkType = options.frameworkType;

  if (!frameworkType) {
    try {
      const detection = await FrameworkDetector.detect(projectRoot);
      frameworkType = detection.type;
      console.log(
        `🔍 Detected Framework: ${frameworkType} (Confidence: ${detection.confidence})`
      );
    } catch (error) {
      console.error('❌ Framework Detection Failed:', error.message);
      throw error; // Stop immediately if unsupported (e.g. Next.js)
    }
  }

  // 2. Load the appropriate profile
  const profile = PROJECT_PROFILES[frameworkType] || PROJECT_PROFILES.vite; // Default safe fallback
  const config = {
    ...profile,
    ...options,
  };

  const files = [];

  // 3. Execution - Pass 1: Root Files (Exact Check)
  // Scan only important root files to minimize noise
  for (const file of config.rootFiles) {
    const fullPath = path.join(projectRoot, file);
    if (await fs.pathExists(fullPath)) {
      files.push(createFileObject(fullPath, projectRoot));
    }
  }

  // 4. Execution - Pass 2: Recursive Scan
  // Recursively scan specific directories (e.g., src)
  for (const dir of config.recursiveDirs) {
    const dirPath = path.join(projectRoot, dir);
    if (await fs.pathExists(dirPath)) {
      const recursiveFiles = await walkDir(
        dirPath,
        projectRoot,
        config.ignoreDirs
      );
      files.push(...recursiveFiles);
    }
  }

  const structure = buildStructureTree(files, projectRoot);

  return {
    files,
    structure,
    framework: frameworkType,
  };
}

/**
 * Recursive walk helper function
 */
async function walkDir(dir, projectRoot, ignoreDirs) {
  let results = [];
  const list = await fs.readdir(dir);

  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = await fs.stat(fullPath);

    if (stat && stat.isDirectory()) {
      if (!ignoreDirs.includes(file)) {
        results = results.concat(
          await walkDir(fullPath, projectRoot, ignoreDirs)
        );
      }
    } else {
      const ext = path.extname(file);
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        // Filter out test files if needed?
        // Logic kept from old scanner: flag them but keep them?
        // Or remove them if they are noise? user didn't specify to remove tests, so we identify them.

        results.push(createFileObject(fullPath, projectRoot));
      }
    }
  }
  return results;
}

/**
 * Create unified file object
 */
function createFileObject(fullPath, projectRoot) {
  const relativeToProject = path.relative(projectRoot, fullPath);
  const ext = path.extname(fullPath);

  const isTest =
    fullPath.endsWith('.test.js') ||
    fullPath.endsWith('.spec.js') ||
    fullPath.endsWith('.test.jsx') ||
    fullPath.endsWith('.spec.jsx') ||
    fullPath.endsWith('.test.ts') ||
    fullPath.endsWith('.spec.ts') ||
    fullPath.endsWith('.test.tsx') ||
    fullPath.endsWith('.spec.tsx');

  return {
    absolutePath: fullPath,
    relativeToProject: normalizePath(relativeToProject),
    filename: path.basename(fullPath),
    ext,
    isTestFile: isTest,
    // Note: 'relativeToSrc' concept is fuzzy now because we scan root too.
    // We rely on 'relativeToProject' primarily.
    // [Backward Compatibility] Many helpers (pathMapper, graphBuilder) historically relied on this.
    // We polyfill it to be relativeToProject for now to prevent crashes.
    relativeToSrc: normalizePath(relativeToProject),
  };
}

/**
 * Build structure tree (for UI display or AI to understand the structure)
 */
function buildStructureTree(files, rootPath) {
  const rootNode = {
    name: path.basename(rootPath),
    type: 'directory',
    children: {},
  };

  for (const file of files) {
    const parts = file.relativeToProject.split('/');
    let current = rootNode;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          type: isLast ? 'file' : 'directory',
          children: isLast ? undefined : {},
        };
      }
      current = current.children[part];
    }
  }

  // Recursively convert children objects to arrays
  const normalizeNode = (node) => {
    if (node.type === 'file') return node;
    return {
      name: node.name,
      type: 'directory',
      children: Object.values(node.children).map(normalizeNode),
    };
  };

  return normalizeNode(rootNode);
}

function normalizePath(p) {
  return p.split(path.sep).join('/');
}
