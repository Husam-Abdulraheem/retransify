import crypto from 'crypto';
import { Project, SyntaxKind } from 'ts-morph';
import { printSubStep, printWarning } from '../../utils/ui.js';

export async function verifierNode(state) {
  const { generatedCode, currentFile, installedPackages = [] } = state;

  if (!generatedCode) {
    printWarning('VerifierNode: no code to verify');
    return { errors: ['No code generated'] };
  }

  const filePath =
    currentFile?.relativeToProject || currentFile?.filePath || 'unknown.tsx';
  printSubStep('Verifying Structural AST Constraints ...');

  const errors = [];

  // Initializing a simple environment for structural analysis only (AST Parsing)
  const project = new Project({
    compilerOptions: { allowJs: true, jsx: 4 }, // JSX React
    skipAddingFilesFromTsConfig: true,
  });

  const sourceFile = project.createSourceFile('temp.tsx', generatedCode, {
    overwrite: true,
  });

  // Detect missing third-party dependencies AND illegal Node.js imports
  const { missingDeps, illegalImportErrors } = detectMissingDependencies(
    sourceFile,
    installedPackages
  );

  // Illegal Node.js imports → structural errors (routed to Healer, not AutoInstaller)
  if (illegalImportErrors.length > 0) {
    errors.push(...illegalImportErrors);
  }

  try {
    // Deep structural analysis (AST Linter) - here is the real power without any compiler stupidity
    const astErrors = analyzeASTForErrors(sourceFile, filePath, state.pathMap);
    errors.push(...astErrors);
  } catch (error) {
    printWarning(`ts-morph AST crashed: ${error.message}`);
    errors.push(`Critical Syntax Error: Could not parse file.`);
  }

  if (missingDeps.length > 0) {
    printSubStep(`📦 Missing dependencies detected: ${missingDeps.join(', ')}`);
  }

  if (errors.length === 0 && missingDeps.length === 0) {
    printSubStep('Structural Verification Passed ✔');
  } else if (errors.length > 0) {
    printSubStep(
      `Verification failed: ${errors.length} structural error(s) detected`
    );
  }

  const errorHash =
    errors.length > 0
      ? crypto
          .createHash('md5')
          .update(errors.join(''))
          .digest('hex')
          .slice(0, 16)
      : null;

  return {
    errors,
    missingDependencies: missingDeps, // Populated from import analysis (TS2307 equivalent)
    lastErrorHash: errorHash,
  };
}

/**
 * Scans all import declarations in the generated code.
 * - Detects missing third-party packages (→ AutoInstaller)
 * - Detects illegal Node.js built-in imports (→ Healer as structural errors)
 */
function detectMissingDependencies(sourceFile, installedPackages = []) {
  const missing = [];
  const illegalImports = [];
  const installedSet = new Set(installedPackages);

  // Node.js built-ins that are NOT available in React Native / Expo
  const nodeBuiltIns = new Set([
    'fs',
    'path',
    'crypto',
    'http',
    'https',
    'os',
    'stream',
    'events',
    'util',
    'child_process',
    'net',
    'tls',
    'dns',
    'readline',
    'zlib',
    'buffer',
    'assert',
    'vm',
    'cluster',
  ]);

  const importDecls = sourceFile.getImportDeclarations();
  for (const decl of importDecls) {
    const moduleSpecifier = decl.getModuleSpecifierValue();

    // Skip relative imports and path aliases
    if (
      moduleSpecifier.startsWith('.') ||
      moduleSpecifier.startsWith('/') ||
      moduleSpecifier.startsWith('@/')
    ) {
      continue;
    }

    // Normalize scoped packages: '@scope/pkg/sub' -> '@scope/pkg'
    // and plain packages: 'pkg/sub' -> 'pkg'
    const parts = moduleSpecifier.split('/');
    const packageName = moduleSpecifier.startsWith('@')
      ? parts.slice(0, 2).join('/')
      : parts[0];

    // 🚨 1. Illegal Node.js built-in → structural error for Healer
    if (nodeBuiltIns.has(packageName)) {
      illegalImports.push(
        `Line ${decl.getStartLineNumber()}: Illegal import '${packageName}'. Node.js built-in modules are NOT supported in React Native. You MUST remove this import and use Expo/React Native alternatives.`
      );
      continue;
    }

    // 🚨 2. Missing third-party package → AutoInstaller
    if (!installedSet.has(packageName)) {
      // Never flag react / react-native themselves as missing
      if (packageName !== 'react' && packageName !== 'react-native') {
        missing.push(packageName);
      }
    }
  }

  return {
    missingDeps: [...new Set(missing)],
    illegalImportErrors: illegalImports,
  };
}

