import fs from 'fs-extra';
import path from 'path';
import { FrameworkDetector } from '../detectors/FrameworkDetector.js';
import { PROJECT_PROFILES } from '../config/profiles.js';

// 🛡️ 1. Firewall: Strict Lists
const STRICT_CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const FIREWALL_IGNORED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'public',
  '.git',
  'assets',
  '.expo',
  'coverage',
];

/**
 * Smart File Scanner with Strict Firewall
 * Uses a 2-Pass Strategy to scan only important files.
 */
export async function scanProject(projectRoot, options = {}) {
  // 1. Determine framework type
  let frameworkType = options.frameworkType;

  if (!frameworkType) {
    try {
      const detection = await FrameworkDetector.detect(projectRoot);
      frameworkType = detection.type;
    } catch (error) {
      console.error('❌ Framework Detection Failed:', error.message);
      throw error;
    }
  }

  // 2. Load the appropriate profile
  const profile = PROJECT_PROFILES[frameworkType] || PROJECT_PROFILES.vite;
  const config = {
    ...profile,
    ...options,
  };

  const files = [];

  // 3. Execution - Pass 1: Root Files (STRICTLY FILTERED)
  // Prevent config and HTML files from entering the scan engine
  if (config.rootFiles && config.rootFiles.length > 0) {
    for (const file of config.rootFiles) {
      const fullPath = path.join(projectRoot, file);
      const ext = path.extname(fullPath).toLowerCase();

      if (
        STRICT_CODE_EXTENSIONS.includes(ext) &&
        (await fs.pathExists(fullPath))
      ) {
        files.push(createFileObject(fullPath, projectRoot));
      } else {
        // Log for debugging
        // console.log(`🛡️ [Firewall] Blocked root non-code file: ${file}`);
      }
    }
  }

  // 4. Execution - Pass 2: Recursive Scan
  // Merge ignore folders from the profile with the firewall list
  const mergedIgnoreDirs = [
    ...new Set([...(config.ignoreDirs || []), ...FIREWALL_IGNORED_DIRS]),
  ];

  for (const dir of config.recursiveDirs) {
    const dirPath = path.join(projectRoot, dir);
    if (await fs.pathExists(dirPath)) {
      const recursiveFiles = await walkDir(
        dirPath,
        projectRoot,
        mergedIgnoreDirs
      );
      files.push(...recursiveFiles);
    }
  }

  // 5. Final filtering: Remove test files to save token consumption
  const finalQueue = files.filter((f) => !f.isTestFile);

  if (files.length > finalQueue.length) {
    console.log(
      `🛡️ [Firewall] Dropped ${files.length - finalQueue.length} test files to save AI tokens.`
    );
  }

  const structure = buildStructureTree(finalQueue, projectRoot);

  return {
    files: finalQueue,
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
      const ext = path.extname(file).toLowerCase();
      // 🔥 Apply firewall to extensions
      if (STRICT_CODE_EXTENSIONS.includes(ext)) {
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
