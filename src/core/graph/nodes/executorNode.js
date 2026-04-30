// src/core/graph/nodes/executorNode.js
import fs from 'fs-extra';
import path from 'path';
import { buildPrompt } from '../../prompt/promptBuilder.js';
import { PathMapper } from '../../helpers/pathMapper.js';
import { optimizeFileContext } from '../../helpers/contextOptimizer.js';
import { z } from 'zod';
import { printSubStep, printWarning, printError } from '../../utils/ui.js';
import { normalizePath, resolveAbsolutePath } from '../../utils/pathUtils.js';
import { executeModel } from '../../ai/modelExecutor.js';

// Define the expected output structure
const outputSchema = z.object({
  code: z
    .string()
    .describe(
      'The complete converted React Native code. You MUST format this code legibly with proper newlines and indentation. DO NOT minify.'
    ),
});

/**
 * ExecutorNode - Converts the current file using smartModel + RAG
 *
 * @param {import('../state.js').GraphState} state
 * @param {{ smartModel: Session, fastModel: Session }} models
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function executorNode(state, models = {}) {
  const {
    currentFile,
    vectorStore,
    contractRegistry,
    pathMap,
    facts,
    installedPackages = [],
    navigationSchema = { type: 'stack' },
    routeMetadata = {},
    globalProviders = [],
    globalHeader = null,
    homeResolution = null,
  } = state;

  if (!currentFile) {
    printWarning('ExecutorNode: no current file');
    return { generatedCode: null };
  }

  const filePath = currentFile.relativeToProject || currentFile.filePath;
  printSubStep('AI Transpilation...');

  // 🚨 SHORT-CIRCUIT: Bypass AI for BOILERPLATE templates. SKELETON templates go to AI.
  if (currentFile.isVirtual && currentFile.blueprintType === 'BOILERPLATE') {
    printSubStep(`[Blueprint] Bypassing AI for BOILERPLATE file: ${filePath}`);
    return { generatedCode: currentFile.content || '// Empty boilerplate' };
  }

  if (!currentFile.isVirtual) {
    const absolutePath = resolveAbsolutePath(currentFile, state.projectPath);
    try {
      currentFile.content = await fs.readFile(absolutePath, 'utf-8');
    } catch (err) {
      printError(`Failed to read ${absolutePath}: ${err.message}`);
    }

    if (!currentFile.content || currentFile.content.trim() === '') {
      printWarning(`Empty file, skipping AI: ${filePath}`);
      return { generatedCode: '// Empty file' };
    }
  }

  // ── 1. Deterministic JIT Context from ContextStore + ContractRegistry ──────
  // Uses ts-morph to extract local imports from the current file, then fetches:
  //   a) Lossy text summaries from ContextStore (narrative context for the LLM)
  //   b) Precise structured signatures from ContractRegistry (exact call contracts)
  // Both resolve from the same localPaths set in a single parse pass.
  let ragContext = '';
  let contractContext = '';
  if (currentFile.content) {
    try {
      const localPaths = await PathMapper.resolveLocalImports(
        currentFile.content,
        filePath,
        facts.pathAliases || {}
      );

      if (localPaths.length > 0) {
        // a) Text summaries from ContextStore
        if (vectorStore) {
          const contextDocs = vectorStore.getDocumentsByPaths(localPaths);
          ragContext = contextDocs
            .map(
              (doc) => `--- ${doc.metadata.filePath} ---\n${doc.pageContent}`
            )
            .join('\n\n');
        }

        // b) Structured signatures from ContractRegistry
        if (contractRegistry) {
          contractContext = contractRegistry.toPromptContext(localPaths);
        }

        if (ragContext || contractContext) {
          printSubStep(`JIT Context: ${localPaths.length} local dependencies`);
        }
      }
    } catch (err) {
      printWarning(`Context retrieval failed: ${err.message}`);
    }
  }

  // ── 2. Context Optimization — Safe Filtering ─────────────────
  const { relevantPaths, relevantAssets } = optimizeFileContext(
    state,
    currentFile
  );

  // ── 3. Build file context for Prompt ──────────────────────────
  const exactImportsMap = PathMapper.calculateExactImports(
    filePath,
    currentFile.content,
    pathMap,
    facts.pathAliases || {}
  );

  const metadataKey = currentFile.relativeToProject || currentFile.filePath; // original key
  const currentRouteMeta = (metadataKey && routeMetadata[metadataKey]) || {};

  const fileContext = buildFileContext(
    currentFile,
    relevantPaths,
    facts,
    installedPackages,
    ragContext,
    contractContext,
    exactImportsMap,
    navigationSchema,
    currentRouteMeta,
    globalProviders,
    globalHeader,
    homeResolution,
    relevantAssets
  );

  // ── 4. Build Prompt ───────────────────────────────────────────
  const prompt = buildPrompt(fileContext);

  // ── Robust AI Invocation ───────────────────────────────────────────
  try {
    const response = await executeModel(prompt, models, outputSchema, {
      spinnerMessage: 'AI: Generating native code...',
      filePath,
    });

    if (!response || !response.code) {
      throw new Error('AI returned empty code block');
    }

    // Defensive regex to strip markdown blocks leaked into the JSON string value
    let generatedCode = response.code
      .replace(/^```[a-z]*\n?/im, '')
      .replace(/```$/im, '')
      .trim();

    printSubStep(`AI Generation complete ✔`);

    return {
      generatedCode,
      errors: [],
    };
  } catch (err) {
    if (err.message?.startsWith('TRANSIENT:')) {
      return {
        generatedCode: null,
        errors: [err.message],
      };
    }

    printError(`Failed permanently: ${filePath} - ${err.message}`);
    return {
      generatedCode: currentFile.content || '// Conversion failed',
      errors: [`AI Conversion failed: ${err.message}`],
    };
  }
}

// ── Helper Functions ─────────────────────────────────────────────────────────

function buildFileContext(
  currentFile,
  pathMap,
  facts,
  installedPackages,
  ragContext,
  contractContext,
  exactImportsMap,
  navigationSchema,
  fileMetadata = {},
  globalProviders = [],
  globalHeader = null,
  homeResolution = null,
  availableAssets = []
) {
  const filePath = currentFile.relativeToProject || currentFile.filePath;
  const baseName = path.basename(filePath);

  let isMainEntry = false;
  if (/^App\.(tsx|jsx|js|ts)$/i.test(baseName)) {
    isMainEntry = true;
  } else if (facts.mainEntryPoint) {
    const mainBaseName = path.basename(facts.mainEntryPoint);
    const mainRelative = facts.projectPath
      ? normalizePath(path.relative(facts.projectPath, facts.mainEntryPoint))
      : null;

    if (filePath === mainRelative || baseName === mainBaseName) {
      isMainEntry = true;
    }
  }

  return {
    filePath,
    content: currentFile.content || '',
    imports: currentFile.imports || [],
    exports: currentFile.exports || [],
    components: currentFile.components || [],
    hooks: currentFile.hooks || [],
    hasJSX: currentFile.hasJSX || false,
    globalContext: {
      facts: facts,
      decisions: { pathMap },
      globalProviders: globalProviders || [],
      globalHeader: globalHeader,
    },
    pathMap,
    availableAssets,
    exactImportsMap,
    installedPackages,
    ragContext,
    contractContext,
    resolvedDeps: currentFile.resolvedDeps || {},
    isMainEntry,
    targetPath: pathMap[filePath] || filePath,
    isLayoutFile:
      (pathMap[filePath] && pathMap[filePath].endsWith('_layout.tsx')) || false,
    navigationSchema,
    requiredData: fileMetadata.requiredData || [],
    homeComponentName: homeResolution?.homeComponentName || null,
  };
}
