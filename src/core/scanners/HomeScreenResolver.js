// src/core/scanners/HomeScreenResolver.js
import { SyntaxKind } from 'ts-morph';
import { AstManager } from '../services/AstManager.js';
import path from 'path';
import fs from 'fs-extra';
import { getRelativePath } from '../utils/pathUtils.js';
import { ui } from '../utils/ui.js';

/**
 * A fixed blocklist of known React wrapper components that should NOT be
 * mistaken for the app's true root component. These are infrastructure layers,
 * not the actual page component the developer wrote.
 */
const KNOWN_WRAPPER_BLOCKLIST = new Set([
  'StrictMode',
  'Provider',
  'BrowserRouter',
  'HashRouter',
  'Router',
  'MemoryRouter',
  'QueryClientProvider',
  'ThemeProvider',
  'AuthProvider',
  'I18nextProvider',
  'Suspense',
  'ErrorBoundary',
  'CookiesProvider',
  'PersistGate',
  'HelmetProvider',
  'ReactQueryDevtools',
]);

export class HomeScreenResolver {
  /**
   * Orchestrates the 4-step AST chain to discover the true home screen.
   *
   * @param {string} projectRoot - Absolute path of the web project root
   * @param {Array<Object>} filesQueue - Array of file objects from FileScanner
   * @returns {Promise<Object|null>} Resolution result or null if discovery failed
   *
   * Return shape on success with routing:
   *   { homeFilePath: 'src/pages/Home.jsx', homeComponentName: 'Home', appFilePath: 'src/App.jsx' }
   *
   * Return shape when App itself is the home screen (no routing):
   *   { homeFilePath: 'src/App.jsx', homeComponentName: 'App', appFilePath: null }
   *
   * Returns null on complete failure (does NOT throw — safe for pipeline).
   */
  static async resolve(projectRoot, filesQueue) {
    ui.step('HomeScreenResolver', 'Tracing true home screen via AST...');

    try {
      // ── Step 1: Find the Bootstrap file ────────────────────────────────
      const bootstrapResult = await this._findBootstrapFile(
        projectRoot,
        filesQueue
      );
      if (!bootstrapResult) {
        ui.printSubStep(
          'No ReactDOM.createRoot / render() bootstrap found.',
          1,
          true
        );
        return null;
      }
      const { bootstrapSourceFile, bootstrapRelativePath } = bootstrapResult;
      ui.printSubStep(`Bootstrap file: ${bootstrapRelativePath}`, 1);

      // ── Step 2: Extract the true root component (3-filter algorithm) ───
      const rootComponentName =
        this._extractRootComponentName(bootstrapSourceFile);
      if (!rootComponentName) {
        ui.printSubStep(
          'Could not identify root component inside render().',
          1,
          true
        );
        return null;
      }
      ui.printSubStep(`Root component detected: <${rootComponentName} />`, 1);

      // ── Step 3: Resolve App file path from bootstrap imports ────────────
      const appFilePath = this._resolveLocalImport(
        bootstrapSourceFile,
        rootComponentName,
        projectRoot
      );
      if (!appFilePath) {
        ui.printSubStep(
          `Could not resolve import path for <${rootComponentName} />.`,
          1,
          true
        );
        return null;
      }
      ui.printSubStep(`App file resolved: ${appFilePath}`, 1);

      // ── Step 4: Find the Route with path="/" inside the App file ────────
      const homeResult = await this._findHomeRoute(appFilePath, projectRoot);

      if (homeResult) {
        ui.printSubStep(
          `Home screen: <${homeResult.homeComponentName} /> → ${homeResult.homeFilePath}`,
          1
        );
        return {
          homeFilePath: homeResult.homeFilePath,
          homeComponentName: homeResult.homeComponentName,
          appFilePath,
        };
      }

      // No routing found — App itself IS the home screen
      ui.printSubStep(
        `No routing found in App. App file itself is the home screen.`,
        1
      );
      return {
        homeFilePath: appFilePath,
        homeComponentName: rootComponentName,
        appFilePath: null,
      };
    } catch (err) {
      ui.warn(`HomeScreenResolver failed silently: ${err.message}`);
      return null;
    }
  }

  // ─── STEP 1: Bootstrap File Detection ─────────────────────────────────────

