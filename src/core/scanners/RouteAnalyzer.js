import { SyntaxKind } from 'ts-morph';
import { AstManager } from '../services/AstManager.js';
import path from 'path';
import fs from 'fs-extra';
import {
  normalizePath,
  joinPaths,
  getRelativePath,
} from '../utils/pathUtils.js';
import { ui } from '../utils/ui.js';

export class RouteAnalyzer {
  /**
   * Scans project files for React Router definitions (JSX or Objects)
   * and maps them to Expo Router filesystem projections.
   *
   * @param {string} projectRoot - The absolute path of the Web project
   * @param {Array<Object>} filesQueue - Queue of files to be scanned
   * @param {string} sourceRoot - The source folder (e.g. 'src' or '.')
   * @returns {Object} routeMap - { "originalFilePath": "expo/path/file.tsx" }
   */
  static async analyze(projectRoot, filesQueue, _sourceRoot = '.') {
    ui.step('RouteAnalyzer', 'Extracting AST routing tree...');
    const routeMap = {};
    const routeMetadata = {};
    const routingSourceFiles = [];
    const allProvidersMap = new Map();
    let globalHeader = null;

    const project = AstManager.getWebProject();

    // 2. Safe File Loading & AST Injection
    for (const fileObj of filesQueue) {
      // Only process component/logic files
      const currentPath = fileObj.filePath || fileObj.relativeToProject || '';
      if (!/\.(jsx?|tsx?)$/i.test(currentPath)) continue;
      const absolutePath =
        fileObj.absolutePath ||
        path.join(projectRoot, fileObj.filePath || fileObj.relativeToProject);

      if (!fs.existsSync(absolutePath)) continue;

      try {
        const content =
          fileObj.content || (await fs.readFile(absolutePath, 'utf8'));
        const sourceFile = project.createSourceFile(absolutePath, content, {
          overwrite: true,
        });

        // Providers/Header extraction should NOT depend on react-router presence.
        const extractedProviders = this._extractProviders(
          sourceFile,
          projectRoot
        );
        extractedProviders.forEach((p) => {
          if (!allProvidersMap.has(p.name)) {
            allProvidersMap.set(p.name, p);
          }
        });

        const extractedHeader = this._extractHeader(sourceFile, projectRoot);
        if (extractedHeader && !globalHeader) {
          globalHeader = extractedHeader;
        }

        // Fast check for routing imports before heavy AST traversal
        const hasRouting = sourceFile
          .getImportDeclarations()
          .some((imp) =>
            imp.getModuleSpecifierValue().includes('react-router')
          );

        if (hasRouting) {
          routingSourceFiles.push(sourceFile);
        }
      } catch {
        ui.warn(`Failed to parse AST for ${fileObj.filePath}`);
      }
    }

    if (routingSourceFiles.length === 0) {
      ui.printSubStep('No react-router usage detected.', 1, true);
      return {
        routeMap: {},
        routeMetadata: {},
        providers: [],
        globalHeader: null,
      };
    }

    ui.printSubStep(
      `Found ${routingSourceFiles.length} file(s) with routing.`,
      1
    );

    // 3. Process Routing Trees (only for files that actually use react-router)
    for (const sf of routingSourceFiles) {
      const processedNodes = new Set();

      // Process JSX <Route> Definitions
      const jsxElements = [
        ...sf.getDescendantsOfKind(SyntaxKind.JsxElement),
        ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
      ];

      const routeElements = jsxElements.filter((el) => {
        const opening =
          el.getKind() === SyntaxKind.JsxElement ? el.getOpeningElement() : el;
        return opening.getTagNameNode().getText() === 'Route';
      });

      for (const routeEl of routeElements) {
        if (processedNodes.has(routeEl)) continue;
        const parentRoute = routeEl.getFirstAncestorByKind(
          SyntaxKind.JsxElement
        );
        const isChildOfAnotherRoute =
          parentRoute &&
          parentRoute.getOpeningElement().getTagNameNode().getText() ===
            'Route';

        if (!isChildOfAnotherRoute) {
          this._processJsxRoute(
            routeEl,
            '',
            sf,
            routeMap,
            processedNodes,
            projectRoot,
            routeMetadata,
            project,
            _sourceRoot
          );
        }
      }

      // Process Object-based Routing (createBrowserRouter, useRoutes)
      const objectLiterals = sf.getDescendantsOfKind(
        SyntaxKind.ObjectLiteralExpression
      );

      for (const obj of objectLiterals) {
        if (processedNodes.has(obj)) continue;
        const hasPath = obj.getProperty('path');
        const hasElementOrComponent =
          obj.getProperty('element') || obj.getProperty('Component');

        if (hasPath && hasElementOrComponent) {
          const parentArray = obj.getFirstAncestorByKind(
            SyntaxKind.ArrayLiteralExpression
          );
          let isTopLevel = true;

          if (parentArray) {
            const parentObject = parentArray.getFirstAncestorByKind(
              SyntaxKind.ObjectLiteralExpression
            );
            if (parentObject && parentObject.getProperty('path'))
              isTopLevel = false;
          }

          if (isTopLevel) {
            this._processObjectRoute(
              obj,
              '',
              sf,
              routeMap,
              processedNodes,
              projectRoot,
              routeMetadata,
              project,
              _sourceRoot
            );
          }
        }
      }
    }

    console.log(
      `   ✅ Extracted ${Object.keys(routeMap).length} mapped routes and ${allProvidersMap.size} providers.`
    );
    return {
      routeMap,
      routeMetadata,
      providers: Array.from(allProvidersMap.values()),
      globalHeader,
    };
  }

