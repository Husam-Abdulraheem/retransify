// src/core/contextBuilder.js

/**
 * Build complete project context
 *
 * @param {object} params
 * @param {Array} params.files - From fileScanner (contains relativeToSrc, absolutePath, ...)
 * @param {Array} params.parsedFiles - From astParser (contains imports, exports, components, hooks, raw, relativeToSrc)
 * @param {object} params.importsGraph - From graphBuilder
 * @param {object} params.reverseGraph - From graphBuilder
 * @param {object} params.structure - Project tree from fileScanner
 *
 * @returns {object} projectContext
 */
export function buildProjectContext({
  files,
  parsedFiles,
  importsGraph,
  reverseGraph,
  structure,
  facts = {}, // [Enhanced] Receive facts from Analyzer
}) {
  const normalize = (p) => p.replace(/\\/g, '/');

  // Quick map to access parsedFile via relative path
  const parsedByPath = {};
  for (const pf of parsedFiles) {
    const key = normalize(pf.relativeToProject || pf.filePath);
    parsedByPath[key] = pf;
  }

  // filesByPath: store complete file info under key = relativeToSrc
  const filesByPath = {};
  for (const f of files) {
    const key = normalize(f.relativeToProject);
    const parsed = parsedByPath[key];

    filesByPath[key] = {
      ...f,
      ast: parsed || null,
    };
  }

  // Build global components map: componentName -> [filePath, ...]
  const globalComponents = {};
  for (const [relPath, meta] of Object.entries(filesByPath)) {
    const ast = meta.ast;
    if (!ast || !ast.components || ast.components.length === 0) continue;

    ast.components.forEach((compName) => {
      if (!globalComponents[compName]) globalComponents[compName] = [];
      globalComponents[compName].push(relPath);
    });
  }

  // Final project context
  const projectContext = {
    structure,
    filesByPath,
    globalComponents,
    dependencyGraph: importsGraph,
    reverseDependencyGraph: reverseGraph,
    facts, // [Enhanced] Store technical facts
  };

  return projectContext;
}

/**
 * Build specific file context to send to AI
 *
 * @param {string} targetRelativePath - Relative path inside src (e.g. "components/Button.jsx")
 * @param {object} projectContext - result of buildProjectContext
 *
 * @returns {object} fileContext
 */
export function buildFileContext(targetRelativePath, projectContext) {
  const normalize = (p) => p.replace(/\\/g, '/');
  const relPath = normalize(targetRelativePath);

  const fileMeta = projectContext.filesByPath[relPath];

  if (!fileMeta) {
    throw new Error(`File ${relPath} not found in projectContext.filesByPath.`);
  }

  const ast = fileMeta.ast || {};
  const importsGraph = projectContext.dependencyGraph || {};
  const reverseGraph = projectContext.reverseDependencyGraph || {};

  const fileImports = importsGraph[relPath] || [];
  const fileImportedBy = reverseGraph[relPath] || [];

  const fileDescription = describeFile(fileMeta, ast, fileImportedBy);

  // [Enhanced] Structured Output & Token Optimization
  return {
    filePath: fileMeta.relativeToProject || relPath, // [Fix] Include filePath
    content: ast.raw || '', // Raw Code

    analysis: {
      fileMeta: {
        filename: fileMeta.filename,
        ext: fileMeta.ext,
        isTestFile: fileMeta.isTestFile,
      },
      description: fileDescription, // [Enhanced] AI Summary
      imports: ast.imports || [], // [Enhanced] Full Import AST with loc
      exports: ast.exports || [], // [Enhanced] Full Export AST with loc & usage
      components: ast.components || [],
      hooks: ast.hooks || [],
      hasJSX: ast.hasJSX || false,
    },

    relationships: {
      follows: fileImports, // Files this file imports (Neighbors)
      followers: fileImportedBy, // Files extracting from this file (Neighbors)
    },

    techContext: projectContext.facts || {}, // [Enhanced] Technical Rules
  };
}

/**
 * Generate simple file description based on:
 * - Path
 * - Components
 * - Contains JSX?
 * - Uses hooks?
 * - Is imported by other files?
 */
function describeFile(fileMeta, ast, importedBy = []) {
  const parts = [];

  const rel = fileMeta.relativeToProject || fileMeta.filePath;
  const cleanRel = rel.replace(/\\/g, '/');

  parts.push(`File "${cleanRel}".`);

  if (ast.components && ast.components.length > 0) {
    parts.push(`Defines React components: ${ast.components.join(', ')}.`);
  }

  if (ast.hasJSX) {
    parts.push('Contains JSX UI structure.');
  }

  if (ast.hooks && ast.hooks.length > 0) {
    const uniqueHooks = Array.from(new Set(ast.hooks));
    parts.push(`Uses React hooks: ${uniqueHooks.join(', ')}.`);
  }

  if (importedBy.length > 0) {
    parts.push(
      `This file is imported by: ${importedBy
        .map((p) => p.replace(/\\/g, '/'))
        .join(', ')}.`
    );
  } else {
    parts.push(
      'This file is not imported by any other file (possible entry or leaf).'
    );
  }

  if (fileMeta.isTestFile) {
    parts.push('This is a test file.');
  }

  return parts.join(' ');
}
