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

  const { filesQueue, targetProjectPath, rnProjectPath } = state;
  const projectDir = targetProjectPath || rnProjectPath;

  let allFilesPassed = true;

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
    // Note: Checking a flag like isTranspiled if available, otherwise check if path changed or context updated

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

      // Skip missing modules error (handled by AutoInstaller separately)
      if (code === 2307) continue;

      if (diagnostic.getCategory() === 1 /* Error */) {
        errors.push(
          `[TS${code} L${line || '?'}]: ${typeof message === 'string' ? message : message.getMessageText()}`
        );
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

  if (allFilesPassed) {
    printSubStep(
      'All transpiled files passed structural verification.',
      1,
      true
    );
  } else {
    printSubStep('Routing failed files to Healer Node...', 1, true);
  }

  return { filesQueue };
}