  /**
   * Scans the AST for global UI components like <Header> or <Navbar>
   */
  static _extractHeader(sourceFile, projectRoot) {
    const jsxElements = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];

    for (const el of jsxElements) {
      const tagName =
        el.getKind() === SyntaxKind.JsxElement
          ? el.getOpeningElement().getTagNameNode().getText()
          : el.getTagNameNode().getText();

      if (['Header', 'Navbar', 'TopBar', 'NavigationBar'].includes(tagName)) {
        const resolved = this._resolveImportWithType(
          sourceFile,
          tagName,
          projectRoot
        );
        if (resolved) {
          return {
            name: tagName,
            source: resolved.path,
            isDefault: resolved.isDefault,
          };
        }

        // Fallback: header component declared locally in the same file (common in CRA layouts)
        // In this case, we can still reference the containing file and instruct the converter
        // to export the component so `app/_layout.tsx` can import it.
        const hasLocalHeaderDeclaration =
          sourceFile.getFunctions().some((fn) => fn.getName() === tagName) ||
          sourceFile
            .getVariableDeclarations()
            .some((v) => v.getName() === tagName);

        if (hasLocalHeaderDeclaration) {
          const selfPath = getRelativePath(
            projectRoot,
            sourceFile.getFilePath()
          );
          return {
            name: tagName,
            source: selfPath,
            isDefault: false,
            isLocal: true,
          };
        }
      }
    }
    return null;
  }

  // ─── INTERNAL AST PROCESSING METHODS ─────────────────────────────────────────

  static _processJsxRoute(
    routeNode,
    parentPath,
    sourceFile,
    routeMap,
    processedElements,
    projectRoot,
    routeMetadata,
    project,
    _sourceRoot = '.'
  ) {
    processedElements.add(routeNode);

    const opening =
      routeNode.getKind() === SyntaxKind.JsxElement
        ? routeNode.getOpeningElement()
        : routeNode;
    const pathAttr = opening.getAttribute('path');
    let currentPath = parentPath;

    if (pathAttr && pathAttr.getKind() === SyntaxKind.JsxAttribute) {
      const init = pathAttr.getInitializer();
      if (init && init.getKind() === SyntaxKind.StringLiteral) {
        currentPath = this._joinPaths(parentPath, init.getLiteralText());
      }
    }

    const componentName = this._extractComponentName(opening);
    let hasChildren = false;
    let childrenRoutes = [];

    // Check if route has an index attribute
    const isIndexRoute = opening.getAttribute('index') !== undefined;

    if (routeNode.getKind() === SyntaxKind.JsxElement) {
      childrenRoutes = routeNode
        .getJsxChildren()
        .filter(
          (c) =>
            (c.getKind() === SyntaxKind.JsxElement &&
              c.getOpeningElement().getTagNameNode().getText() === 'Route') ||
            (c.getKind() === SyntaxKind.JsxSelfClosingElement &&
              c.getTagNameNode().getText() === 'Route')
        );
      hasChildren = childrenRoutes.length > 0;
    }

    if (componentName) {
      const resolvedFilePath = this._resolveImport(
        sourceFile,
        componentName,
        projectRoot
      );
      if (resolvedFilePath) {
        // Pass isIndexRoute to generate proper exact path
        const expoPath = this._calculateExpoPath(
          currentPath,
          hasChildren,
          isIndexRoute
        );

        // --- 1-to-Many Collision Resolution ---
        // If a component maps to multiple routes (e.g., /shoes and /shirts -> Category.js),
        // we MUST merge them into a dynamic route (/[id].tsx) for Expo Router.
        if (
          routeMap[resolvedFilePath] &&
          routeMap[resolvedFilePath] !== expoPath
        ) {
          routeMap[resolvedFilePath] = this._mergeIntoDynamicRoute(
            routeMap[resolvedFilePath],
            expoPath
          );
          ui.warn(
            `Merged multiple static routes targeting ${resolvedFilePath} into dynamic route: ${routeMap[resolvedFilePath]}`
          );
        } else {
          routeMap[resolvedFilePath] = expoPath;
        }

        // 🔍 Trace Prop Dependencies (e.g. <Home data={data} />)
        const requiredData = this._tracePropDependencies(
          routeNode,
          sourceFile,
          projectRoot
        );

        const meta = this._extractComponentMetadata(
          project,
          resolvedFilePath,
          projectRoot
        );
        if (meta) {
          routeMetadata[resolvedFilePath] = {
            ...meta,
            requiredData: requiredData || [],
          };
        }
        ui.printSubStep(`Mapped: ${resolvedFilePath} → ${expoPath}`, 2);
      }
    }

    for (const childRoute of childrenRoutes) {
      this._processJsxRoute(
        childRoute,
        currentPath,
        sourceFile,
        routeMap,
        processedElements,
        projectRoot,
        routeMetadata,
        project,
        _sourceRoot
      );
    }
  }

  static _processObjectRoute(
    objNode,
    parentPath,
    sourceFile,
    routeMap,
    processedObjects,
    projectRoot,
    routeMetadata,
    project,
    _sourceRoot = '.'
  ) {
    processedObjects.add(objNode);

    const pathProp = objNode.getProperty('path');
    let currentPath = parentPath;

    if (pathProp && pathProp.getKind() === SyntaxKind.PropertyAssignment) {
      const init = pathProp.getInitializer();
      if (init && init.getKind() === SyntaxKind.StringLiteral) {
        currentPath = this._joinPaths(parentPath, init.getLiteralText());
      }
    }

    const elementProp = objNode.getProperty('element');
    const componentProp = objNode.getProperty('Component');
    let componentName = null;

    if (
      elementProp &&
      elementProp.getKind() === SyntaxKind.PropertyAssignment
    ) {
      const init = elementProp.getInitializer();
      if (init && init.getKind() === SyntaxKind.JsxElement)
        componentName = init.getOpeningElement().getTagNameNode().getText();
      else if (init && init.getKind() === SyntaxKind.JsxSelfClosingElement)
        componentName = init.getTagNameNode().getText();
    } else if (
      componentProp &&
      componentProp.getKind() === SyntaxKind.PropertyAssignment
    ) {
      componentName = componentProp.getInitializer()?.getText();
    }

    const childrenProp = objNode.getProperty('children');
    let childrenArrayNode = null;

    if (
      childrenProp &&
      childrenProp.getKind() === SyntaxKind.PropertyAssignment
    ) {
      const init = childrenProp.getInitializer();
      if (init && init.getKind() === SyntaxKind.ArrayLiteralExpression)
        childrenArrayNode = init;
    }

    const hasChildren =
      childrenArrayNode && childrenArrayNode.getElements().length > 0;

    if (componentName) {
      const resolvedFilePath = this._resolveImport(
        sourceFile,
        componentName,
        projectRoot
      );
      if (resolvedFilePath) {
        const isIndexRoute = !!objNode.getProperty('index');

        const expoPath = this._calculateExpoPath(
          currentPath,
          hasChildren,
          isIndexRoute
        );

        if (
          routeMap[resolvedFilePath] &&
          routeMap[resolvedFilePath] !== expoPath
        ) {
          routeMap[resolvedFilePath] = this._mergeIntoDynamicRoute(
            routeMap[resolvedFilePath],
            expoPath
          );
          ui.warn(
            `Merged multiple static object routes targeting ${resolvedFilePath} into dynamic route: ${routeMap[resolvedFilePath]}`
          );
        } else {
          routeMap[resolvedFilePath] = expoPath;
        }

        // 🔍 Trace Prop Dependencies from Object-style route
        const requiredData = this._tracePropDependenciesFromObject(
          objNode,
          sourceFile,
          projectRoot
        );

        const meta = this._extractComponentMetadata(
          project,
          resolvedFilePath,
          projectRoot
        );
        if (meta) {
          routeMetadata[resolvedFilePath] = {
            ...meta,
            requiredData: requiredData || [],
          };
        }
        ui.printSubStep(`Mapped: ${resolvedFilePath} → ${expoPath}`, 2);
      }
    }

    if (hasChildren) {
      for (const childNode of childrenArrayNode.getElements()) {
        if (childNode.getKind() === SyntaxKind.ObjectLiteralExpression) {
          this._processObjectRoute(
            childNode,
            currentPath,
            sourceFile,
            routeMap,
            processedObjects,
            projectRoot,
            routeMetadata,
            project,
            _sourceRoot
          );
        }
      }
    }
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  static _mergeIntoDynamicRoute(oldPath, newPath) {
    const oldParts = oldPath.split('/');
    const newParts = newPath.split('/');

    // If they have different nested lengths, fallback to generic [id]
    if (oldParts.length !== newParts.length) {
      const dir = oldParts.slice(0, -1).join('/');
      return `${dir}/[id].tsx`;
    }

    // Compare segments and replace varying parts with [id]
    const merged = oldParts.map((oldPart, i) => {
      if (oldPart === newParts[i]) return oldPart;

      if (oldPart.endsWith('.tsx') && newParts[i].endsWith('.tsx')) {
        return '[id].tsx';
      }
      return '[id]';
    });

    return merged.join('/');
  }

  static _extractComponentMetadata(project, resolvedFilePath, projectRoot) {
    if (!resolvedFilePath) return null;
    const absoluteTarget = path.join(projectRoot, resolvedFilePath);
    const sourceFile = project.getSourceFile(absoluteTarget);
    if (!sourceFile) return null;

    const jsxElements = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];

    let inputsCount = 0;
    let formsCount = 0;
    let linksCount = 0;

    for (const el of jsxElements) {
      const tagName =
        el.getKind() === SyntaxKind.JsxElement
          ? el.getOpeningElement().getTagNameNode().getText()
          : el.getTagNameNode().getText();

      const lowerName = tagName.toLowerCase();

      if (lowerName === 'input' || lowerName === 'textarea') inputsCount++;
      if (lowerName === 'form') formsCount++;
      if (lowerName === 'a' || lowerName === 'link' || lowerName === 'navlink')
        linksCount++;
    }

    const text = sourceFile.getFullText().toLowerCase();
    const hasDrawerHint =
      /drawer|sidebar|hamburger|menu|nav_menu|side_menu/.test(text);
    const hasTabsHint = /tabs|tab_bar|bottom_nav/.test(text);

    return {
      inputsCount,
      formsCount,
      linksCount,
      hasDrawerHint,
      hasTabsHint,
    };
  }

  static _extractComponentName(node) {
    const elementAttr = node.getAttribute('element');
    const componentAttr = node.getAttribute('Component');
    const legacyComponentAttr = node.getAttribute('component');

    if (elementAttr && elementAttr.getKind() === SyntaxKind.JsxAttribute) {
      const expr = elementAttr.getInitializer()?.getExpression?.();
      if (expr?.getKind() === SyntaxKind.JsxElement)
        return expr.getOpeningElement().getTagNameNode().getText();
      if (expr?.getKind() === SyntaxKind.JsxSelfClosingElement)
        return expr.getTagNameNode().getText();
    } else if (
      componentAttr &&
      componentAttr.getKind() === SyntaxKind.JsxAttribute
    ) {
      return (
        componentAttr.getInitializer()?.getExpression?.()?.getText() ||
        componentAttr.getInitializer()?.getText()
      );
    } else if (
      legacyComponentAttr &&
      legacyComponentAttr.getKind() === SyntaxKind.JsxAttribute
    ) {
      return (
        legacyComponentAttr.getInitializer()?.getExpression?.()?.getText() ||
        legacyComponentAttr.getInitializer()?.getText()
      );
    }
    return null;
  }

  static _joinPaths(parent, child) {
    const p = parent || '';
    const c = child || '';
    const joined = `${p}/${c}`.replace(/\/+/g, '/'); // Remove duplicate slashes
    return joined === '/' ? '/' : joined.replace(/\/$/, ''); // Remove trailing slash
  }

  static _resolveImport(sourceFile, componentName, projectRoot) {
    const result = this._resolveImportWithType(
      sourceFile,
      componentName,
      projectRoot
    );
    return result ? result.path : null;
  }

  /**
   * Resolves import path AND detects whether the component was imported as default or named.
   * Returns { path: string, isDefault: boolean } or null.
   */
  static _resolveImportWithType(sourceFile, componentName, projectRoot) {
    // 1. Check static imports
    const imports = sourceFile.getImportDeclarations();
    for (const imp of imports) {
      const defaultImport = imp.getDefaultImport()?.getText();
      const namedImports = imp
        .getNamedImports()
        .map((n) => n.getAliasNode()?.getText() || n.getName());

      if (defaultImport === componentName) {
        const resolvedPath = this._verifyAndReturnPath(
          sourceFile,
          imp.getModuleSpecifierValue(),
          projectRoot
        );
        return resolvedPath ? { path: resolvedPath, isDefault: true } : null;
      }

      if (namedImports.includes(componentName)) {
        const resolvedPath = this._verifyAndReturnPath(
          sourceFile,
          imp.getModuleSpecifierValue(),
          projectRoot
        );
        return resolvedPath ? { path: resolvedPath, isDefault: false } : null;
      }
    }

    // 2. Check dynamic imports (e.g., lazy(() => import('./pages/Dashboard')))
    // Dynamic imports always resolve the module's default export
    const callExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression
    );
    for (const callExpr of callExpressions) {
      if (callExpr.getExpression().getText() === 'import') {
        const args = callExpr.getArguments();
        if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
          const importPath = args[0].getLiteralText();

          const parentVar = callExpr.getFirstAncestorByKind(
            SyntaxKind.VariableDeclaration
          );
          if (parentVar && parentVar.getName() === componentName) {
            const resolvedPath = this._verifyAndReturnPath(
              sourceFile,
              importPath,
              projectRoot
            );
            return resolvedPath
              ? { path: resolvedPath, isDefault: true }
              : null;
          }
        }
      }
    }
    return null;
  }

  // Helper method to verify and return correct path structure
  static _verifyAndReturnPath(sourceFile, moduleSpecifier, projectRoot) {
    if (moduleSpecifier.startsWith('.')) {
      const baseDir = path.dirname(sourceFile.getFilePath());
      const absoluteTarget = path.resolve(baseDir, moduleSpecifier);
      const candidates = [
        absoluteTarget,
        `${absoluteTarget}.js`,
        `${absoluteTarget}.jsx`,
        `${absoluteTarget}.ts`,
        `${absoluteTarget}.tsx`,
        `${absoluteTarget}/index.js`,
        `${absoluteTarget}/index.jsx`,
        `${absoluteTarget}/index.ts`,
        `${absoluteTarget}/index.tsx`,
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return getRelativePath(projectRoot, candidate);
        }
      }
    }
    return null;
  }

  static _calculateExpoPath(routePath, isLayout, isIndex = false) {
    // Deterministic Expo Router root (chosen by user): always `app/`
    const basePath = 'app';
    let cleanPath = (routePath || '').replace(/^\/+/, '').replace(/\/+$/, '');

    // Support for top-level catch-all
    if (cleanPath === '*') return `${basePath}/[...missing].tsx`;

    // Handle root path
    if (!cleanPath) {
      if (isIndex) return `${basePath}/index.tsx`;
      return isLayout ? `${basePath}/_layout.tsx` : `${basePath}/index.tsx`;
    }

    // Handle dynamic route parameters and nested wildcards
    const modifiedPath = cleanPath
      .split('/')
      .map((part) => {
        if (part === '*') return '[...missing]';
        return part.startsWith(':') ? `[${part.substring(1)}]` : part;
      })
      .join('/');

    if (isIndex) return `${basePath}/${modifiedPath}/index.tsx`;
    return isLayout
      ? `${basePath}/${modifiedPath}/_layout.tsx`
      : `${basePath}/${modifiedPath}.tsx`;
  }

  static async projectRoutes(targetProjectPath, routeMap) {
    ui.step('RouteAnalyzer', 'Validating route map for File System...');

    // Only display routes, do not write empty scaffolding files to prevent Metro crashes
    const routesCount = Object.keys(routeMap).length;

    ui.printSubStep(
      `Validated ${routesCount} routes ready for AI projection. (Scaffolding bypassed to prevent Metro errors)`,
      1,
      true
    );
  }

  /**
   * Traces props passed to a JSX route element back to their original import source.
   * Only tracks props that originate from 'ImportDeclaration'.
   */
  static _tracePropDependencies(routeNode, sourceFile, projectRoot) {
    const opening =
      routeNode.getKind() === SyntaxKind.JsxElement
        ? routeNode.getOpeningElement()
        : routeNode;
    const elementAttr = opening.getAttribute('element');
    if (!elementAttr || elementAttr.getKind() !== SyntaxKind.JsxAttribute)
      return [];

    const jsxExpr = elementAttr.getInitializer()?.getExpression();
    if (!jsxExpr) return [];

    return this._extractPropsFromJsx(jsxExpr, sourceFile, projectRoot);
  }

  /**
   * Traces props from an object-style route { path: '/', element: <Home /> }
   */
  static _tracePropDependenciesFromObject(objNode, sourceFile, projectRoot) {
    const elementProp = objNode.getProperty('element');
    if (!elementProp || elementProp.getKind() !== SyntaxKind.PropertyAssignment)
      return [];

    const init = elementProp.getInitializer();
    if (!init) return [];

    return this._extractPropsFromJsx(init, sourceFile, projectRoot);
  }

  /**
   * Core helper to extract props and trace their import sources.
   * IMPEMENTATION GUARD: Only matches props from ImportDeclarations.
   */
  static _extractPropsFromJsx(jsxNode, sourceFile, projectRoot) {
    const requiredData = [];
    let openingElement;

    if (jsxNode.getKind() === SyntaxKind.JsxElement) {
      openingElement = jsxNode.getOpeningElement();
    } else if (jsxNode.getKind() === SyntaxKind.JsxSelfClosingElement) {
      openingElement = jsxNode;
    } else {
      return [];
    }

    const attributes = openingElement.getAttributes();
    for (const attr of attributes) {
      if (attr.getKind() === SyntaxKind.JsxAttribute) {
        const propName = attr.getNameNode().getText();
        const init = attr.getInitializer();

        // Check if the value is a variable {productData}
        if (init && init.getKind() === SyntaxKind.JsxExpression) {
          const expression = init.getExpression();
          if (expression && expression.getKind() === SyntaxKind.Identifier) {
            const varName = expression.getText();

            // Check if this identifier is imported in the current file
            const importPath = this._resolveImport(
              sourceFile,
              varName,
              projectRoot
            );

            if (importPath) {
              requiredData.push({
                propName,
                originalSource: importPath,
              });
            }
          }
        }
      }
    }

    return requiredData;
  }
  /**
   * Scans the AST for any components acting as Providers (e.g., <CartProvider>)
   * and dynamically detects global Layout wrappers around <Routes> or <Switch>.
   * Uses two strategies: deep container detection + sibling scanning.
   */
  static _extractProviders(sourceFile, projectRoot) {
    const providers = [];
    const jsxElements = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];

    for (const el of jsxElements) {
      const tagName =
        el.getKind() === SyntaxKind.JsxElement
          ? el.getOpeningElement().getTagNameNode().getText()
          : el.getTagNameNode().getText();

      // 🚨 نلتقط مزودات السياق فقط (مثل CartProvider).
      // يُمنع التقاط مكونات الواجهة (مثل Layout) لتجنب انهيار الـ Stack
      if (tagName.endsWith('Provider')) {
        const resolved = this._resolveImportWithType(
          sourceFile,
          tagName,
          projectRoot
        );
        if (resolved && !providers.some((p) => p.name === tagName)) {
          providers.push({
            name: tagName,
            source: resolved.path,
            isDefault: resolved.isDefault,
          });
        }
      }
    }
    return providers;
  }
}
