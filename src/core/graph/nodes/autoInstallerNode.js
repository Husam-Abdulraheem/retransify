import { execSync } from 'child_process';

export async function autoInstallerNode(state) {
  const {
    missingDependencies = [],
    installAttempts = 0,
    rnProjectPath,
    currentFile,
    errors = [],
    installedPackages = [],
  } = state;

  const filePath =
    currentFile?.relativeToProject || currentFile?.filePath || 'unknown';

  if (installAttempts >= 2) {
    console.warn(
      `🛑 [AutoInstaller] Circuit breaker activated for ${filePath}. Exceeded max attempts.`
    );
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
  console.log(
    `\n📦 [AutoInstaller] Dynamically installing via Expo: ${packagesToInstall}`
  );

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
      cwd: rnProjectPath || process.cwd(),
      stdio: 'inherit',
      env: cleanEnv, // Inject clean environment here
    });
    console.log(`✅ [AutoInstaller] Successfully installed dependencies.`);
    success = true;
  } catch {
    console.error(
      `❌ [AutoInstaller] Failed to install dependencies via Expo.`
    );
  }

  return {
    missingDependencies: [],
    installAttempts: installAttempts + 1,
    installedPackages: success
      ? [...new Set([...installedPackages, ...missingDependencies])]
      : installedPackages,
  };
}
