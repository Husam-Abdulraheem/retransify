import path from "path";
import fs from "fs-extra";

const DEFAULT_PROJECT_PATH = path.join(process.cwd(), "converted-expo-app");

// ---------------------------------------------------------
// دوال كتابة الملفات المُحوّلة (File Writers)
// ---------------------------------------------------------

export async function writeConvertedFile(rnProjectPath, relativePath, code) {
  try {
    const destPath = path.join(rnProjectPath, relativePath);
    await fs.ensureDir(path.dirname(destPath));
    await fs.writeFile(destPath, code, "utf-8");
    console.log(`📁 File written: ${relativePath}`);
  } catch (err) {
    console.error(`❌ Failed to write file ${relativePath}:`, err.message);
  }
}

/**
 * Saves a converted file to the default Expo project directory.
 * This adapter supports the Executor's expected signature.
 */
export async function saveConvertedFile(destPath, code, sdkVersion, dependencyManager) {
  // Note: sdkVersion and dependencyManager are currently unused in the writer itself,
  // but kept for signature compatibility with Executor.
  await writeConvertedFile(DEFAULT_PROJECT_PATH, destPath, code);
}
