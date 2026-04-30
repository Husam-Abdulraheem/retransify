// src/core/graph/nodes/diskWriterNode.js
import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { normalizePath, resolveAbsolutePath } from '../../utils/pathUtils.js';
import { calculateHash } from '../../utils/hashUtils.js';
import { StatePersistenceService } from '../../services/StatePersistenceService.js';
import { CONFLICT_MAP, WEB_ONLY_BLOCKLIST } from '../../config/libraryRules.js';
import {
  printSubStep,
  printSubStepLast,
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
    const absoluteDestPath = resolveAbsolutePath(
      { relativeToProject: destPath },
      state.targetProjectPath
    );

    await fs.ensureDir(path.dirname(absoluteDestPath));

    let finalCode = generatedCode;
    const normalizedDestPath = destPath.replace(/\\/g, '/');
    const isRootLayout = normalizedDestPath.endsWith('app/_layout.tsx');
    const stylingTech = state.facts?.tech?.styling;
    const usesNativeWind =
      stylingTech === 'NativeWind' || stylingTech === 'Tailwind';

    if (isRootLayout && usesNativeWind) {
      if (
        !finalCode.includes('import "../nativewind"') &&
        !finalCode.includes("import '../nativewind'")
      ) {
        printSubStep(
          '[AST Injector] Auto-injected NativeWind global import into Root Layout.'
        );
        finalCode = `import "../nativewind";\n` + finalCode;
      }
    }

    await fs.writeFile(absoluteDestPath, finalCode, 'utf-8');

    // ── 3.5. Update Persistent State ─────────────────────────────
    await StatePersistenceService.updateFile(
      state.targetProjectPath,
      filePath,
      {
        hash: calculateHash(currentFile.content || ''),
        targetPath: destPath,
      }
    );

    printSubStepLast(`Saved as ${pc.white(pc.bold(destPath))} ✨`);

    const unresolvedErrors = [];
    if (state.errors && state.errors.length > 0 && state.healAttempts >= 3) {
      const aiSuggestion = state.lastHealAnalysis?.suggestedManualAction;
      unresolvedErrors.push({
        filePath,
        reason: `Exceeded max heal attempts (3). Remaining errors: ${state.errors.length}. First error: ${state.errors[0]}`,
        codeSnippet: (generatedCode || '').substring(0, 800) + '...',
        suggestedAction: aiSuggestion
          ? `AI Recommendation: ${aiSuggestion}`
          : 'Manual intervention required: resolve the remaining TypeScript or semantic errors in this file.',
      });
    }

    // ── 4. Record Telemetry ─────────────────────────────────────
    const telemetryEntry = {
      file: filePath,
      status: state.healAttempts === 0 ? 'success' : 'healed',
      attempts: 1 + (state.healAttempts || 0),
    };

    return {
      completedFiles: filePath,
      errorLog: [],
      unresolvedErrors,
      telemetry: [telemetryEntry],
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

// 🚨 Architectural Modification: Absolute trust in PathMapper 🚨
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
