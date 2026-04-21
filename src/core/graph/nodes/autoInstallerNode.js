import { execSync } from 'child_process';
import { printSubStep, printWarning, printError } from '../../utils/ui.js';

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
    const newErrors = missingDependencies.map(
      (pkg) =>
        `Failed to auto-install package: '${pkg}'. It either does not exist, lacks TypeScript definitions, or is a hallucination. YOU MUST REMOVE OR REPLACE THIS IMPORT.`
    );
    return {
      missingDependencies: [],
      installAttempts: installAttempts + 1,
      errors: [...errors, ...newErrors],
    };
  }

  if (!missingDependencies || missingDependencies.length === 0) {
    return { installAttempts: installAttempts + 1, missingDependencies: [] };
  }

  const packagesToInstall = missingDependencies.join(' ');
  printSubStep(`Installing: ${packagesToInstall}...`, 1);

  // 🔥 Magic solution: clean environment variables from parent npm traces
  const cleanEnv = { ...process.env };
  Object.keys(cleanEnv).forEach((key) => {
    if (key.toLowerCase().startsWith('npm_')) {
      delete cleanEnv[key];
    }
  });

  let success = false;
  try {
    // 🔙 Strict fallback to expo tool to ensure version compatibility
    execSync(`npx expo install ${packagesToInstall}`, {
      cwd: targetProjectPath || process.cwd(),
      stdio: 'ignore', // silence expo/npm output
      env: cleanEnv,
    });
    printSubStep(`Installed successfully ✔`, 1, true);
    success = true;
  } catch {
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
