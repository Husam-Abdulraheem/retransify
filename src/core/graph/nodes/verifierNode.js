// src/core/graph/nodes/verifierNode.js
import { SyntaxKind } from 'ts-morph';
import { AstManager } from '../../services/AstManager.js';
import { printStep, printSubStep, printWarning } from '../../utils/ui.js';
import { resolveAbsolutePath, normalizePath } from '../../utils/pathUtils.js';
import path from 'path';
import { SemanticVerifier } from '../../scanners/SemanticVerifier.js';

/**
 * VerifierNode - Audits the generated React Native code using AST structural checks
 * and compiler diagnostics.
 */
export async function verifierNode(state) {
  const {
    currentFile,
    targetProjectPath,
    pathMap,
    installedPackages = [],
    generatedCode,
    healAttempts,
  } = state;

  const isRetry = (healAttempts || 0) > 0;

  if (!currentFile || !generatedCode) {
    return {};
  }

  const filePath = currentFile.relativeToProject || currentFile.filePath;
  const displayPath = normalizePath(filePath);

  if (!isRetry) {
    printStep(`Verifier — inspecting ${displayPath}`);
  }

  const missingDependencies = new Set();
  const errors = [];

  // 1. Determine Target Absolute Path (Crucial for node_modules resolution)
  const targetRelativePath = pathMap[filePath] || filePath;
  const targetAbsolutePath = resolveAbsolutePath(
    { relativeToProject: targetRelativePath },
    targetProjectPath
  );

  // 1. Fast Semantic Verification (Fail-Fast)
  const semanticErrors = SemanticVerifier.verify(
    generatedCode,
    targetRelativePath,
    state
  );

  if (semanticErrors.length > 0) {
    currentFile.needsHealing = true;
    currentFile.verificationErrors = semanticErrors;

    if (isRetry) {
      printSubStep(
        `Semantic Verification failed (${semanticErrors.length} errors)`,
        1
      );
    } else {
      printWarning(
        `Semantic Verification failed for ${displayPath} (${semanticErrors.length} errors)`
      );
    }

    return { errors: semanticErrors, missingDependencies: [] };
  }

  // 🚨 3. حقن الكود الجديد (React Native) في المترجم بدلاً من الكود القديم!
  const sourceFile = AstManager.upsertExpoFile(
    targetAbsolutePath,
    generatedCode,
    targetProjectPath
  );

  // 3. Structural & Syntax Verification (Compiler Diagnostics)
  const diagnostics = sourceFile.getPreEmitDiagnostics();
  for (const diagnostic of diagnostics) {
    const message = diagnostic.getMessageText();
    const line = diagnostic.getLineNumber();
    const code = diagnostic.getCode();
    const msgText =
      typeof message === 'string' ? message : message.getMessageText();

    // [FIX] Catch missing modules (TS2307) and queue for AutoInstaller
    if (code === 2307) {
      const match = msgText.match(/Cannot find module '(.+?)'/);
      if (match) {
        const moduleName = match[1];

        if (
          !moduleName.startsWith('.') &&
          !moduleName.startsWith('/') &&
          !moduleName.startsWith('@/')
        ) {
          let basePkg = moduleName;
          if (moduleName.startsWith('@')) {
            const parts = moduleName.split('/');
            if (parts.length >= 2) basePkg = parts[0] + '/' + parts[1];
          } else {
            basePkg = moduleName.split('/')[0];
          }

          if (!installedPackages.includes(basePkg)) {
            missingDependencies.add(basePkg);
          }
        }
      }
      continue;
    }

    if (diagnostic.getCategory() === 1 /* Error */) {
      errors.push(`[TS${code} L${line || '?'}]: ${msgText}`);
    }
  }

  // 4. Prohibited Web Elements & Classes
  const prohibitedTailwindClasses = [
    'h-screen',
    'w-screen',
    'fixed',
    'grid',
    'hover:',
    'focus:',
    'cursor-',
    'active:',
  ];

  const jsxAttributes = sourceFile.getDescendantsOfKind(
    SyntaxKind.JsxAttribute
  );
  jsxAttributes.forEach((attr) => {
    // Defensive check: handle both JsxAttribute and potential JsxSpreadAttribute if any leaked
    const attrName =
      typeof attr.getName === 'function'
        ? attr.getName()
        : attr.getNameNode?.().getText();
    if (attrName === 'className' || attrName === 'style') {
      const initializer = attr.getInitializer();
      if (initializer && initializer.getKind() === SyntaxKind.StringLiteral) {
        const classString = initializer.getLiteralText();
        prohibitedTailwindClasses.forEach((badClass) => {
          if (classString.includes(badClass)) {
            errors.push(
              `Line ${attr.getStartLineNumber()}: Unsupported web concept '${badClass}'.`
            );
          }
        });
      }
    }
  });

  // 5. Update state
  if (errors.length > 0) {
    currentFile.needsHealing = true;
    currentFile.verificationErrors = errors;

    if (isRetry) {
      printSubStep(`Verification failed (${errors.length} errors)`, 1);
    } else {
      printWarning(
        `Verification failed for ${displayPath} (${errors.length} errors)`
      );
    }
  } else {
    currentFile.needsHealing = false;
    currentFile.verificationErrors = [];

    if (isRetry) {
      printSubStep(`Verified ✔`, 1);
    } else {
      printSubStep(`Verified: ${displayPath} ✔`, 1);
    }
  }

  if (missingDependencies.size > 0) {
    printSubStep(
      `Detected ${missingDependencies.size} missing libraries: ${Array.from(
        missingDependencies
      ).join(', ')}`,
      1
    );
  }

  return {
    errors,
    missingDependencies: Array.from(missingDependencies),
  };
}
