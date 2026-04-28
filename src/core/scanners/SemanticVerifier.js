import { Project, SyntaxKind, Node } from 'ts-morph';
import path from 'path';

export class SemanticVerifier {
  static verify(generatedCode, currentFileTargetPath, state) {
    const errors = [];
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('temp.tsx', generatedCode);

    // 1. Web DOM Leakage
    const jsxElements = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];
    for (const elem of jsxElements) {
      const tagName = elem.getTagNameNode().getText();
      if (/^[a-z]/.test(tagName) && tagName !== 'fragment') {
        errors.push(
          `[Fatal Semantic Error]: Found Web DOM element '<${tagName}>'. React Native requires UpperCase components (e.g., View, Text).`
        );
      }
    }

    // 2. Strict Routing & Import Integrity
    const imports = sourceFile.getImportDeclarations();
    for (const imp of imports) {
      const modulePath = imp.getModuleSpecifierValue();

      if (modulePath === 'react-router-dom') {
        errors.push(
          `[Fatal Semantic Error]: Found import from 'react-router-dom'. You MUST use 'expo-router' for navigation.`
        );
      }

      if (modulePath.startsWith('.') || modulePath.startsWith('@/')) {
        const isValid = this.checkIfPathExists(
          modulePath,
          currentFileTargetPath,
          state
        );

        if (!isValid) {
          errors.push(
            `[Fatal Import Error]: You tried to import from '${modulePath}'. NO SUCH FILE exists in the mobile architecture.`
          );
        }
      }
    }

    // 3. 🚨 Require() Validation (Images & Assets) 🚨
    const callExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression
    );
    for (const callExpr of callExpressions) {
      const expression = callExpr.getExpression();

      if (expression.getText() === 'require') {
        const args = callExpr.getArguments();

        if (args.length > 0) {
          const firstArg = args[0];
          if (Node.isStringLiteral(firstArg)) {
            const requiredPath = firstArg.getLiteralText();
            const isValid = this.checkIfPathExists(
              requiredPath,
              currentFileTargetPath,
              state
            );
            if (!isValid) {
              errors.push(
                `[Fatal Require Error]: require('${requiredPath}') refers to a non-existent asset or file. Check 'AVAILABLE ASSETS'.`
              );
            }
          } else {
            // 🚨 Metro Bundler Critical Failure: Dynamic require
            errors.push(
              `[Fatal Require Error]: Found dynamic require(${firstArg.getText()}). React Native (Metro) ONLY supports static string literals in require().`
            );
          }
        }
      }
    }

    return errors;
  }

  static checkIfPathExists(modulePath, currentFileTargetPath, state) {
    let resolvedRaw;
    if (modulePath.startsWith('@/')) {
      resolvedRaw = modulePath.replace('@/', '');
    } else {
      const fileDir = path.posix.dirname(
        currentFileTargetPath.replace(/\\/g, '/')
      );
      resolvedRaw = path.posix.join(fileDir, modulePath);
    }

    resolvedRaw = path.posix.normalize(resolvedRaw);

    const allValidTargetPaths = Object.values(state.pathMap).map((p) =>
      p.replace(/\\/g, '/')
    );
    const extensions = [
      '',
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '/index.js',
      '/index.jsx',
      '/index.ts',
      '/index.tsx',
    ];

    // Check code files
    for (const ext of extensions) {
      const candidate = resolvedRaw + ext;
      if (allValidTargetPaths.includes(candidate)) return true;
      if (
        modulePath.startsWith('@/') &&
        allValidTargetPaths.includes('src/' + candidate)
      )
        return true;
    }

    // Check assets (state.assetMap)
    if (state.assetMap) {
      const normalizedAssetPaths = Object.values(state.assetMap).map((p) =>
        p.replace(/\\/g, '/')
      );
      // Assets usually keep their extensions in require()
      if (normalizedAssetPaths.includes(resolvedRaw)) return true;

      // Deep search for assets (supporting sub-paths)
      for (const assetPath of normalizedAssetPaths) {
        if (assetPath === resolvedRaw || assetPath.startsWith(resolvedRaw)) {
          return true;
        }
      }
    }

    return false;
  }
}
