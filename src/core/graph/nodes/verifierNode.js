// src/core/graph/nodes/verifierNode.js
import { SyntaxKind } from 'ts-morph';
import { AstManager } from '../../services/AstManager.js';
import { printStep, printSubStep, printWarning } from '../../utils/ui.js';

/**
 * VerifierNode - Audits the generated React Native code using AST structural checks
 * and compiler diagnostics.
 *
 * @param {import('../state.js').GraphState} state
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function verifierNode(state) {
  printStep('Verifier — inspecting generated code');

  const { filesQueue, targetProjectPath, installedPackages = [] } = state;
  const projectDir = targetProjectPath;

  let allFilesPassed = true;
  const missingDependencies = new Set();

  // Web concepts that break Native performance or layouts
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

  for (const fileObj of filesQueue) {
    // Only verify files that were actually modified or transpilied
    if (fileObj.isVirtual || fileObj.isAsset || !fileObj.content) continue;

    const errors = [];

    // 1. Live Memory Update (No Disk I/O, No Memory Leak)
    const sourceFile = AstManager.upsertExpoFile(
      fileObj.absolutePath,
      fileObj.content,
      projectDir
    );

    // 2. Structural & Syntax Verification (Compiler Diagnostics)
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

          // Filter out local files and common aliases
          if (
            !moduleName.startsWith('.') &&
            !moduleName.startsWith('/') &&
            !moduleName.startsWith('@/')
          ) {
            // Extract base package name (e.g. @scope/pkg/sub -> @scope/pkg)
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

    // 3. Prohibited Web Elements & Classes (NativeWind Guard)
    const jsxAttributes = sourceFile.getDescendantsOfKind(
      SyntaxKind.JsxAttribute
    );
    jsxAttributes.forEach((attr) => {
      const attrName = attr.getName();
      if (attrName === 'className' || attrName === 'style') {
        const initializer = attr.getInitializer();
        if (initializer && initializer.getKind() === SyntaxKind.StringLiteral) {
          const classString = initializer.getLiteralText();
          prohibitedTailwindClasses.forEach((badClass) => {
            if (classString.includes(badClass)) {
              errors.push(
                `Line ${attr.getStartLineNumber()}: Unsupported web concept '${badClass}'. You MUST use Flexbox or RN-equivalent equivalents.`
              );
            }
          });
        }
      }
    });

    // 4. Update file metadata for Healer or Executor
    if (errors.length > 0) {
      fileObj.needsHealing = true;
      fileObj.verificationErrors = errors;
      allFilesPassed = false;
      const displayPath = fileObj.relativeToProject || fileObj.filePath;
      printWarning(
        `Verification failed for ${displayPath} (${errors.length} errors)`
      );
    } else {
      fileObj.needsHealing = false;
      fileObj.verificationErrors = [];
      const displayPath = fileObj.relativeToProject || fileObj.filePath;
      printSubStep(`Verified: ${displayPath}`, 1);
    }
  }

  if (allFilesPassed && missingDependencies.size === 0) {
    printSubStep(
      'All transpiled files passed structural verification.',
      1,
      true
    );
  } else if (missingDependencies.size > 0) {
    printSubStep(
      `Detected ${missingDependencies.size} missing libraries. Routing to AutoInstaller...`,
      1,
      true
    );
  } else {
    printSubStep('Routing failed files to Healer Node...', 1, true);
  }

  return {
    filesQueue,
    missingDependencies: Array.from(missingDependencies),
  };
}
