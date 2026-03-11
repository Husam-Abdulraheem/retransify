// src/core/graph/nodes/executorNode.js
import path from 'path';
import { buildPrompt } from '../../prompt/promptBuilder.js';
import { cleanAIResponse } from '../../helpers/cleanAIResponse.js';

/**
 * ExecutorNode - Converts the current file using smartModel + RAG
 *
 * Inputs from state:
 * - state.currentFile: Current file object (with resolvedDeps from DependencyResolverNode)
 * - state.vectorStore: MemoryVectorStore instance
 * - state.pathMap: Path map
 * - state.facts: Project information
 * - state.installedPackages
 *
 * Outputs to state:
 * - state.generatedCode: Converted code (not written to disk here)
 * - state.generatedDependencies: Dependencies suggested by AI
 *
 * @param {import('../state.js').GraphState} state
 * @param {{ smartModel: Session }} models
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function executorNode(state, models = {}) {
  const {
    currentFile,
    vectorStore,
    pathMap,
    facts,
    installedPackages = [],
  } = state;

  if (!currentFile) {
    console.warn('⚠️  [ExecutorNode] No current file found');
    return { generatedCode: null, generatedDependencies: [] };
  }

  const filePath = currentFile.relativeToProject || currentFile.filePath;
  console.log(`\n⚙️  [ExecutorNode] Converting: ${filePath}`);

  // ── 1. Retrieve similar context from VectorStore (RAG) ────────
  let ragContext = '';
  if (vectorStore && currentFile.content) {
    try {
      // Retrieve top 3 similar files to help AI understand project pattern
      const similarDocs = await vectorStore.similaritySearch(
        currentFile.content.slice(0, 500), // First 500 chars for search
        3
      );

      if (similarDocs.length > 0) {
        ragContext = similarDocs
          .filter((doc) => doc.metadata.filePath !== filePath) // Exclude the file itself
          .map((doc) => `--- ${doc.metadata.filePath} ---\n${doc.pageContent}`)
          .join('\n\n');

        if (ragContext) {
          console.log(
            `🔍 [ExecutorNode] RAG: Retrieved ${similarDocs.length} similar files`
          );
        }
      }
    } catch (err) {
      console.warn(`⚠️  [ExecutorNode] RAG Failed: ${err.message}`);
    }
  }

  // ── 2. Build file context for Prompt ──────────────────────────
  const fileContext = buildFileContext(
    currentFile,
    pathMap,
    facts,
    installedPackages,
    ragContext
  );

  // ── 3. Build Prompt ───────────────────────────────────────────
  const prompt = buildPrompt(fileContext);

  const model = models.smartModel;
  if (!model) {
    console.error('❌ [ExecutorNode] No smartModel found');
    return { generatedCode: null, generatedDependencies: [] };
  }

  try {
    console.log('🤖 [ExecutorNode] Sending to AI...');
    const response = await model.sendMessage(prompt);

    // Attempt to parse response as JSON
    const parsed = parseAIResponse(response);
    const generatedCode = parsed.code;
    const generatedDependencies = parsed.dependencies || [];

    if (!generatedCode) {
      console.warn('⚠️  [ExecutorNode] AI did not produce valid code');
      return { generatedCode: null, generatedDependencies: [] };
    }

    console.log(`✅ [ExecutorNode] Generated ${generatedCode.length} chars`);

    if (generatedDependencies.length > 0) {
      console.log(
        `📦 [ExecutorNode] Suggested dependencies: ${generatedDependencies.join(', ')}`
      );
    }

    // Note: We don't write to disk here - that's DiskWriterNode's job
    return {
      generatedCode,
      generatedDependencies,
      errors: [], // Reset errors before Verifier
    };
  } catch (err) {
    console.error(`❌ [ExecutorNode] Error: ${err.message}`);
    return { generatedCode: null, generatedDependencies: [] };
  }
}

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Builds full file context object for buildPrompt()
 * Maintains same fileContext structure as previously built by contextBuilder.js
 */
function buildFileContext(
  currentFile,
  pathMap,
  facts,
  installedPackages,
  ragContext
) {
  const filePath = currentFile.relativeToProject || currentFile.filePath;
  const baseName = path.basename(filePath);

  // Determine if it's main App file
  let isMainEntry = false;
  if (/^App\.(tsx|jsx|js|ts)$/i.test(baseName)) {
    isMainEntry = true;
  } else if (
    facts.mainEntryPoint &&
    (filePath === facts.mainEntryPoint ||
      filePath.endsWith(path.basename(facts.mainEntryPoint)))
  ) {
    isMainEntry = true;
  }

  return {
    // Basic file information
    filePath,
    content: currentFile.content || '',
    imports: currentFile.imports || [],
    exports: currentFile.exports || [],
    components: currentFile.components || [],
    hooks: currentFile.hooks || [],
    hasJSX: currentFile.hasJSX || false,

    // Project information
    globalContext: {
      facts: facts,
      decisions: { pathMap },
    },
    pathMap,
    installedPackages,

    // RAG Context (New)
    ragContext,

    // Resolved dependencies (from DependencyResolverNode)
    resolvedDeps: currentFile.resolvedDeps || {},

    // Main App file flag
    isMainEntry,

    // Destination path
    targetPath: pathMap[filePath] || filePath,
  };
}

/**
 * Attempts to parse AI response as JSON
 * Same logic as original aiClient.js
 */
function parseAIResponse(aiResponse) {
  if (!aiResponse) return { code: '', dependencies: [] };

  // Attempt 1: Direct JSON
  try {
    return JSON.parse(aiResponse);
  } catch {
    /* Continue */
  }

  // Attempt 2: JSON in markdown
  const jsonMatch = aiResponse.match(/```json([\s\S]*?)```/i);
  const genericMatch = aiResponse.match(/```([\s\S]*?)```/);
  const candidate = jsonMatch?.[1] || genericMatch?.[1];

  if (candidate) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* Continue */
    }
  }

  // Attempt 3: regex
  const codeMatch = aiResponse.match(
    /"code"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"dependencies"|\s*})/
  );
  if (codeMatch?.[1]) {
    const depMatch = aiResponse.match(/"dependencies"\s*:\s*\[([\s\S]*?)\]/);
    return {
      code: codeMatch[1],
      dependencies: depMatch?.[1]
        ? depMatch[1]
            .split(',')
            .map((d) => d.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean)
        : [],
    };
  }

  // Attempt 4: Substring
  const start = aiResponse.indexOf('{');
  const end = aiResponse.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try {
      return JSON.parse(aiResponse.substring(start, end + 1));
    } catch {
      /* Continue */
    }
  }

  // Fallback: raw code
  return {
    code: cleanAIResponse(aiResponse),
    dependencies: [],
  };
}
