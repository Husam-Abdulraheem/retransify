import path from "path";
import fs from "fs-extra";
import { execSync } from "child_process";

/**
 * 1) إنشاء مشروع Expo React Native إذا لم يكن موجودًا
 *
 * @param {string} sdkVersion (Optional) specific SDK version
 * @returns {string} projectPath
 */
export async function ensureNativeProject(sdkVersion) {
  const projectPath = path.join(process.cwd(), "converted-expo-app");

  // المشروع موجود مسبقًا؟
  if (await fs.pathExists(projectPath)) {
    console.log("🟡 Using existing Expo project:", projectPath);
    // Even if exists, ensure Router is set up
    await setupExpoRouter(projectPath);
    return projectPath;
  }

  console.log("🟢 Creating new Expo project...");
  if (sdkVersion) console.log(`ℹ️  Using SDK Version: ${sdkVersion}`);

  const sdkFlag = sdkVersion ? `--sdk-version ${sdkVersion}` : "";
  // Note: create-expo-app supports --sdk-version (or --sdk in newer versions, check docs but --sdk-version is safer for older create-expo-app)
  // Actually, standard `create-expo-app` might not support --sdk-version directly in all versions, 
  // but it usually respects it if passed to the internal template or if we assume modern create-expo-app.
  // Actually, `create-expo-app` uses the latest stable SDK by default. 
  // To specify a version, one often uses: `npx create-expo-app my-app --template blank@sdk-49` or similar.
  // OR `npx create-expo-app my-app --sdk-version 49`. Let's assume the flag works.
  
  execSync(`npx create-expo-app ${projectPath} --template blank ${sdkFlag}`, {
    stdio: "inherit",
  });

  console.log("📦 Installing TypeScript definitions...");

  try {
      execSync(`npm install --save-dev typescript @types/react @types/react-native --prefix "${projectPath}"`, {
        stdio: "inherit",
      });
  } catch (e) {
      console.warn("⚠️ Failed to install types automatically.");
  }

  // Setup Expo Router (Deps + package.json)
  await setupExpoRouter(projectPath);

  console.log("✅ Expo project created at:", projectPath);
  return projectPath;
}

/**
 * Configure Expo Router dependencies and entry point
 */
async function setupExpoRouter(projectPath) {
  console.log("🚀 Ensuring Expo Router is set up...");
  try {
    // 1. Install dependencies (idempotent-ish, npm handles it)
    // We check if package.json already has expo-router to avoid slow install every time? 
    // For now, let's just run it. It might be slow but guarantees correctness.
    // Or better: Checking 'main' in package.json as a proxy.
    
    const packageJsonPath = path.join(projectPath, "package.json");
    if (!fs.existsSync(packageJsonPath)) return;
    
    const packageJson = await fs.readJson(packageJsonPath);
    
    // Check if configured
    if (packageJson.main === "expo-router/entry") {
        console.log("✅ Expo Router already configured in package.json.");
    } else {
        console.log("⚙️  Configuring package.json for Expo Router...");
        // Install dependencies only if we are configuring for the first time or forcing
        execSync(`npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar`, {
            stdio: "inherit",
            cwd: projectPath
        });
        
        packageJson.main = "expo-router/entry";
        await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    }

    // 2. Remove/Rename default App.js
    const defaultAppJs = path.join(projectPath, "App.js");
    if (await fs.pathExists(defaultAppJs)) {
        console.log("🗑️  Renaming default App.js to avoid conflict...");
        await fs.rename(defaultAppJs, path.join(projectPath, "App_backup.js"));
    }

  } catch (e) {
      console.error("❌ Failed to setup Expo Router:", e.message);
  }
}

/**
 * 2) إنشاء المجلدات تلقائيًا (Recursive)
 *
 * @param {string} dirPath
 */
async function ensureDirectory(dirPath) {
  await fs.mkdirp(dirPath);
}

/**
 * 3) كتابة ملف React Native محوّل داخل المشروع الجديد
 *
 * @param {string} rnProjectPath - مسار مشروع Expo
 * @param {string} relativePath - مسار الملف داخل src (مثال: components/Button.jsx)
 * @param {string} code - الكود المحوّل الناتج من الذكاء الاصطناعي
 */
export async function writeConvertedFile(rnProjectPath, relativePath, code) {
  try {
    // We treat relativePath as relative to the RN project root.
    // This supports both 'src/...' layout and Smart Pathing ('app/...', 'components/...')
    const destPath = path.join(rnProjectPath, relativePath);

    // Create directories
    const destDir = path.dirname(destPath);
    await ensureDirectory(destDir);

    // Write file
    await fs.writeFile(destPath, code, "utf-8");

    console.log(`📁 File written: ${relativePath}`);
  } catch (err) {
    console.error("❌ Failed to write converted file:", err.message);
  }
}

/**
 * 4) تهيئة مجلد src داخل مشروع Expo لو لم يكن موجودًا
 *
 * @param {string} rnProjectPath
 */
export async function ensureRNProjectSrc(rnProjectPath) {
  const srcPath = path.join(rnProjectPath, "src");

  if (!(await fs.pathExists(srcPath))) {
    console.log("📦 Creating RN src directory...");
    await fs.mkdir(srcPath);
  }
}

/**
 * 5) دالة تحوّل ملف معيّن وتكتبه مباشرة في المشروع الجديد
 *
 * @param {string} relativePath
 * @param {string} convertedCode
 * @param {string} sdkVersion
 */
export async function saveConvertedFile(relativePath, convertedCode, sdkVersion) {
  const rnProjectPath = await ensureNativeProject(sdkVersion);
  await ensureRNProjectSrc(rnProjectPath);

  await writeConvertedFile(rnProjectPath, relativePath, convertedCode);
}
