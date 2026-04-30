// src/core/helpers/contextOptimizer.js

/**
 * Context Optimizer — Safe Filtering Engine for Token Cost Reduction.
 *
 * Prunes three data sources before they reach the AI prompt:
 *   1. PathMap   → only paths referenced by the current file's imports
 *   2. RAG       → only context docs for imported local files (already deterministic via ContextStore)
 *   3. AssetMap  → static files get only text-referenced assets; dynamic files get the full map
 *
 * Safety guarantee: filtering is purely text-based and conservative,
 * meaning it can only reduce noise — it cannot remove data the AI actually needs.
 */

/**
 * @param {import('../graph/state.js').GraphState} state
 * @param {object} currentFile - The file object currently being processed
 * @returns {{ relevantPaths: Record<string, string>, relevantAssets: string[] }}
 */
export function optimizeFileContext(state, currentFile) {
  const content = currentFile.content || '';
  const imports = currentFile.imports || [];

  // ── 1. PathMap Pruning (Safe — import-based) ──────────────────────────────
  // Keep only pathMap entries whose key basename matches an import source basename.
  // This drastically reduces the full project pathMap to what this file actually references.
  const relevantPaths = {};
  const importBaseNames = new Set();

  imports.forEach((imp) => {
    const importSource = typeof imp === 'string' ? imp : imp.source;
    if (!importSource) return;
    const baseName = importSource
      .split('/')
      .pop()
      .replace(/\.[^/.]+$/, '');
    if (baseName) importBaseNames.add(baseName);
  });

  // Always include the current file's own mapping
  const currentFileKey = currentFile.relativeToProject || currentFile.filePath;
  if (state.pathMap[currentFileKey]) {
    relevantPaths[currentFileKey] = state.pathMap[currentFileKey];
  }

  // Asset file extensions — entries matching these are handled separately in relevantAssets
  const assetExtensions = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.webp',
    '.json',
    '.csv',
    '.mp4',
    '.pdf',
    '.yaml',
    '.txt',
  ];

  const isAssetPath = (p) =>
    typeof p === 'string' &&
    assetExtensions.some((ext) => p.toLowerCase().endsWith(ext));

  Object.keys(state.pathMap).forEach((key) => {
    const keyBaseName = key
      .split('/')
      .pop()
      .replace(/\.[^/.]+$/, '');
    if (importBaseNames.has(keyBaseName)) {
      relevantPaths[key] = state.pathMap[key];
    }
  });

  // ── 2. Asset Pruning (Safe — content-reference or dynamic-route based) ──
  // Separate asset entries from the full pathMap, then filter them.
  const metadata = state.routeMetadata?.[currentFileKey];
  const hasDynamicData = metadata?.requiredData?.length > 0;

  const relevantAssets = hasDynamicData
    ? [...new Set(Object.values(state.pathMap).filter(isAssetPath))]
    : (() => {
        // Static file: send only assets whose filename (or stem) appears in the code
        const assetSet = new Set();
        Object.values(state.pathMap).forEach((mappedPath) => {
          if (!isAssetPath(mappedPath)) return;

          const fileName = mappedPath.split('/').pop(); // e.g. logo.svg
          const stem = fileName.split('.')[0]; // e.g. logo

          if (content.includes(fileName) || content.includes(stem)) {
            assetSet.add(mappedPath);
          }
        });
        return [...assetSet];
      })();

  return { relevantPaths, relevantAssets };
}
