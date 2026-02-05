import path from "path";
import fs from "fs-extra";
import { COMMON_DEPENDENCIES } from './constants/commonDependencies.js';
import { runSilentCommand } from './helpers/shell.js';

/**
 * 1) Ensure Native Expo Project Exists
 * Uses 'blank-typescript' template for quick setup.
 */
export async function ensureNativeProject(sdkVersion) {
  const projectPath = path.join(process.cwd(), "converted-expo-app");

  // Check if project already exists
  if (await fs.pathExists(projectPath)) {
    console.log("🟡 Using existing Expo project:", projectPath);
    await setupExpoRouter(projectPath);
    return projectPath;
  }

  if (sdkVersion) console.log(`ℹ️  Using SDK Version: ${sdkVersion}`);

  // Use typescript template directly
  const template = sdkVersion ? `blank-typescript@${sdkVersion}` : "blank-typescript";
  
  try {
      runSilentCommand(
        `npx create-expo-app@latest ${projectPath} --template ${template} --yes`,
        process.cwd(),
        "🟢 Creating new Expo project (TypeScript)..."
      );
  } catch (e) {
      console.error("❌ Failed to create Expo project.");
      throw e;
  }

  // Setup libraries
  await setupExpoRouter(projectPath);

  console.log("✅ Expo project created at:", projectPath);
  return projectPath;
}

/**
 * Configure Expo Router dependencies
 */
async function setupExpoRouter(projectPath) {
  console.log("🚀 Ensuring Expo Router & Standard Libs are set up...");
  try {
    // 1. Initial Sync & Sanitization
    // Essential to ensure Expo CLI sees a valid environment.
    console.log("🧹 [1/2] Syncing environment...");
    // Update: Added --legacy-peer-deps to handle React 19 conflicts in the base template
    await runSilentCommand('npm install --legacy-peer-deps', projectPath, "🧹 Syncing node_modules...");
    
    // 2. Install dependencies
    const depsToInstall = COMMON_DEPENDENCIES.join(' ');
    console.log("📦 [2/2] Installing dependencies via Expo...");
    
    try {
        // محاولة التثبيت المباشر باستخدام Expo (الطريقة المثالية)
        await runSilentCommand(
            `npx expo install ${depsToInstall}`,
            projectPath,
            "📦 Installing Standard Dependencies..."
        );
    } catch (expoError) {
        // شبكة أمان: إذا فشلت الطريقة الرسمية بسبب تعارضات Peer Deps (مثل مشكلة React 19)
        // نلجأ للخطة البديلة (npm force install) تلقائياً بدلاً من انهيار الأداة.
        console.warn("⚠️ Expo install hit a conflict. Switching to robust install...");
        await runSilentCommand(
            `npm install ${depsToInstall} --legacy-peer-deps`,
            projectPath,
            "� Fallback: Force installing dependencies..."
        );
        // إصلاح النسخ بعد الإجبار
        await runSilentCommand(`npx expo install --fix`, projectPath, "🔧 Fixing versions...");
    }

    // ---------------------------------------------------------
    // إعدادات الملفات (Configuration)
    // ---------------------------------------------------------
    
    // 1. package.json entry point
    const packageJsonPath = path.join(projectPath, "package.json");
    if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        if (packageJson.main !== "expo-router/entry") {
            packageJson.main = "expo-router/entry";
            await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
            console.log("✅ Configured package.json entry point.");
        }
    }

    // 2. حذف App.tsx أو App.js الافتراضي
    // بما أننا نستخدم blank-typescript، الملف الافتراضي سيكون App.tsx
    const potentialFiles = ["App.tsx", "App.js", "App.ts"];
    for (const file of potentialFiles) {
        const filePath = path.join(projectPath, file);
        if (await fs.pathExists(filePath)) {
            console.log(`🗑️  Renaming default ${file}...`);
            await fs.rename(filePath, path.join(projectPath, `Backup_${file}`));
        }
    }

    // 3. إعداد app.json
    const appJsonPath = path.join(projectPath, "app.json");
    if (await fs.pathExists(appJsonPath)) {
        const appJson = await fs.readJson(appJsonPath);
        if (appJson.expo && !appJson.expo.scheme) {
            appJson.expo.scheme = "retransify-app";
            appJson.expo.web = { bundler: "metro" };
            await fs.writeJson(appJsonPath, appJson, { spaces: 2 });
            console.log("🔧 Configured app.json scheme.");
        }
    }

    console.log("✅ Expo Router setup completed successfully.");

  } catch (e) {
      console.error("❌ Failed to setup Expo Router:", e.message);
  }
}

// ---------------------------------------------------------
// الدوال المساعدة (كما هي)
// ---------------------------------------------------------



export async function writeConvertedFile(rnProjectPath, relativePath, code) {
  try {
    const destPath = path.join(rnProjectPath, relativePath);
    await fs.ensureDir(path.dirname(destPath));
    await fs.writeFile(destPath, code, "utf-8");
    console.log(`📁 File written: ${relativePath}`);
  } catch (err) {
    console.error("❌ Failed to write converted file:", err.message);
  }
}

export async function ensureRNProjectSrc(rnProjectPath) {
  const srcPath = path.join(rnProjectPath, "src");
  if (!(await fs.pathExists(srcPath))) {
    console.log("📦 Creating RN src directory...");
    await fs.mkdir(srcPath);
  }
}

export async function saveConvertedFile(relativePath, convertedCode, sdkVersion) {
  const rnProjectPath = await ensureNativeProject(sdkVersion);
  await ensureRNProjectSrc(rnProjectPath);
  await writeConvertedFile(rnProjectPath, relativePath, convertedCode);
}

export async function setupNativeWind(projectPath) {
    console.log("🌪️  Configuring NativeWind...");
    const tailwindConfigPath = path.join(projectPath, "tailwind.config.js");
    if (!(await fs.pathExists(tailwindConfigPath))) {
        const configContent = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};`;
        await fs.writeFile(tailwindConfigPath, configContent);
        console.log("✅ Created tailwind.config.js");
    }
    
    const babelConfigPath = path.join(projectPath, "babel.config.js");
    if (await fs.pathExists(babelConfigPath)) {
        let babelContent = await fs.readFile(babelConfigPath, 'utf-8');
        if (!babelContent.includes('nativewind/babel')) {
             if (babelContent.includes("plugins: [")) {
                babelContent = babelContent.replace("plugins: [", "plugins: ['nativewind/babel', ");
            } else {
                babelContent = babelContent.replace(/presets:\s*\[.*?\]/s, match => `${match},\n    plugins: ['nativewind/babel']`);
            }
            await fs.writeFile(babelConfigPath, babelContent);
            console.log("✅ Updated babel.config.js");
        }
    }
}
