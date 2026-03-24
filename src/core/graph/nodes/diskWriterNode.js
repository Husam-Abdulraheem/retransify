// src/core/graph/nodes/diskWriterNode.js
import path from 'path';
import { saveConvertedFile } from '../../services/nativeWriter.js';
import { CONFLICT_MAP, WEB_ONLY_BLOCKLIST } from '../../config/libraryRules.js';

/**
 * DiskWriterNode - Writes generated code to disk
 *
 * Inputs: state.generatedCode, state.currentFile, state.pathMap, state.rnProjectPath
 * Outputs: state.completedFiles (added current file)
 *
 * @param {import('../state.js').GraphState} state
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function diskWriterNode(state) {
  const {
    generatedCode,
    generatedDependencies = [],
    currentFile,
    pathMap,
    facts,
    dependencyManager,
    options = {},
  } = state;

  if (!generatedCode || !currentFile) {
    console.warn('⚠️  [DiskWriterNode] No code to write');
    return {};
  }

  const filePath = currentFile.relativeToProject || currentFile.filePath;
  const baseName = path.basename(filePath);
  const sourceRoot = facts?.sourceRoot || '.';

  console.log(`\n💾 [DiskWriterNode] Writing: ${filePath}`);

  // ── 1. Determine destination path ───────────────────────────
  let destPath = resolveDestPath(filePath, pathMap, sourceRoot);

  // Override if main App file
  if (currentFile.isMainEntry || /^App\.(tsx|jsx|js|ts)$/i.test(baseName)) {
    destPath = 'app/index.tsx';
    console.log(`🚀 [DiskWriterNode] App file -> app/index.tsx`);
  }

  // ── 2. Filter and add dependencies to DependencyManager ─────
  if (dependencyManager && generatedDependencies.length > 0) {
    const filteredDeps = filterDependencies(
      generatedDependencies,
      state.installedPackages || []
    );
    if (filteredDeps.length > 0) {
      console.log(
        `📦 [DiskWriterNode] Adding dependencies: ${filteredDeps.join(', ')}`
      );
      dependencyManager.add(filteredDeps);
    }
  }

  // ── 3. Write to disk (using nativeWriter.js as is) ──────────
  try {
    await saveConvertedFile(
      destPath,
      generatedCode,
      options.sdkVersion,
      dependencyManager
    );

    console.log(`✅ [DiskWriterNode] Written successfully: ${destPath}`);

    return {
      completedFiles: filePath, // Will be added to array by reducer
      errorLog: [], // No new errors
    };
  } catch (err) {
    console.error(`❌ [DiskWriterNode] Write failed: ${err.message}`);
    return {
      errorLog: [
        {
          filePath,
          error: err.message,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}

function resolveDestPath(filePath, pathMap, sourceRoot) {
  let targetPath = pathMap?.[filePath] || filePath;
  let stripped = targetPath.replace(/\\/g, '/');
  const root = (sourceRoot || '.').replace(/\\/g, '/');

  if (stripped.startsWith('src/')) stripped = stripped.substring(4);
  else if (root !== '.' && stripped.startsWith(root + '/')) {
    stripped = stripped.substring(root.length + 1);
  }

  return stripped.replace(/\/src\//g, '/');
}

function filterDependencies(newDeps, installedDeps) {
  if (!newDeps?.length) return [];
  const installedSet = new Set(installedDeps);

  return newDeps.filter((dep) => {
    if (installedSet.has(dep)) return false;
    if (WEB_ONLY_BLOCKLIST.some((b) => dep === b || dep.startsWith(b)))
      return false;

    for (const [key, conflicts] of Object.entries(CONFLICT_MAP)) {
      if (
        installedSet.has(key) &&
        Array.isArray(conflicts) &&
        conflicts.includes(dep)
      ) {
        return false;
      }
    }
    return true;
  });
}
