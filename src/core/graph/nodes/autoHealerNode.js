// src/core/graph/nodes/autoHealerNode.js
import { fixBrokenImports } from '../../utils/importHealer.js';
import { fixBrokenAssets } from '../../utils/assetHealer.js';
import { printStep, succeedSpinner } from '../../utils/ui.js';

/**
 * AutoHealerNode - Runs physical path corrections and asset link repairs.
 * This happens after all files are converted but before the final audit.
 */
export async function autoHealerNode(state) {
  const { targetProjectPath } = state;

  printStep(
    'Final Polish — Running Auto-Healer to resolve any broken paths...'
  );

  const importHealth = await fixBrokenImports(targetProjectPath);
  const assetHealth = await fixBrokenAssets(targetProjectPath);

  if (importHealth.healedCount > 0 || assetHealth.healedCount > 0) {
    succeedSpinner(
      `Successfully auto-healed ${importHealth.healedCount + assetHealth.healedCount} broken references.`
    );
  }

  // We return stats to the state so they can be reported by the reporterNode
  return {
    autoHealStats: {
      healedImports: importHealth.healedCount,
      healedAssets: assetHealth.healedCount,
    },
  };
}
