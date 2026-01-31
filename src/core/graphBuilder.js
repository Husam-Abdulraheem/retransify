// src/core/graphBuilder.js
import path from "path";

/**
 * يبني Dependency Graph للمشروع عبر:
 * - importsGraph:  file -> list of imported files
 * - reverseGraph:  file -> list of files depending on it
 *
 * @param {Array} parsedFiles - نتائج الـ AST parser لكل ملف
 * @returns {object} { importsGraph, reverseGraph, normalizedPaths }
 */
export function buildDependencyGraph(parsedFiles) {
  const importsGraph = {};
  const reverseGraph = {};

  // تحويل المسارات النسبية إلى شكل موحد
  const normalize = (p) => p.replace(/\\/g, "/");

  // تجميع كل المسارات في Set لتسريع البحث والتأكد من الوجود
  const allFilesSet = new Set();
  for (const file of parsedFiles) {
    const filePath = normalize(file.relativeToSrc || file.filePath);
    allFilesSet.add(filePath);
  }

  // الخطوة 1: تعبئة importsGraph
  for (const file of parsedFiles) {
    const filePath = normalize(file.relativeToSrc || file.filePath);

    // تجاهل الملفات خارج src
    importsGraph[filePath] = [];

    for (const imp of file.imports) {
      // Pass the set of all known files to resolve against
      let resolved = resolveImportPath(imp.source, filePath, allFilesSet);
      if (resolved) {
        importsGraph[filePath].push(resolved);
      }
    }
  }

  // الخطوة 2: بناء reverseGraph
  for (const file in importsGraph) {
    for (const imported of importsGraph[file]) {
      if (!reverseGraph[imported]) reverseGraph[imported] = [];
      reverseGraph[imported].push(file);
    }
  }

  // تأكد أن كل ملف موجود حتى لو ما حد يستورده
  for (const file of Object.keys(importsGraph)) {
    if (!reverseGraph[file]) reverseGraph[file] = [];
  }

  return {
    importsGraph,
    reverseGraph
  };
}

/**
 * محاولة حل مسار import بالنسبة لمسار الملف الأصلي
 * @param {string} importPath - القيمة داخل from "..."
 * @param {string} currentFile - المسار النسبي للملف الذي يستورد
 * @param {Set<string>} allFilesSet - مجموعة بكل الملفات الموجودة في المشروع
 * @returns {string|null}
 */
function resolveImportPath(importPath, currentFile, allFilesSet) {
  // لو import من مكتبة خارجية نتركه
  if (!importPath.startsWith(".")) return null;

  const currentDir = path.dirname(currentFile);

  // مسار نسبي بسيط
  let full = normalizePath(path.join(currentDir, importPath));

  // 1. هل الامتداد موجود أصلاً في الـ import؟
  // مثلاً import ... from './file.js'
  if (allFilesSet.has(full)) {
    return full;
  }

  // 2. تجربة الامتدادات المحتملة
  const candidates = [
    full + ".js",
    full + ".jsx",
    full + ".ts",
    full + ".tsx",
    full + "/index.js",
    full + "/index.jsx",
    full + "/index.ts",
    full + "/index.tsx"
  ];

  for (const c of candidates) {
    if (allFilesSet.has(c)) return c;
  }

  return null;
}

function normalizePath(p) {
  return p.split(path.sep).join("/");
}
