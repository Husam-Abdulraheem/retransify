// src/core/graph/nodes/contextUpdaterNode.js
import path from 'path';
import { SyntaxKind } from 'ts-morph';
import { AstManager } from '../../services/AstManager.js';
import { printSubStep, printWarning } from '../../utils/ui.js';
import { normalizePath } from '../../utils/pathUtils.js';

/**
 * ContextUpdaterNode - Updates ContextStore after a file is converted.
 *
 * Deletes the old web summary and inserts the new native summary,
 * so subsequent files that import this one get the correct (converted) context.
 *
 * @param {import('../state.js').GraphState} state
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function contextUpdaterNode(state) {
  const { generatedCode, currentFile, vectorStore } = state;

  if (!generatedCode || !vectorStore) return {};

  const filePath = normalizePath(
    currentFile?.relativeToProject || currentFile?.filePath || ''
  );
  if (!filePath) return {};

  try {
    const newSummary = extractSummaryFromCode(generatedCode, filePath);

    if (!newSummary) return {};

    // Delete the stale web context before inserting the native one
    if (typeof vectorStore.deleteDocumentByFilePath === 'function') {
      vectorStore.deleteDocumentByFilePath(filePath);
    }

    // Insert updated native summary
    vectorStore.addDocuments([
      {
        pageContent: newSummary,
        metadata: { filePath, type: 'converted_file' },
      },
    ]);

    printSubStep('ContextStore updated with native summary');
    return {};
  } catch (err) {
    printWarning(`Context updater failed: ${err.message}`);
    return {};
  }
}

function extractSummaryFromCode(code, filePath) {
  try {
    const tsProject = AstManager.getExpoProject();

    const sourceFile = tsProject.createSourceFile(
      `temp_${path.basename(filePath)}`,
      code,
      { overwrite: true }
    );

    const parts = [`FILE: ${filePath} (CONVERTED)`];

    // Interfaces
    const interfaces = sourceFile.getInterfaces();
    if (interfaces.length > 0) {
      parts.push(
        'INTERFACES: ' + interfaces.map((i) => i.getName()).join(', ')
      );
    }

    // Exported functions + components
    const exports = sourceFile.getFunctions().filter((f) => f.isExported());
    if (exports.length > 0) {
      parts.push('EXPORTS: ' + exports.map((f) => f.getName()).join(', '));
    }

    // Hooks with full signatures
    const hooks = sourceFile
      .getFunctions()
      .filter((f) => f.getName()?.startsWith('use'));
    if (hooks.length > 0) {
      parts.push('HOOKS:');
      hooks.forEach((h) => {
        const params = h
          .getParameters()
          .map((p) => `${p.getName()}: ${p.getType().getText()}`)
          .join(', ');
        const returnType = h.getReturnType().getText().slice(0, 120);
        parts.push(`  ${h.getName()}(${params}): ${returnType}`);
      });
    }

    // RN-specific imports for context
    const rnImports = sourceFile
      .getImportDeclarations()
      .filter((i) => i.getModuleSpecifierValue().startsWith('react-native'))
      .map((i) => `from '${i.getModuleSpecifierValue()}'`);
    if (rnImports.length > 0) {
      parts.push('RN_IMPORTS: ' + rnImports.join(', '));
    }

    return parts.join('\n');
  } catch {
    return `FILE: ${filePath} (CONVERTED)\nCODE_PREVIEW: ${code.slice(0, 200)}`;
  }
}