  /**
   * Scans all JS/TS files to find the one that calls ReactDOM.createRoot()
   * or ReactDOM.render(). Uses AST CallExpression detection — NOT regex.
   *
   * @returns {{ bootstrapSourceFile, bootstrapRelativePath } | null}
   */
  static async _findBootstrapFile(projectRoot, filesQueue) {
    const project = AstManager.getWebProject();

    for (const fileObj of filesQueue) {
      const filePath = fileObj.relativeToProject || fileObj.filePath || '';
      if (!/\.(jsx?|tsx?)$/i.test(filePath)) continue;

      const absolutePath =
        fileObj.absolutePath || path.join(projectRoot, filePath);
      if (!fs.existsSync(absolutePath)) continue;

      let sourceFile;
      try {
        const content =
          fileObj.content || (await fs.readFile(absolutePath, 'utf8'));
        sourceFile = project.createSourceFile(absolutePath, content, {
          overwrite: true,
        });
      } catch {
        continue;
      }

      // Check imports: must import from 'react-dom' or 'react-dom/client'
      const hasReactDomImport = sourceFile
        .getImportDeclarations()
        .some((imp) => {
          const mod = imp.getModuleSpecifierValue();
          return mod === 'react-dom' || mod === 'react-dom/client';
        });

      if (!hasReactDomImport) continue;

      // Check for createRoot() or ReactDOM.render() call expressions via AST
      const isBootstrap = this._hasBootstrapCall(sourceFile);
      if (isBootstrap) {
        return {
          bootstrapSourceFile: sourceFile,
          bootstrapRelativePath: filePath,
        };
      }
    }

    return null;
  }

  /**
   * Returns true if the source file contains a `createRoot(...)` or
   * `ReactDOM.render(...)` call expression.
   */
  static _hasBootstrapCall(sourceFile) {
    const callExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression
    );

