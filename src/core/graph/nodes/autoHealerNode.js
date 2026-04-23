// src/core/graph/nodes/autoHealerNode.js
import { fixBrokenImports } from '../../utils/importHealer.js';
import { fixBrokenAssets } from '../../utils/assetHealer.js';
import { fixStyleImports } from '../../utils/styleHealer.js';
import { printStep, succeedSpinner } from '../../utils/ui.js';

/**
 * AutoHealerNode - Runs physical path corrections and asset link repairs.
 * This happens after all files are converted but before the final audit.
 */
export async function autoHealerNode(state) {
  const { targetProjectPath, facts } = state;

  printStep(
    'Final Polish — Running Auto-Healer to resolve any broken paths...'
  );

  const importHealth = await fixBrokenImports(targetProjectPath);
  const assetHealth = await fixBrokenAssets(targetProjectPath);
  const styleHealth = await fixStyleImports(
    targetProjectPath,
    facts?.tech?.styling
  );

  if (
    importHealth.healedCount > 0 ||
    assetHealth.healedCount > 0 ||
    styleHealth.healed
  ) {
    const total =
      importHealth.healedCount +
      assetHealth.healedCount +
      (styleHealth.healed ? 1 : 0);
    succeedSpinner(`Successfully auto-healed ${total} broken references.`);
  }

  // We return stats to the state so they can be reported by the reporterNode
  return {
    autoHealStats: {
      healedImports: importHealth.healedCount,
      healedAssets: assetHealth.healedCount,
    },
  };
}
