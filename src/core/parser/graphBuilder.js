// src/core/parser/graphBuilder.js
import path from "path";
import { ALLOWED_EXTENSIONS } from "../config/profiles.js";

/**
 * يبني Dependency Graph للمشروع عبر:
 * - importsGraph:  file -> list of imported files
 * - reverseGraph:  file -> list of files depending on it
 *
 * @param {Array} parsedFiles - نتائج الـ AST parser لكل ملف
 * @param {object} options - خيارات إضافية
 * @param {object} [options.aliases] - خريطة Aliases (مثلاً { '@': 'src' })
 * @returns {object} { importsGraph, reverseGraph }
 */
export function buildDependencyGraph(parsedFiles, options = {}) {
  const importsGraph = {};
  const reverseGraph = {};
  
  // Default aliases if not provided, or merge? 
  // User said "pass aliases map or infer it". Defaulting to standard vue/vite alias.
  const aliases = options.aliases || { '@': 'src' };

  // تحويل المسارات النسبية إلى شكل موحد
  const normalize = (p) => p.replace(/\\/g, "/");

  // تجميع كل المسارات في Set لتسريع البحث والتأكد من الوجود
  const allFilesSet = new Set();
  for (const file of parsedFiles) {
    const filePath = normalize(file.relativeToProject || file.filePath);
    allFilesSet.add(filePath);
  }

  // الخطوة 1: تعبئة importsGraph
  for (const file of parsedFiles) {
    const filePath = normalize(file.relativeToProject || file.filePath);

    // تجهيز القائمة
    importsGraph[filePath] = [];

    for (const imp of file.imports) {
      // Pass the set of all known files to resolve against
      let resolved = resolveImportPath(imp.source, filePath, allFilesSet, aliases);
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
 * @param {object} aliases - خريطة Aliases
 * @returns {string|null}
 */
function resolveImportPath(importPath, currentFile, allFilesSet, aliases) {
  // 1. معالجة Aliases
  for (const [aliasKey, aliasValue] of Object.entries(aliases)) {
    // Check if importPath starts with aliasKey + "/" or is exactly aliasKey
    // e.g. importPath="@/components/Header", aliasKey="@" -> match
    // e.g. importPath="@", aliasKey="@" -> match
    if (importPath.startsWith(aliasKey + "/") || importPath === aliasKey) {
      // استبدال الـ alias بالمسار الحقيقي
      // مثال: @/components/Header -> src/components/Header
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

  // 2. معالجة المسارات النسبية (Relative Paths)
  if (importPath.startsWith(".")) {
    const currentDir = path.dirname(currentFile);
    // path.join handles .. and . correctly
    let full = normalizePath(path.join(currentDir, importPath));
    return resolveWithExtensions(full, allFilesSet);
  }

  // 3. مسارات أخرى (absolute paths inside project? or node_modules)
  // إذا لم يبدأ بـ . ولم يطابق alias، غالباً مكتبة خارجية.
  return null;
}

/**
 * البحث عن الملف مع تجربة الامتدادات المختلفة
 */
function resolveWithExtensions(filePath, allFilesSet) {
  // 1. هل الامتداد موجود أصلاً؟
  if (allFilesSet.has(filePath)) {
    return filePath;
  }

  // 2. تجربة الامتدادات
  // ALLOWED_EXTENSIONS imported from config
  for (const ext of ALLOWED_EXTENSIONS) {
    const candidate = filePath + ext;
    if (allFilesSet.has(candidate)) return candidate;
  }

  // 3. تجربة index files
  for (const ext of ALLOWED_EXTENSIONS) {
      const candidate = filePath + "/index" + ext;
      if (allFilesSet.has(candidate)) return candidate;
  }

  return null;
}

function normalizePath(p) {
  return p.split(path.sep).join("/");
}
