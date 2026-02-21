// src/core/parser/graphBuilder.js
import path from 'path';
import { ALLOWED_EXTENSIONS } from '../config/profiles.js';

/**
 * Builds Dependency Graph for the project via:
 * - importsGraph:  file -> list of imported files
 * - reverseGraph:  file -> list of files depending on it
 *
 * @param {Array} parsedFiles - AST parser results for each file
 * @param {object} options - additional options
 * @param {object} [options.aliases] - Aliases map (e.g. { '@': 'src' })
 * @returns {object} { importsGraph, reverseGraph }
 */
export function buildDependencyGraph(parsedFiles, options = {}) {
  const importsGraph = {};
  const reverseGraph = {};

  // Default aliases if not provided, or merge?
  // User said "pass aliases map or infer it". Defaulting to standard vue/vite alias.
  const aliases = options.aliases || { '@': 'src' };

  // Normalize relative paths
  const normalize = (p) => p.replace(/\\/g, '/');

  // Collect all paths in a Set to speed up search and ensure existence
  const allFilesSet = new Set();
  for (const file of parsedFiles) {
    const filePath = normalize(file.relativeToProject || file.filePath);
    allFilesSet.add(filePath);
  }

  // Step 1: Populate importsGraph
  for (const file of parsedFiles) {
    const filePath = normalize(file.relativeToProject || file.filePath);

    // Prepare the list
    importsGraph[filePath] = [];

    for (const imp of file.imports) {
      // Pass the set of all known files to resolve against
      let resolved = resolveImportPath(
        imp.source,
        filePath,
        allFilesSet,
        aliases
      );
      if (resolved) {
        importsGraph[filePath].push(resolved);
      }
    }
  }

  // Step 2: Build reverseGraph
  for (const file in importsGraph) {
    for (const imported of importsGraph[file]) {
      if (!reverseGraph[imported]) reverseGraph[imported] = [];
      reverseGraph[imported].push(file);
    }
  }

  // Ensure every file exists even if not imported
  for (const file of Object.keys(importsGraph)) {
    if (!reverseGraph[file]) reverseGraph[file] = [];
  }

  return {
    importsGraph,
    reverseGraph,
  };
}

/**
 * Attempt to resolve import path relative to the original file path
 * @param {string} importPath - Value inside from "..."
 * @param {string} currentFile - Relative path of the importing file
 * @param {Set<string>} allFilesSet - Set of all existing files in the project
 * @param {object} aliases - Aliases map
 * @returns {string|null}
 */
function resolveImportPath(importPath, currentFile, allFilesSet, aliases) {
  // 1. Process Aliases
  for (const [aliasKey, aliasValue] of Object.entries(aliases)) {
    // Check if importPath starts with aliasKey + "/" or is exactly aliasKey
    // e.g. importPath="@/components/Header", aliasKey="@" -> match
    // e.g. importPath="@", aliasKey="@" -> match
    if (importPath.startsWith(aliasKey + '/') || importPath === aliasKey) {
      // Replace alias with real path
      // e.g. @/components/Header -> src/components/Header
      let replaced;
      if (importPath === aliasKey) {
        replaced = aliasValue;
      } else {
        replaced = importPath.replace(aliasKey, aliasValue);
      }

      const normalizedReplaced = normalizePath(replaced);

      const resolved = resolveWithExtensions(normalizedReplaced, allFilesSet);
      if (resolved) return resolved;
    }
  }

  // 2. Process Relative Paths
  if (importPath.startsWith('.')) {
    const currentDir = path.dirname(currentFile);
    // path.join handles .. and . correctly
    let full = normalizePath(path.join(currentDir, importPath));
    return resolveWithExtensions(full, allFilesSet);
  }

  // 3. Other paths (absolute paths inside project? or node_modules)
  // If it doesn't start with . and doesn't match an alias, it's likely an external library.
  return null;
}

/**
 * Search for file trying different extensions
 */
function resolveWithExtensions(filePath, allFilesSet) {
  // 1. Does the extension already exist?
  if (allFilesSet.has(filePath)) {
    return filePath;
  }

  // 2. Try extensions
  // ALLOWED_EXTENSIONS imported from config
  for (const ext of ALLOWED_EXTENSIONS) {
    const candidate = filePath + ext;
    if (allFilesSet.has(candidate)) return candidate;
  }

  // 3. Try index files
  for (const ext of ALLOWED_EXTENSIONS) {
    const candidate = filePath + '/index' + ext;
    if (allFilesSet.has(candidate)) return candidate;
  }

  return null;
}

function normalizePath(p) {
  return p.split(path.sep).join('/');
}
