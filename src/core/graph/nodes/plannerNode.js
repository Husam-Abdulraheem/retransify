// src/core/graph/nodes/plannerNode.js
import { PathMapper } from '../../helpers/pathMapper.js';

/**
 * PlannerNode - يرتب الملفات ويُنشئ خريطة المسارات
 *
 * المدخلات من state:
 * - state.filesQueue: مصفوفة كائنات الملفات (من FileScanner)
 *
 * المخرجات إلى state:
 * - state.filesQueue: مصفوفة مُرتَّبة (Topological Sort - التبعيات أولاً)
 * - state.pathMap: خريطة المسارات القديمة -> الجديدة
 *
 * @param {import('../state.js').GraphState} state
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function plannerNode(state) {
  console.log('\n🗺️  [PlannerNode] بدء تخطيط ترتيب التحويل...');

  const { filesQueue } = state;

  // ── 1. توليد خريطة المسارات باستخدام PathMapper (لا تعديل عليه) ──
  const pathMap = PathMapper.generateMap(filesQueue);
  console.log(
    `📍 [PlannerNode] تم توليد خريطة لـ ${Object.keys(pathMap).length} ملف`
  );

  // ── 2. بناء رسم بياني للتبعيات من imports الملفات ─────────────
  const dependencyGraph = buildDependencyGraph(filesQueue);

  // ── 3. ترتيب الملفات (Topological Sort - التبعيات تُعالَج أولاً) ──
  const sortedFiles = topologicalSort(dependencyGraph, filesQueue);
  console.log(`✅ [PlannerNode] ترتيب التحويل: ${sortedFiles.length} ملف`);

  // طباعة أول 5 ملفات للتحقق
  sortedFiles.slice(0, 5).forEach((f, i) => {
    const filePath = f.relativeToProject || f.filePath;
    console.log(`   ${i + 1}. ${filePath}`);
  });
  if (sortedFiles.length > 5) {
    console.log(`   ... و ${sortedFiles.length - 5} ملف آخر`);
  }

  return {
    filesQueue: sortedFiles,
    pathMap,
  };
}

// ── بناء رسم بياني بسيط للتبعيات ─────────────────────────────────────────────

/**
 * يبني رسماً بيانياً بسيطاً بناءً على الـ imports في كل ملف
 * @param {Array} filesQueue
 * @returns {Object} { filePath: [dependencyFilePaths] }
 */
function buildDependencyGraph(filesQueue) {
  const graph = {};
  const filePathSet = new Set(
    filesQueue.map((f) => f.relativeToProject || f.filePath)
  );

  for (const fileObj of filesQueue) {
    const filePath = fileObj.relativeToProject || fileObj.filePath;
    graph[filePath] = [];

    // استخدام imports المُستخرجة من FileScanner إذا كانت متاحة
    const imports = fileObj.imports || [];

    for (const imp of imports) {
      const source = imp.source || imp;
      // نهتم فقط بالـ imports النسبية (الملفات المحلية)
      if (source.startsWith('.')) {
        // محاولة إيجاد الملف المُستورَد في قائمة الملفات
        const resolvedPath = resolveRelativeImport(
          filePath,
          source,
          filePathSet
        );
        if (resolvedPath) {
          graph[filePath].push(resolvedPath);
        }
      }
    }
  }

  return graph;
}

/**
 * يحاول حل مسار import نسبي
 */
function resolveRelativeImport(currentFile, importSource, filePathSet) {
  const parts = currentFile.split('/');
  parts.pop(); // إزالة اسم الملف الحالي
  const dir = parts.join('/');

  const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];
  const candidates = [
    `${dir}/${importSource}`,
    ...extensions.map((ext) => `${dir}/${importSource}${ext}`),
    ...extensions.map((ext) => `${dir}/${importSource}/index${ext}`),
  ];

  for (const candidate of candidates) {
    const normalized = candidate
      .replace(/\/\.\//g, '/')
      .replace(/\/[^/]+\/\.\.\//g, '/');
    if (filePathSet.has(normalized)) return normalized;
  }

  return null;
}

// ── Topological Sort ──────────────────────────────────────────────────────────

/**
 * يُرتِّب الملفات بحيث تأتي التبعيات (utils, hooks) قبل المكونات التي تستخدمها
 *
 * @param {Object} graph - { filePath: [dependencies] }
 * @param {Array} filesQueue - المصفوفة الأصلية لكائنات الملفات
 * @returns {Array} مصفوفة كائنات الملفات مُرتَّبة
 */
function topologicalSort(graph, filesQueue) {
  const visited = new Set();
  const tempVisited = new Set();
  const sortedPaths = [];

  const visit = (node) => {
    if (tempVisited.has(node)) return; // كشف دورة - تجاهل
    if (visited.has(node)) return;

    tempVisited.add(node);

    const dependencies = graph[node] || [];
    for (const dep of dependencies) {
      visit(dep);
    }

    tempVisited.delete(node);
    visited.add(node);
    sortedPaths.push(node);
  };

  for (const node of Object.keys(graph)) {
    visit(node);
  }

  // تحويل المسارات المُرتَّبة إلى كائنات الملفات الأصلية
  const fileMap = {};
  filesQueue.forEach((f) => {
    const key = f.relativeToProject || f.filePath;
    fileMap[key] = f;
  });

  // إعادة الترتيب مع الاحتفاظ بالملفات التي لم تُضف للرسم البياني
  const sortedFiles = sortedPaths
    .filter((p) => fileMap[p])
    .map((p) => fileMap[p]);

  // إضافة أي ملفات لم تكن في الرسم البياني (لم يتم زيارتها)
  const sortedSet = new Set(sortedPaths);
  filesQueue.forEach((f) => {
    const key = f.relativeToProject || f.filePath;
    if (!sortedSet.has(key)) {
      sortedFiles.push(f);
    }
  });

  return sortedFiles;
}
