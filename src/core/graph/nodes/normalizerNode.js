// src/core/graph/nodes/normalizerNode.js
import fs from 'fs-extra';
import { executeModel } from '../../ai/modelExecutor.js';
import { printSubStep, printWarning } from '../../utils/ui.js';
import { resolveAbsolutePath } from '../../utils/pathUtils.js';

const NORMALIZER_SYSTEM_PROMPT = `
You are a strict React and TypeScript Code Normalizer.
Your ONLY task is to clean and normalize the provided React Web source code.

DO NOT convert this code to React Native. Keep it strictly as React Web code.
All DOM elements (div, span, img, etc.), routing libraries (react-router-dom), and
web-specific APIs must remain untouched.

NORMALIZATION RULES (apply ALL that are relevant):
1. GHOST PROPS ON STANDARD HTML ELEMENTS: Remove any non-standard/custom props passed to
   native HTML elements (e.g., remove 'isActive' or 'customData' from <div> or <span>).
2. LOCAL COMPONENT GHOST PROPS: Remove unused props from components defined WITHIN this file.
3. IMPORTED COMPONENTS — DO NOT TOUCH: NEVER remove or alter props passed to components
   imported from other files. Assume all their props are strictly required by the consumer.
4. DEAD IMPORTS: Remove import statements for identifiers that are never used in the file.
5. UNUSED VARIABLES: Remove 'const'/'let' declarations that are declared but never read.
6. FORCE TYPESCRIPT STRICTNESS: You MUST convert this component to strict TypeScript. You MUST generate an Interface for the component props. You MUST type all event handlers explicitly (e.g., e: React.ChangeEvent<HTMLInputElement>). NO implicit 'any' is allowed under any circumstances.
7. PRESERVE LOGIC: Do NOT alter any business logic, component structure, JSX tree, or state.

Return ONLY the raw normalized TypeScript/React code. No markdown fences, no explanation.
`.trim();

/**
 * NormalizerNode — Pre-transpilation code cleaner.
 *
 * Runs the fast model over the raw React Web source to eliminate common noise
 * (ghost props, dead imports, implicit any) before the main conversion pass.
 * This prevents "garbage-in → garbage-out" scenarios that exhaust heal attempts.
 *
 * Position in graph: FILE_PICKER → NORMALIZER → EXECUTOR
 *
 * Short-circuits (returns unchanged) for:
 *   - Virtual BOILERPLATE files (no source to clean)
 *   - Files with no content or empty content
 *   - Non-JSX/TSX files (CSS, JSON, assets — nothing for the normalizer to do)
 *
 * @param {import('../state.js').GraphState} state
 * @param {{ fastModel: object, smartModel: object }} models
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function normalizerNode(state, models = {}) {
  const { currentFile } = state;

  // ── Guard: nothing to normalize ────────────────────────────────────────────
  if (!currentFile) {
    return {};
  }

  // BOILERPLATE virtual files are pre-written templates — skip entirely
  if (currentFile.isVirtual && currentFile.blueprintType === 'BOILERPLATE') {
    return {};
  }

  // Load content from disk if not already in state (mirrors executorNode pattern)
  if (!currentFile.content && !currentFile.isVirtual) {
    const absolutePath = resolveAbsolutePath(currentFile, state.projectPath);
    try {
      currentFile.content = await fs.readFile(absolutePath, 'utf-8');
    } catch (err) {
      printWarning(`NormalizerNode: could not read file — ${err.message}`);
      return {};
    }
  }

  const content = currentFile.content?.trim();

  if (!content || content.length < 20) {
    return {}; // Nothing meaningful to normalize
  }

  // Only normalize JSX/TSX/JS/TS source files — skip assets, CSS, JSON, etc.
  const filePath = currentFile.relativeToProject || currentFile.filePath || '';
  if (!/\.(jsx?|tsx?)$/i.test(filePath)) {
    return {};
  }

  printSubStep('Normalizing source code...');

  const prompt = `${NORMALIZER_SYSTEM_PROMPT}\n\n---\n${content}`;

  try {
    // Use fastModel only — normalization is cheap and deterministic.
    // Pass schema=null so executeModel returns a raw string.
    const fastOnlyModels = {
      smartModel: models.fastModel,
      fastModel: models.fastModel,
    };
    const rawResponse = await executeModel(prompt, fastOnlyModels, null, {
      spinnerMessage: 'Normalizing code...',
      filePath,
    });

    // executeModel returns the LangChain AIMessage when no schema is provided;
    // extract the text content robustly.
    let normalizedCode =
      typeof rawResponse === 'string'
        ? rawResponse
        : (rawResponse?.content ?? rawResponse?.text ?? '');

    // Strip accidental markdown fences the model may emit despite instructions
    const fenceMatch = normalizedCode.match(
      /```(?:typescript|tsx|javascript|jsx)?\n?([\s\S]*?)```/
    );
    if (fenceMatch) {
      normalizedCode = fenceMatch[1];
    }

    normalizedCode = normalizedCode.trim();

    if (!normalizedCode || normalizedCode.length < 20) {
      printWarning(
        `NormalizerNode: model returned empty content for ${filePath} — keeping original`
      );
      return {};
    }

    printSubStep('Normalization complete ✔');

    return {
      currentFile: {
        ...currentFile,
        content: normalizedCode,
      },
    };
  } catch (err) {
    // Non-fatal: if normalization fails for any reason, the pipeline continues
    // with the original content. This node must NEVER block transpilation.
    printWarning(`NormalizerNode: skipped due to error — ${err.message}`);
    return {};
  }
}
