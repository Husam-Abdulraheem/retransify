// src/core/graph/nodes/retryNode.js
import { printWarning } from '../../utils/ui.js';

/**
 * RetryNode - Handles transient API errors (503/429) by waiting before retrying the same file.
 *
 * Key design decision: This node does NOT change currentFile or filesQueue.
 * The same file will re-enter ExecutorNode after the delay, preserving processing order.
 *
 * The decision to retry vs. abort is made by the `afterRetry` conditional edge in workflow.js
 * (NOT inside this node), so the node only performs the wait and increments the counter.
 *
 * @param {import('../state.js').GraphState} state
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function retryNode(state) {
  const { currentFile, retryCount = 0 } = state;
  const filePath =
    currentFile?.relativeToProject || currentFile?.filePath || 'unknown';

  const delayMs = Math.min(30_000 * Math.pow(2, retryCount), 300_000); // 30s → 60s → 120s → 300s max
  printWarning(
    `[Retry ${retryCount + 1}] Waiting ${delayMs / 1000}s before retrying: ${filePath}`
  );

  await new Promise((r) => setTimeout(r, delayMs));

  return {
    // currentFile stays unchanged → same file re-enters ExecutorNode
    retryCount: retryCount + 1,
    errors: [], // clear TRANSIENT: flag so ExecutorNode runs cleanly
    generatedCode: null,
  };
}
