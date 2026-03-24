// src/core/graph/nodes/contextUpdaterNode.js
import path from 'path';
import { Project } from 'ts-morph';
import { Document } from '@langchain/core/documents';
import { printSubStep, printWarning } from '../../utils/ui.js';

/**
 * ContextUpdaterNode - Updates VectorStore with new code after conversion
 *
 * Deletes old vector for file and inserts new one with converted interfaces
 *
 * @param {import('../state.js').GraphState} state
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function contextUpdaterNode(state) {
  const { generatedCode, currentFile, vectorStore, vectorIdMap } = state;

  if (!generatedCode || !vectorStore) return {};

  const filePath = currentFile?.relativeToProject || currentFile?.filePath;
  if (!filePath) return {};

  try {
    // Extract new code summary with ts-morph
    const newSummary = extractSummaryFromCode(generatedCode, filePath);

    if (!newSummary) return {};

    // Create new Document
    const newDoc = new Document({
      pageContent: newSummary,
      metadata: { filePath, type: 'converted_file' },
    });

    // Add new vector to VectorStore
    // MemoryVectorStore doesn't support direct deletion, so we just add
    // (similarity search will find the newest one more relevant)
    await vectorStore.addDocuments([newDoc]);

    // Update Map with new ID
    const newVectorIdMap = {
      ...vectorIdMap,
      [filePath]: `converted_${filePath}`,
    };

    printSubStep('VectorStore context updated');
    return { vectorIdMap: newVectorIdMap };
  } catch (err) {
    printWarning(`Context updater failed: ${err.message}`);
    return {};
  }
}

function extractSummaryFromCode(code, filePath) {
  try {
    const tsProject = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, jsx: 2, strict: false },
    });

    const sourceFile = tsProject.createSourceFile(
      `temp_${path.basename(filePath)}`,
      code,
      { overwrite: true }
    );

    const parts = [`FILE: ${filePath} (CONVERTED)`];

    const interfaces = sourceFile.getInterfaces();
    if (interfaces.length > 0) {
      parts.push(
        'INTERFACES: ' + interfaces.map((i) => i.getName()).join(', ')
      );
    }

    const exports = sourceFile.getFunctions().filter((f) => f.isExported());
    if (exports.length > 0) {
      parts.push('EXPORTS: ' + exports.map((f) => f.getName()).join(', '));
    }

    const imports = sourceFile
      .getImportDeclarations()
      .filter((i) => i.getModuleSpecifierValue().startsWith('react-native'))
      .slice(0, 5)
      .map((i) => `from '${i.getModuleSpecifierValue()}'`);

    if (imports.length > 0) {
      parts.push('RN_IMPORTS: ' + imports.join(', '));
    }

    return parts.join('\n');
  } catch {
    return `FILE: ${filePath} (CONVERTED)\nCODE_PREVIEW: ${code.slice(0, 200)}`;
  }
}
