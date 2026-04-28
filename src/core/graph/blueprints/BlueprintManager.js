import { printWarning } from '../../utils/ui.js';
import { generateRootLayout } from './templates/rootLayout.template.js';
import { generateGroupLayout } from './templates/groupLayout.template.js';
import { generateRedirectIndex } from './templates/redirectIndex.template.js';
import { generateFallbackIndex } from './templates/fallbackIndex.template.js';

export class BlueprintManager {
  /**
   * Injects structural blueprints into the files queue based on the navigation schema.
   * Modifies the filesQueue in place.
   */
  static injectBlueprints(filesQueue, navigationSchema, globalProviders = []) {
    const appRoot = 'app';
    const isGroupNav =
      navigationSchema.type === 'tabs' || navigationSchema.type === 'drawer';
    const groupName = isGroupNav ? navigationSchema.type : null;

    // 1. Root Layout (Always injected, BOILERPLATE)
    this._injectRootLayout(filesQueue, appRoot, globalProviders);

    // 2. Group Layout & Group Redirect Index (If applicable, BOILERPLATE)
    if (isGroupNav) {
      const screens =
        navigationSchema.screens || navigationSchema.mainRoutes || [];
      this._injectGroupLayout(filesQueue, appRoot, groupName, screens);
      this._injectRedirectIndex(filesQueue, appRoot, groupName);
    }
  }

  /**
   * Checks if a fallback index is needed, and injects it if true.
   * Call this AFTER path map generation to verify if root index was resolved.
   */
  static ensureFallbackIndex(
    filesQueue,
    pathMap,
    groupIndexPath,
    rootIndexPath
  ) {
    const hasRootIndex = Object.values(pathMap).some(
      (p) => p === groupIndexPath || p === rootIndexPath
    );

    if (!hasRootIndex) {
      this._injectFallbackIndex(filesQueue, rootIndexPath);
      pathMap[rootIndexPath] = rootIndexPath;
      printWarning(
        `No root index found. Injected virtual fallback: ${rootIndexPath}`
      );
    }
  }

  // ── Generators ─────────────────────────────────────────────────────────────

  static _injectRootLayout(filesQueue, appRoot, globalProviders = []) {
    const rootLayoutPath = `${appRoot}/_layout.tsx`;
    if (!filesQueue.some((f) => f.relativeToProject === rootLayoutPath)) {
      filesQueue.push({
        filePath: rootLayoutPath,
        relativeToProject: rootLayoutPath,
        absolutePath: `__virtual/${rootLayoutPath}`,
        isVirtual: true,
        blueprintType: 'BOILERPLATE',
        hasJSX: true,
        content: generateRootLayout(globalProviders),
      });
    }
  }

  static _injectGroupLayout(filesQueue, appRoot, groupName, screens = []) {
    const groupLayoutPath = `${appRoot}/(${groupName})/_layout.tsx`;
    if (!filesQueue.some((f) => f.relativeToProject === groupLayoutPath)) {
      filesQueue.push({
        filePath: groupLayoutPath,
        relativeToProject: groupLayoutPath,
        absolutePath: `__virtual/${groupLayoutPath}`,
        isVirtual: true,
        blueprintType: 'BOILERPLATE',
        hasJSX: true,
        content: generateGroupLayout(groupName, screens),
      });
    }
  }

  static _injectRedirectIndex(filesQueue, appRoot, groupName) {
    const rootIndexPath = `${appRoot}/index.tsx`;
    if (!filesQueue.some((f) => f.relativeToProject === rootIndexPath)) {
      filesQueue.push({
        filePath: rootIndexPath,
        relativeToProject: rootIndexPath,
        absolutePath: `__virtual/${rootIndexPath}`,
        isVirtual: true,
        blueprintType: 'BOILERPLATE',
        hasJSX: true,
        content: generateRedirectIndex(groupName),
      });
    }
  }

  static _injectFallbackIndex(filesQueue, rootIndexPath) {
    filesQueue.push({
      filePath: rootIndexPath,
      relativeToProject: rootIndexPath,
      absolutePath: `__virtual/${rootIndexPath}`,
      isVirtual: true,
      blueprintType: 'BOILERPLATE',
      hasJSX: true,
      content: generateFallbackIndex(),
    });
  }
}
