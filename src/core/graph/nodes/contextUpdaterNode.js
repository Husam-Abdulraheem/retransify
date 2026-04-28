// src/core/graph/nodes/contextUpdaterNode.js
import path from 'path';
import { SyntaxKind, Node } from 'ts-morph';
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
  const { generatedCode, currentFile, vectorStore, contractRegistry } = state;

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

    // ── Update ContractRegistry with post-conversion signatures ───────────
    // The contracts from the analysis phase reflect the original *web* code.
    // Now that the file has been converted, we evict the stale contracts and
    // register the new ones so downstream files that import this one receive
    // the accurate, post-conversion function signatures in their prompts.
    if (
      contractRegistry &&
      typeof contractRegistry.registerFile === 'function'
    ) {
      try {
        const newContracts = extractContractsFromCode(generatedCode, filePath);
        contractRegistry.deleteFile(filePath);
        if (newContracts.length > 0) {
          contractRegistry.registerFile(filePath, newContracts);
        }
        printSubStep('ContractRegistry updated with native signatures');
      } catch (contractErr) {
        // Non-fatal: a failure here must never block the pipeline.
        printWarning(`ContractRegistry update failed: ${contractErr.message}`);
      }
    }

    return {};
  } catch (err) {
    printWarning(`Context updater failed: ${err.message}`);
    return {};
  }
}

// ── Contract Extraction from Generated Code ──────────────────────────────────

/**
 * Extracts FunctionContract objects from the freshly-generated React Native
 * code. Mirrors the logic in analyzerNode.extractFileContracts() but operates
 * on a temp file in the Expo ts-morph Project (so the compiler options match
 * the target environment, not the source web project).
 *
 * Covers the same four patterns:
 *   1. export function foo(params) {}
 *   2. export default function foo(params) {}
 *   3. export const foo = (params) => {}   (ArrowFunction)
 *   4. export const foo = function(params) {}  (FunctionExpression)
 *
 * @param {string} code - The generated React Native source code
 * @param {string} filePath - Project-relative path (used as temp file name)
 * @returns {import('../helpers/ContractRegistry.js').FunctionContract[]}
 */
function extractContractsFromCode(code, filePath) {
  let sourceFile = null;
  const tsProject = AstManager.getExpoProject();
  const tempFileName = `__contracts_${path.basename(filePath)}`;

  try {
    sourceFile = tsProject.createSourceFile(tempFileName, code, {
      overwrite: true,
    });

    const contracts = [];

    // ── 1. Named function declarations ────────────────────────────────────
    for (const fn of sourceFile.getFunctions()) {
      const name = fn.getName();
      if (!fn.isExported() && !name?.startsWith('use')) continue;
      if (!name) continue;

      contracts.push({
        name,
        kind: 'function',
        parameters: fn.getParameters().map(buildParamContract),
        returnType: fn.getReturnType().getText(),
        isDefault: false,
      });
    }

    // ── 2. Default export function ─────────────────────────────────────────
    for (const fn of sourceFile.getFunctions()) {
      if (fn.isDefaultExport()) {
        contracts.push({
          name: 'default',
          kind: 'function',
          parameters: fn.getParameters().map(buildParamContract),
          returnType: fn.getReturnType().getText(),
          isDefault: true,
        });
      }
    }

    // ── 3. Exported arrow / function expressions ───────────────────────────
    for (const varDecl of sourceFile.getVariableDeclarations()) {
      const init = varDecl.getInitializer();
      if (!init) continue;

      const kind = init.getKind();
      if (
        kind !== SyntaxKind.ArrowFunction &&
        kind !== SyntaxKind.FunctionExpression
      )
        continue;

      const name = varDecl.getName();
      if (!name) continue;

      const isExported = varDecl.isExported?.();
      const isHook = name.startsWith('use');
      if (!isExported && !isHook) continue;

      const params = init.getParameters ? init.getParameters() : [];
      const returnType = init.getReturnType
        ? init.getReturnType().getText()
        : 'unknown';

      contracts.push({
        name,
        kind: 'arrow',
        parameters: params.map(buildParamContract),
        returnType,
        isDefault: false,
      });
    }

    return contracts;
  } catch (err) {
    // Non-fatal: return empty array so caller can still register nothing
    return [];
  } finally {
    if (sourceFile) {
      try {
        tsProject.removeSourceFile(sourceFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Converts a ts-morph ParameterDeclaration to a ParameterContract.
 * Identical logic to analyzerNode.buildParameterContract() but inlined here
 * to keep contextUpdaterNode self-contained and avoid a circular import chain.
 *
 * @param {import('ts-morph').ParameterDeclaration} param
 * @returns {import('../helpers/ContractRegistry.js').ParameterContract}
 */
function buildParamContract(param) {
  const nameNode = param.getNameNode();
  const isDestructured =
    Node.isObjectBindingPattern(nameNode) ||
    (nameNode && nameNode.getKind() === SyntaxKind.ObjectBindingPattern);

  let destructuredKeys = [];
  let displayName = param.getName();

  if (isDestructured && Node.isObjectBindingPattern(nameNode)) {
    destructuredKeys = nameNode
      .getElements()
      .filter((el) => !Node.isBindingElement(el) || !el.getDotDotDotToken())
      .map((el) => {
        const propName = el.getPropertyNameNode();
        return propName ? propName.getText() : el.getName();
      })
      .filter(Boolean);
    displayName = `{ ${destructuredKeys.join(', ')} }`;
  }

  return {
    name: displayName,
    type: param.getType().getText(),
    isDestructured,
    destructuredKeys,
    isOptional: param.isOptional(),
    defaultValue: param.getInitializer()?.getText() ?? null,
  };
}

// ── Text Summary Extraction (for ContextStore) ───────────────────────────────

function extractSummaryFromCode(code, filePath) {
  let sourceFile = null;
  const tsProject = AstManager.getExpoProject();
  try {
    sourceFile = tsProject.createSourceFile(
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
  } finally {
    if (sourceFile) {
      try {
        tsProject.removeSourceFile(sourceFile);
      } catch (e) {
        console.error('Failed to remove source file:', e);
      }
    }
  }
}
