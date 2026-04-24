import { runSilentCommand } from '../../helpers/shell.js';
import {
  printSubStep,
  printWarning,
  printError,
  startSubSpinner,
  stopSpinner,
} from '../../utils/ui.js';

export async function autoInstallerNode(state) {
  const {
    missingDependencies = [],
    installAttempts = 0,
    targetProjectPath,
    currentFile,
    errors = [],
    installedPackages = [],
  } = state;

  const filePath =
    currentFile?.relativeToProject || currentFile?.filePath || 'unknown';

  if (installAttempts >= 2) {
    printWarning(`Auto-installer circuit breaker activated for ${filePath}`);

    // سجل المكتبات الفاشلة للتقرير النهائي
    const unresolvedErrors = missingDependencies.map((pkg) => ({
      filePath,
      reason: `Failed to auto-install package: '${pkg}'`,
      codeSnippet: `import ... from '${pkg}';`,
      suggestedAction: `This package name might be a hallucination or lacks native support. Please check the correct package name or find a React Native alternative (e.g., use @react-native-async-storage/async-storage instead of @react--native...).`,
    }));

    return {
      missingDependencies: [],
      failedDependencies: missingDependencies,
      installAttempts: installAttempts + 1,
      unresolvedErrors,
    };
  }

  if (!missingDependencies || missingDependencies.length === 0) {
    return { installAttempts: installAttempts + 1, missingDependencies: [] };
  }

  const packagesToInstall = missingDependencies.join(' ');

  // ── 1. Start UI Feedback ───────────────────────────────────────────
  startSubSpinner(`Installing: ${packagesToInstall}...`);

  let success = false;
  try {
    // 🔙 Strict fallback to expo tool to ensure version compatibility
    await runSilentCommand(
      `npx expo install ${packagesToInstall}`,
      targetProjectPath || process.cwd()
    );

    stopSpinner();
    printSubStep(`Installed successfully ✔`, 1, true);
    success = true;
  } catch {
    stopSpinner();
    printError('Auto-installer: expo install failed');
  }

  return {
    missingDependencies: [],
    installAttempts: installAttempts + 1,
    installedPackages: success
      ? [...new Set([...installedPackages, ...missingDependencies])]
      : installedPackages,
  };
}
