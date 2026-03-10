// src/core/graph/nodes/diskWriterNode.js
import path from 'path';
import { saveConvertedFile } from '../../services/nativeWriter.js';
import {
  CONFLICT_MAP,
  WEB_ONLY_BLOCKLIST,
  COMMON_DEPENDENCIES,
} from '../../config/libraryRules.js';

/**
 * DiskWriterNode - يكتب الكود الناتج على القرص
 *
 * المدخلات: state.generatedCode, state.currentFile, state.pathMap, state.rnProjectPath
 * المخرجات: state.completedFiles (إضافة الملف الحالي)
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
    rnProjectPath,
    dependencyManager,
    options = {},
  } = state;

  if (!generatedCode || !currentFile) {
    console.warn('⚠️  [DiskWriterNode] لا يوجد كود للكتابة');
    return {};
  }

  const filePath = currentFile.relativeToProject || currentFile.filePath;
  const baseName = path.basename(filePath);
  const sourceRoot = facts?.sourceRoot || '.';

  console.log(`\n💾 [DiskWriterNode] كتابة: ${filePath}`);

  // ── 1. تحديد مسار الوجهة ─────────────────────────────────────
  let destPath = resolveDestPath(filePath, pathMap, sourceRoot);

  // تجاوز إذا كان ملف App الرئيسي
  if (currentFile.isMainEntry || /^App\.(tsx|jsx|js|ts)$/i.test(baseName)) {
    destPath = 'app/index.tsx';
    console.log(`🚀 [DiskWriterNode] ملف App -> app/index.tsx`);
  }

  // ── 2. تصفية وإضافة التبعيات للـ DependencyManager ──────────
  if (dependencyManager && generatedDependencies.length > 0) {
    const filteredDeps = filterDependencies(
      generatedDependencies,
      state.installedPackages || []
    );
    if (filteredDeps.length > 0) {
      console.log(
        `📦 [DiskWriterNode] إضافة تبعيات: ${filteredDeps.join(', ')}`
      );
      dependencyManager.add(filteredDeps);
    }
  }

  // ── 3. الكتابة على القرص (باستخدام nativeWriter.js كما هو) ───
  try {
    await saveConvertedFile(
      destPath,
      generatedCode,
      options.sdkVersion,
      dependencyManager
    );

    console.log(`✅ [DiskWriterNode] تمت الكتابة: ${destPath}`);

    return {
      completedFiles: filePath, // سيُضاف للمصفوفة بواسطة reducer
      errorLog: [], // لا أخطاء جديدة
    };
  } catch (err) {
    console.error(`❌ [DiskWriterNode] فشل الكتابة: ${err.message}`);
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
