// src/core/contextBuilder.js
import path from "path";

/**
 * بناء سياق كامل للمشروع
 *
 * @param {object} params
 * @param {Array} params.files - من fileScanner (فيها relativeToSrc, absolutePath, ...)
 * @param {Array} params.parsedFiles - من astParser (فيها imports, exports, components, hooks, raw, relativeToSrc)
 * @param {object} params.importsGraph - من graphBuilder
 * @param {object} params.reverseGraph - من graphBuilder
 * @param {object} params.structure - شجرة المشروع من fileScanner
 *
 * @returns {object} projectContext
 */
export function buildProjectContext({
  files,
  parsedFiles,
  importsGraph,
  reverseGraph,
  structure
}) {
  const normalize = (p) => p.replace(/\\/g, "/");

  // خريطة سريعة للوصول للـ parsedFile عبر المسار النسبي
  const parsedByPath = {};
  for (const pf of parsedFiles) {
    const key = normalize(pf.relativeToSrc || pf.filePath);
    parsedByPath[key] = pf;
  }

  // filesByPath: تخزين كل معلومات الملف تحت key = relativeToSrc
  const filesByPath = {};
  for (const f of files) {
    const key = normalize(f.relativeToSrc);
    const parsed = parsedByPath[key];

    filesByPath[key] = {
      ...f,
      ast: parsed || null
    };
  }

  // بناء خريطة المكوّنات العالمية: componentName -> [filePath, ...]
  const globalComponents = {};
  for (const [relPath, meta] of Object.entries(filesByPath)) {
    const ast = meta.ast;
    if (!ast || !ast.components || ast.components.length === 0) continue;

    ast.components.forEach((compName) => {
      if (!globalComponents[compName]) globalComponents[compName] = [];
      globalComponents[compName].push(relPath);
    });
  }

  // سياق المشروع النهائي
  const projectContext = {
    structure,
    filesByPath,
    globalComponents,
    dependencyGraph: importsGraph,
    reverseDependencyGraph: reverseGraph
  };

  return projectContext;
}

/**
 * بناء سياق ملف معيّن لإرساله للذكاء الاصطناعي
 *
 * @param {string} targetRelativePath - المسار النسبي داخل src (مثال: "components/Button.jsx")
 * @param {object} projectContext - ناتج buildProjectContext
 *
 * @returns {object} fileContext
 */
export function buildFileContext(targetRelativePath, projectContext) {
  const normalize = (p) => p.replace(/\\/g, "/");
  const relPath = normalize(targetRelativePath);

  const fileMeta = projectContext.filesByPath[relPath];

  if (!fileMeta) {
    throw new Error(
      `File ${relPath} not found in projectContext.filesByPath.`
    );
  }

  const ast = fileMeta.ast || {};
  const importsGraph = projectContext.dependencyGraph || {};
  const reverseGraph = projectContext.reverseDependencyGraph || {};

  const fileImports = importsGraph[relPath] || [];
  const fileImportedBy = reverseGraph[relPath] || [];

  const fileDescription = describeFile(fileMeta, ast, fileImportedBy);

  return {
    projectStructure: projectContext.structure,
    globalComponentMap: projectContext.globalComponents,
    dependencyGraph: projectContext.dependencyGraph,
    reverseDependencyGraph: projectContext.reverseDependencyGraph,

    // معلومات خاصة بالملف
    filePath: relPath,
    fileMeta: {
      filename: fileMeta.filename,
      ext: fileMeta.ext,
      isTestFile: fileMeta.isTestFile,
      segments: fileMeta.segments
    },
    fileDescription,
    fileImports,
    fileImportedBy,
    fileComponents: ast.components || [],
    fileExports: ast.exports || [],
    fileHooks: ast.hooks || [],
    fileHasJSX: ast.hasJSX || false,
    fileContent: ast.raw || ""
  };
}

/**
 * توليد وصف بسيط للملف يعتمد على:
 * - المسار
 * - الكومبوننتس
 * - هل فيه JSX
 * - هل يستخدم hooks
 * - هل يُستخدم من ملفات أخرى
 */
function describeFile(fileMeta, ast, importedBy = []) {
  const parts = [];

  const rel = fileMeta.relativeToSrc || fileMeta.relativeToProject;
  const cleanRel = rel.replace(/\\/g, "/");

  parts.push(`File "${cleanRel}".`);

  if (ast.components && ast.components.length > 0) {
    parts.push(
      `Defines React components: ${ast.components.join(", ")}.`
    );
  }

  if (ast.hasJSX) {
    parts.push("Contains JSX UI structure.");
  }

  if (ast.hooks && ast.hooks.length > 0) {
    const uniqueHooks = Array.from(new Set(ast.hooks));
    parts.push(`Uses React hooks: ${uniqueHooks.join(", ")}.`);
  }

  if (importedBy.length > 0) {
    parts.push(
      `This file is imported by: ${importedBy
        .map((p) => p.replace(/\\/g, "/"))
        .join(", ")}.`
    );
  } else {
    parts.push("This file is not imported by any other file (possible entry or leaf).");
  }

  if (fileMeta.isTestFile) {
    parts.push("This is a test file.");
  }

  return parts.join(" ");
}
