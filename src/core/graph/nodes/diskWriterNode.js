// src/core/graph/nodes/diskWriterNode.js
import path from 'path';
import fs from 'fs-extra';
import { normalizePath } from '../../utils/pathUtils.js';
import { CONFLICT_MAP, WEB_ONLY_BLOCKLIST } from '../../config/libraryRules.js';
import {
  printSubStep,
  printSubStepLast,
  printFileWritten,
  printWarning,
  printError,
} from '../../utils/ui.js';

export async function diskWriterNode(state) {
  const {
    generatedCode,
    generatedDependencies = [],
    currentFile,
    pathMap,
    dependencyManager,
  } = state;

  if (!generatedCode || !currentFile) {
    printWarning('DiskWriterNode: nothing to write');
    return {};
  }

  const filePath = currentFile.relativeToProject || currentFile.filePath;

  // ── 1. Determine destination path ───────────────────────────
  let destPath = resolveDestPath(filePath, pathMap);

  // ── 2. Filter and add dependencies to DependencyManager ─────
  if (dependencyManager && generatedDependencies.length > 0) {
    const filteredDeps = filterDependencies(
      generatedDependencies,
      state.installedPackages || []
    );
    if (filteredDeps.length > 0) {
      printSubStep(`Queuing deps: ${filteredDeps.join(', ')}`);
      dependencyManager.add(filteredDeps);
    }
  }

  // ── 3. Write to disk directly using state.targetProjectPath ──────────
  try {
    const absoluteDestPath = path.join(
      state.targetProjectPath || process.cwd(),
      destPath
    );

    await fs.ensureDir(path.dirname(absoluteDestPath));
    await fs.writeFile(absoluteDestPath, generatedCode, 'utf-8');

    printFileWritten(destPath);
    printSubStepLast(`Saved: ${destPath} ✔`);

    return {
      completedFiles: filePath,
      errorLog: [],
    };
  } catch (err) {
    printError(`Write failed: ${err.message}`);
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

// 🚨 التعديل المعماري: الثقة المطلقة في PathMapper 🚨
function resolveDestPath(filePath, pathMap) {
  let targetPath = pathMap?.[filePath] || filePath;
  return normalizePath(targetPath);
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
