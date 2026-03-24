import { Project, SyntaxKind } from 'ts-morph';
import path from 'path';
import fs from 'fs-extra';

export class RouteAnalyzer {
  /**
   * Scans project files for React Router definitions (JSX or Objects)
   * and maps them to Expo Router filesystem projections.
   *
   * @param {string} projectRoot - The absolute path of the Web project
   * @param {Array<Object>} filesQueue - Queue of files to be scanned
   * @returns {Object} routeMap - { "originalFilePath": "expo/path/file.tsx" }
   */
  static async analyze(projectRoot, filesQueue) {
    console.log('\n🗺️  [RouteAnalyzer] Extracting AST routing tree...');
    const routeMap = {};
    const routingSourceFiles = [];

    // 1. Safe Isolated ts-morph Project Setup
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      compilerOptions: {
        allowJs: true,
        jsx: 2, // React JSX
      },
    });

    // 2. Safe File Loading & AST Injection
    for (const fileObj of filesQueue) {
      // Only process component/logic files
      if (!/\.(jsx?|tsx?)$/.test(fileObj.filePath)) continue;

      const absolutePath =
        fileObj.absolutePath ||
        path.join(projectRoot, fileObj.filePath || fileObj.relativeToProject);

      if (!fs.existsSync(absolutePath)) {
        console.warn(
          `  ⚠️  [RouteAnalyzer] Skipped missing file: ${absolutePath}`
        );
        continue;
      }

      try {
        const content =
          fileObj.content || (await fs.readFile(absolutePath, 'utf8'));
        const sourceFile = project.createSourceFile(absolutePath, content, {
          overwrite: true,
        });

        // Fast check for routing imports before heavy AST traversal
        const hasRouting = sourceFile
          .getImportDeclarations()
          .some((imp) =>
            imp.getModuleSpecifierValue().includes('react-router')
          );

        if (hasRouting) {
          routingSourceFiles.push(sourceFile);
        }
      } catch (err) {
        console.error(
          `  ❌ [RouteAnalyzer] Failed to parse AST for ${absolutePath}:`,
          err.message
        );
      }
    }

    if (routingSourceFiles.length === 0) {
      console.log('   ℹ️  No react-router usage detected.');
      return routeMap;
    }

    console.log(
      `   🔍 Found ${routingSourceFiles.length} file(s) with routing declarations.`
    );

    // 3. Process Routing Trees
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
            projectRoot
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
              projectRoot
            );
          }
        }
      }
    }

    console.log(
      `   ✅ Extracted ${Object.keys(routeMap).length} mapped routes.`
    );
    return routeMap;
  }

  // ─── INTERNAL AST PROCESSING METHODS ─────────────────────────────────────────

  static _processJsxRoute(
    routeNode,
    parentPath,
    sourceFile,
    routeMap,
    processedElements,
    projectRoot
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
        const expoPath = this._calculateExpoPath(currentPath, hasChildren);
        routeMap[resolvedFilePath] = expoPath;
        console.log(`      * [JSX] ${resolvedFilePath} -> ${expoPath}`);
      }
    }

    for (const childRoute of childrenRoutes) {
      this._processJsxRoute(
        childRoute,
        currentPath,
        sourceFile,
        routeMap,
        processedElements,
        projectRoot
      );
    }
  }

  static _processObjectRoute(
    objNode,
    parentPath,
    sourceFile,
    routeMap,
    processedObjects,
    projectRoot
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
        const expoPath = this._calculateExpoPath(currentPath, hasChildren);
        routeMap[resolvedFilePath] = expoPath;
        console.log(`      * [OBJ] ${resolvedFilePath} -> ${expoPath}`);
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
            projectRoot
          );
        }
      }
    }
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  static _extractComponentName(node) {
    const elementAttr = node.getAttribute('element');
    const componentAttr = node.getAttribute('Component');

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
      return componentAttr.getInitializer()?.getExpression?.()?.getText();
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
    const imports = sourceFile.getImportDeclarations();
    for (const imp of imports) {
      const defaultImport = imp.getDefaultImport()?.getText();
      const namedImports = imp
        .getNamedImports()
        .map((n) => n.getAliasNode()?.getText() || n.getName());

      if (
        defaultImport === componentName ||
        namedImports.includes(componentName)
      ) {
        const moduleSpecifier = imp.getModuleSpecifierValue();
        if (moduleSpecifier.startsWith('.')) {
          // Robust physical path resolution
          const baseDir = path.dirname(sourceFile.getFilePath());
          const absoluteTarget = path.resolve(baseDir, moduleSpecifier);

          const extensions = [
            '.js',
            '.jsx',
            '.ts',
            '.tsx',
            '/index.js',
            '/index.jsx',
            '/index.ts',
            '/index.tsx',
          ];
          for (const ext of extensions) {
            if (fs.existsSync(absoluteTarget + ext)) {
              return path
                .relative(projectRoot, absoluteTarget + ext)
                .replace(/\\/g, '/');
            }
          }
        }
      }
    }
    return null;
  }

  static _calculateExpoPath(routePath, isLayout) {
    if (!routePath || routePath === '/') {
      return isLayout ? 'app/_layout.tsx' : 'app/index.tsx';
    }

    const modifiedPath = routePath
      .replace(/^\/+/, '') // Remove leading
      .replace(/\/+$/, '') // Remove trailing
      .split('/')
      .map((part) => (part.startsWith(':') ? `[${part.substring(1)}]` : part))
      .join('/');

    return isLayout
      ? `app/${modifiedPath}/_layout.tsx`
      : `app/${modifiedPath}.tsx`;
  }

  static async projectRoutes(rnProjectPath, routeMap) {
    console.log('\n🏗️  [RouteAnalyzer] Projecting route map to File System...');
    let count = 0;

    for (const [originalFile, expoPath] of Object.entries(routeMap)) {
      const absoluteDest = path.join(rnProjectPath, expoPath);
      await fs.ensureDir(path.dirname(absoluteDest));

      if (!(await fs.pathExists(absoluteDest))) {
        await fs.writeFile(
          absoluteDest,
          `// AI Scaffold for ${originalFile}\n`
        );
        count++;
      }
    }

    console.log(
      `   ✅ Projected ${count} new route files into app/ directory.`
    );
  }
}