    for (const call of callExpressions) {
      const exprText = call.getExpression().getText();
      // Matches: createRoot(...), ReactDOM.createRoot(...), root.render(...), ReactDOM.render(...)
      if (
        exprText === 'createRoot' ||
        exprText === 'ReactDOM.createRoot' ||
        exprText === 'ReactDOM.render' ||
        exprText.endsWith('.render')
      ) {
        return true;
      }
    }
    return false;
  }

  // ─── STEP 2: Root Component Extraction (3-Filter Algorithm) ──────────────

  /**
   * Applies the 3-filter algorithm to all JSX elements inside render():
   *   1. PascalCase — excludes DOM tags (div, span, etc.)
   *   2. Local import — excludes third-party library components
   *   3. Known wrappers blocklist — excludes infrastructure wrappers
   *
   * @param {import('ts-morph').SourceFile} sourceFile
   * @returns {string | null} The name of the true root component
   */
  static _extractRootComponentName(sourceFile) {
    // Build a set of locally-imported identifier names (starts with ./ or ../)
    const locallyImportedNames = new Set();
    for (const imp of sourceFile.getImportDeclarations()) {
      const mod = imp.getModuleSpecifierValue();
      if (!mod.startsWith('.')) continue;

      const defaultImport = imp.getDefaultImport()?.getText();
      if (defaultImport) locallyImportedNames.add(defaultImport);

      imp
        .getNamedImports()
        .forEach((n) =>
          locallyImportedNames.add(n.getAliasNode()?.getText() || n.getName())
        );
    }

    // Collect all JSX elements in the file (both self-closing and paired)
    const jsxElements = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];

    for (const el of jsxElements) {
      const tagName =
        el.getKind() === SyntaxKind.JsxElement
          ? el.getOpeningElement().getTagNameNode().getText()
          : el.getTagNameNode().getText();

      // Filter 1: Must start with capital letter (PascalCase = React component)
      if (!/^[A-Z]/.test(tagName)) continue;

      // Filter 2: Must be a local import (rules out Provider, QueryClient etc.)
      if (!locallyImportedNames.has(tagName)) continue;

      // Filter 3: Must NOT be a known infrastructure wrapper
      if (KNOWN_WRAPPER_BLOCKLIST.has(tagName)) continue;

      // This is the true root component!
      return tagName;
    }

    return null;
  }

  // ─── STEP 3: App File Import Resolution ──────────────────────────────────

  /**
   * Resolves the relative file path of a component name, supporting:
   * 1. Static Imports (import Home from './Home')
   * 2. Dynamic/Lazy Imports (const Home = lazy(() => import('./Home')))
   * 3. Local Definitions (function Home() { ... })
   *
   * @param {import('ts-morph').SourceFile} sourceFile
   * @param {string} componentName
   * @param {string} projectRoot
   * @returns {string | null} Relative path from project root
   */
  static _resolveLocalImport(sourceFile, componentName, projectRoot) {
    // Pass 1: Check Static Imports
    for (const imp of sourceFile.getImportDeclarations()) {
      const mod = imp.getModuleSpecifierValue();
      if (!mod.startsWith('.')) continue;

      const defaultImport = imp.getDefaultImport()?.getText();
      const namedImports = imp
        .getNamedImports()
        .map((n) => n.getAliasNode()?.getText() || n.getName());

      if (
        defaultImport === componentName ||
        namedImports.includes(componentName)
      ) {
        return this._verifyAndReturnPath(sourceFile, mod, projectRoot);
      }
    }

    // Pass 2: Check Dynamic Imports (Lazy Loading)
    // const Home = lazy(() => import('./Home'))
    const varDeclarations = sourceFile.getVariableDeclarations();
    for (const v of varDeclarations) {
      if (v.getName() === componentName) {
        const initializer = v.getInitializer();
        if (initializer) {
          const importCalls = initializer
            .getDescendantsOfKind(SyntaxKind.CallExpression)
            .filter((call) => call.getExpression().getText() === 'import');

          if (importCalls.length > 0) {
            const pathArg = importCalls[0].getArguments()[0];
            if (pathArg && pathArg.getKind() === SyntaxKind.StringLiteral) {
              return this._verifyAndReturnPath(
                sourceFile,
                pathArg.getLiteralText(),
                projectRoot
              );
            }
          }
        }
      }
    }

    // Pass 3: Check Local Definitions
    // If the component is defined in the same file, the "source" is the file itself.
    const isLocal =
      sourceFile.getFunctions().some((f) => f.getName() === componentName) ||
      sourceFile.getClasses().some((c) => c.getName() === componentName) ||
      sourceFile
        .getVariableDeclarations()
        .some((v) => v.getName() === componentName);

    if (isLocal) {
      return getRelativePath(projectRoot, sourceFile.getFilePath());
    }

    return null;
  }

  /**
   * Helper to verify file existence with candidate extensions.
   */
  static _verifyAndReturnPath(sourceFile, moduleSpecifier, projectRoot) {
    const baseDir = path.dirname(sourceFile.getFilePath());
    const resolvedBase = path.resolve(baseDir, moduleSpecifier);

    const candidates = [
      resolvedBase,
      `${resolvedBase}.js`,
      `${resolvedBase}.jsx`,
      `${resolvedBase}.ts`,
      `${resolvedBase}.tsx`,
      `${resolvedBase}/index.js`,
      `${resolvedBase}/index.jsx`,
      `${resolvedBase}/index.ts`,
      `${resolvedBase}/index.tsx`,
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return getRelativePath(projectRoot, candidate);
      }
    }
    return null;
  }

  // ─── STEP 4: Home Route Resolution (Route path="/") ──────────────────────

  /**
   * Opens the App file and searches for a <Route path="/"> or <Route index>
   * element to find the true home screen component.
   *
   * @param {string} appFilePath - Relative path e.g. 'src/App.jsx'
   * @param {string} projectRoot
   * @returns {{ homeFilePath: string, homeComponentName: string } | null}
   */
  static async _findHomeRoute(appFilePath, projectRoot) {
    const absoluteAppPath = path.join(projectRoot, appFilePath);
    if (!fs.existsSync(absoluteAppPath)) return null;

    const project = AstManager.getWebProject();
    let appSourceFile;

    try {
      const content = await fs.readFile(absoluteAppPath, 'utf8');
      appSourceFile = project.createSourceFile(absoluteAppPath, content, {
        overwrite: true,
      });
    } catch {
      return null;
    }

    // Collect all JSX Route elements
    const allJsxElements = [
      ...appSourceFile.getDescendantsOfKind(SyntaxKind.JsxElement),
      ...appSourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];

    const routeElements = allJsxElements.filter((el) => {
      const opening =
        el.getKind() === SyntaxKind.JsxElement ? el.getOpeningElement() : el;
      return opening.getTagNameNode().getText() === 'Route';
    });

    if (routeElements.length === 0) return null;

    // Find Route with path="/" or with the `index` attribute
    for (const routeEl of routeElements) {
      const opening =
        routeEl.getKind() === SyntaxKind.JsxElement
          ? routeEl.getOpeningElement()
          : routeEl;

      const pathAttr = opening.getAttribute('path');
      const indexAttr = opening.getAttribute('index');

      let pathValue = null;
      if (pathAttr && pathAttr.getKind() === SyntaxKind.JsxAttribute) {
        const init = pathAttr.getInitializer();
        if (init?.getKind() === SyntaxKind.StringLiteral) {
          pathValue = init.getLiteralText();
        } else if (init?.getKind() === SyntaxKind.JsxExpression) {
          // Handles path={'/'}
          pathValue =
            init.getExpression()?.getLiteralText?.() ||
            init.getExpression()?.getText()?.replace(/['"]/g, '');
        }
      }

      const isRootRoute = indexAttr !== undefined || pathValue === '/';
      if (!isRootRoute) continue;

      // Extract the component name from element={<Home />} or component={Home}
      const componentName = this._extractRouteComponentName(opening);
      if (!componentName) continue;

      // Resolve the component to its file via App file's imports
      const homeFilePath = this._resolveLocalImport(
        appSourceFile,
        componentName,
        projectRoot
      );

      if (homeFilePath) {
        return { homeFilePath, homeComponentName: componentName };
      }
    }

    // Also check object-based routes (createBrowserRouter / useRoutes)
    return this._findHomeRouteFromObjects(appSourceFile, projectRoot);
  }

  /**
   * Extracts the component name from a JSX Route element's `element` or
   * `component` attribute.
   */
  static _extractRouteComponentName(openingElement) {
    // Try element={<Home />} or element={<Home/>}
    const elementAttr = openingElement.getAttribute('element');
    if (elementAttr && elementAttr.getKind() === SyntaxKind.JsxAttribute) {
      const expr = elementAttr.getInitializer()?.getExpression?.();
      if (expr?.getKind() === SyntaxKind.JsxElement)
        return expr.getOpeningElement().getTagNameNode().getText();
      if (expr?.getKind() === SyntaxKind.JsxSelfClosingElement)
        return expr.getTagNameNode().getText();
    }

    // Try component={Home} or Component={Home}
    for (const attrName of ['component', 'Component']) {
      const compAttr = openingElement.getAttribute(attrName);
      if (compAttr && compAttr.getKind() === SyntaxKind.JsxAttribute) {
        const val =
          compAttr.getInitializer()?.getExpression?.()?.getText() ||
          compAttr.getInitializer()?.getText();
        if (val) return val.replace(/[{}]/g, '').trim();
      }
    }

    return null;
  }

  /**
   * Fallback: searches object-literal route definitions (createBrowserRouter /
   * useRoutes style) for a root-level route with path: '/'.
   */
  static _findHomeRouteFromObjects(sourceFile, projectRoot) {
    const objectLiterals = sourceFile.getDescendantsOfKind(
      SyntaxKind.ObjectLiteralExpression
    );

    for (const obj of objectLiterals) {
      const pathProp = obj.getProperty('path');
      if (!pathProp || pathProp.getKind() !== SyntaxKind.PropertyAssignment)
        continue;

      const pathValue = pathProp.getInitializer()?.getLiteralText?.();
      const indexProp = obj.getProperty('index');

      const isRoot = pathValue === '/' || indexProp !== undefined;
      if (!isRoot) continue;

      // Try element property: { path: '/', element: <Home /> }
      const elementProp = obj.getProperty('element');
      let componentName = null;
      if (
        elementProp &&
        elementProp.getKind() === SyntaxKind.PropertyAssignment
      ) {
        const init = elementProp.getInitializer();
        if (init?.getKind() === SyntaxKind.JsxElement)
          componentName = init.getOpeningElement().getTagNameNode().getText();
        else if (init?.getKind() === SyntaxKind.JsxSelfClosingElement)
          componentName = init.getTagNameNode().getText();
      }

      // Try Component property: { path: '/', Component: Home }
      if (!componentName) {
        const compProp =
          obj.getProperty('Component') || obj.getProperty('component');
        if (compProp && compProp.getKind() === SyntaxKind.PropertyAssignment) {
          componentName = compProp.getInitializer()?.getText?.()?.trim();
        }
      }

      if (!componentName) continue;

      const homeFilePath = this._resolveLocalImport(
        sourceFile,
        componentName,
        projectRoot
      );
      if (homeFilePath) {
        return { homeFilePath, homeComponentName: componentName };
      }
    }

    return null;
  }
}