// The helper function analyzeASTForErrors remains exactly the same because it is written with genius
function analyzeASTForErrors(sourceFile, filePath, pathMap = {}) {
  const errors = [];
  const isComponent =
    /\.(tsx|jsx)$/i.test(filePath) || sourceFile.getText().includes('react');

  if (isComponent) {
    const jsxElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement);
    const jsxSelfClosing = sourceFile.getDescendantsOfKind(
      SyntaxKind.JsxSelfClosingElement
    );

    // 1. Prevent web elements
    const checkDynamicTagName = (tagName, line) => {
      if (/^[a-z]/.test(tagName)) {
        errors.push(
          `Line ${line}: Unsupported Web DOM element <${tagName}> detected. Use React Native components.`
        );
      }
    };

    // 2. Building a list of valid routes
    const validRoutes = new Set(
      Object.values(pathMap).map((p) => {
        let route = '/' + p.replace(/^app\//i, '').replace(/\.tsx$/i, '');
        // Fix: Remove Expo Route Groups e.g., /(tabs) or /(drawer)
        route = route.replace(/\/\([^)]+\)/g, '');
        if (route.endsWith('/index')) route = route.replace('/index', '');
        if (route.endsWith('/_layout')) route = route.replace('/_layout', '');
        return route === '' ? '/' : route.toLowerCase();
      })
    );

    // 3. Checking for dead links
    const checkHrefForDeadLinks = (element, line) => {
      const tagName = element.getTagNameNode().getText();
      if (tagName === 'Link' || tagName === 'Redirect') {
        const hrefAttr = element.getAttribute('href');
        if (hrefAttr && hrefAttr.getKind() === SyntaxKind.JsxAttribute) {
          const val = hrefAttr
            .getInitializer()
            ?.getText()
            ?.replace(/['"]/g, '');
          if (
            val &&
            !val.startsWith('http') &&
            !val.includes('{') &&
            !val.includes('$')
          ) {
            const targetUrl = val.toLowerCase();
            const isMatch = Array.from(validRoutes).some((validRoute) => {
              const regexStr =
                '^' + validRoute.replace(/\[.*?\]/g, '[^/]+') + '$';
              return new RegExp(regexStr).test(targetUrl);
            });
            if (!isMatch) {
              const available = Array.from(validRoutes).join(', ');
              errors.push(
                `Line ${line}: CRITICAL ROUTING ERROR. Dead link "${val}". Valid routes are: [${available}].`
              );
            }
          }
        }
      }
    };

    jsxElements.forEach((element) => {
      const openingElement = element.getOpeningElement();
      const tagName = openingElement.getTagNameNode().getText().split('.')[0];
      checkDynamicTagName(tagName, openingElement.getStartLineNumber());
      checkHrefForDeadLinks(
        openingElement,
        openingElement.getStartLineNumber()
      );
    });

    jsxSelfClosing.forEach((element) => {
      const tagName = element.getTagNameNode().getText().split('.')[0];
      checkDynamicTagName(tagName, element.getStartLineNumber());
      checkHrefForDeadLinks(element, element.getStartLineNumber());
    });
  }
  return [...new Set(errors)];
}
