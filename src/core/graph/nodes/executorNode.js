// src/core/graph/nodes/executorNode.js
import fs from 'fs-extra';
import path from 'path';
import { buildPrompt } from '../../prompt/promptBuilder.js';
import { PathMapper } from '../../helpers/pathMapper.js';
import { z } from 'zod';
import {
  printSubStep,
  printWarning,
  printError,
  startSubSpinner,
  stopSpinner,
} from '../../utils/ui.js';

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
    pathMap,
    facts,
    installedPackages = [],
    navigationSchema = { type: 'stack' },
    routeMetadata = {},
    globalProviders = [],
  } = state;

  if (!currentFile) {
    printWarning('ExecutorNode: no current file');
    return { generatedCode: null };
  }

  const filePath = currentFile.relativeToProject || currentFile.filePath;
  printSubStep('Converting file via AI...');

  // 🚨 SHORT-CIRCUIT: Virtual files have pre-set content — skip disk I/O
  if (!currentFile.isVirtual) {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(state.facts?.projectPath || process.cwd(), filePath);

    try {
      currentFile.content = await fs.readFile(absolutePath, 'utf-8');
    } catch (err) {
      printError(`Failed to read ${absolutePath}: ${err.message}`);
    }

    if (!currentFile.content || currentFile.content.trim() === '') {
      printWarning(`Empty file, skipping AI: ${filePath}`);
      return { generatedCode: '// Empty file' };
    }
  } else {
    printSubStep(`[VIRTUAL] Using injected content for: ${filePath}`);
    if (!currentFile.content || currentFile.content.trim() === '') {
      printWarning(`Virtual file has no content, skipping: ${filePath}`);
      return { generatedCode: '// Empty virtual file' };
    }
  }

  // ── 1. Retrieve similar context from VectorStore (RAG) ────────
  let ragContext = '';
  if (vectorStore && currentFile.content) {
    try {
      // Remove imports to ensure the vector search focuses on component logic
      const logicOnlyContent = currentFile.content
        .replace(/^import\s+.*?;?\s*$/gm, '')
        .trim();
      const searchQuery =
        logicOnlyContent.slice(0, 800) || currentFile.content.slice(0, 500);

      const similarDocs = await vectorStore.similaritySearch(searchQuery, 3);

      if (similarDocs.length > 0) {
        ragContext = similarDocs
          .filter((doc) => doc.metadata.filePath !== filePath)
          .map((doc) => `--- ${doc.metadata.filePath} ---\n${doc.pageContent}`)
          .join('\n\n');

        if (ragContext) {
          printSubStep(`RAG: ${similarDocs.length} context files retrieved`);
        }
      }
    } catch (err) {
      printWarning(`RAG failed: ${err.message}`);
    }
  }

  // ── 2. Build file context for Prompt ──────────────────────────
  const exactImportsMap = PathMapper.calculateExactImports(
    filePath,
    currentFile.content,
    pathMap
  );
  const fileContext = buildFileContext(
    currentFile,
    pathMap,
    facts,
    installedPackages,
    ragContext,
    exactImportsMap,
    navigationSchema,
    routeMetadata[filePath] || {},
    globalProviders
  );

  // ── 3. Build Prompt ───────────────────────────────────────────
  const prompt = buildPrompt(fileContext);

  if (!models.smartModel) {
    printError('No smartModel found in ExecutorNode');
    return { generatedCode: null };
  }

  // ── Robust AI Invocation ───────────────────────────────────────────
  try {
    startSubSpinner('AI: Generating native code...');

    const fallbackModel = models.fastModel.withStructuredOutput(outputSchema);
    const primaryModel = models.smartModel.withStructuredOutput(outputSchema);
    const model = primaryModel.withFallbacks({ fallbacks: [fallbackModel] });

    const response = await model.invoke(prompt);

    stopSpinner();
    let generatedCode = response.code;

    if (!generatedCode) {
      throw new Error('AI returned empty code block');
    }

    // Defensive regex to strip markdown blocks leaked into the JSON string value
    generatedCode = generatedCode
      .replace(/^```[a-z]*\n?/im, '')
      .replace(/```$/im, '')
      .trim();

    printSubStep(`AI Generated: ${generatedCode.length} chars ✔`);

    return {
      generatedCode,
      errors: [],
    };
  } catch (err) {
    stopSpinner();

    const isTransient =
      err.message?.includes('503') ||
      err.message?.includes('529') ||
      err.message?.includes('429') ||
      err.message?.includes('Too Many Requests') ||
      err.message?.includes('Service Unavailable') ||
      err.message?.includes('overloaded');

    if (isTransient) {
      printWarning(
        `Transient API error for ${filePath}, will retry: ${err.message}`
      );
      return {
        generatedCode: null,
        errors: [`TRANSIENT:${err.message}`],
      };
    }

    printError(`Failed permanently: ${filePath} - ${err.message}`);
    return {
      generatedCode: null,
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
  exactImportsMap,
  navigationSchema,
  fileMetadata = {},
  globalProviders = []
) {
  const filePath = currentFile.relativeToProject || currentFile.filePath;
  const baseName = path.basename(filePath);

  let isMainEntry = false;
  if (/^App\.(tsx|jsx|js|ts)$/i.test(baseName)) {
    isMainEntry = true;
  } else if (facts.mainEntryPoint) {
    const mainBaseName = path.basename(facts.mainEntryPoint);
    const mainRelative = facts.projectPath
      ? path
          .relative(facts.projectPath, facts.mainEntryPoint)
          .replace(/\\/g, '/')
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
    },
    pathMap,
    exactImportsMap,
    installedPackages,
    ragContext,
    resolvedDeps: currentFile.resolvedDeps || {},
    isMainEntry,
    targetPath: pathMap[filePath] || filePath,
    isLayoutFile:
      (pathMap[filePath] && pathMap[filePath].endsWith('_layout.tsx')) || false,
    navigationSchema,
    requiredData: fileMetadata.requiredData || [],
  };
}
