import path from "path";
import fs from "fs-extra";
import { COMMON_DEPENDENCIES } from '../config/libraryRules.js';
import { runSilentCommand } from '../helpers/shell.js';

/**
 * 1) Ensure Native Expo Project Exists (Pure I/O)
 */
export async function ensureNativeProject(sdkVersion, dependencyManager) {
  if (!dependencyManager) {
    throw new Error("ensureNativeProject: dependencyManager is REQUIRED for Strict One-Shot mode.");
  }

  const projectPath = path.join(process.cwd(), "converted-expo-app");

  // إذا كان المشروع موجوداً وسليماً
  if (await fs.pathExists(projectPath)) {
    if (await isValidExpoProject(projectPath)) {
      console.log("🟡 Using existing Expo project:", projectPath);
      // التأكد من تهيئة المكتبات حتى لو كان المشروع موجوداً
      await queueCommonDependencies(projectPath, dependencyManager);
      return projectPath;
    }
    // إذا كان المجلد موجوداً ولكنه فارغ أو غير صالح، نحذفه
    console.warn("⚠️ Existing folder found but not a valid Expo project. Recreating...");
    await fs.remove(projectPath);
  }

  console.log("🟢 Creating new Expo project (Default/Router Template)...");

  try {
    // ⚠️ لاحظ إضافة await هنا لضمان عدم الانتقال للتنظيف قبل انتهاء التوليد
    await runSilentCommand(
      `npx create-expo-app@latest "${projectPath}" --yes`,
      process.cwd(),
      "Scaffolding Expo Project"
    );
  } catch (e) {
    console.error("❌ Failed to create Expo project.");
    throw e;
  }

  // 2. تنظيف ملفات الديمو الخاصة بإكسبو
  await cleanExpoBoilerplate(projectPath);

  // 3. تهيئة إعدادات التطبيق (app.json) وتهيئة الاعتماديات
  await setupExpoConfig(projectPath);
  await queueCommonDependencies(projectPath, dependencyManager);

  console.log("✅ Expo project scaffolding completed successfully.");
  return projectPath;
}

/**
 * دالة لتنظيف المشروع الجديد من ملفات الديمو الخاصة بـ Expo
 */
async function cleanExpoBoilerplate(projectPath) {
  console.log('🧹 Cleaning Expo boilerplate files...');

  const dirsToNuke = ['components', 'constants', 'hooks', 'scripts'];
  for (const dir of dirsToNuke) {
    const fullPath = path.join(projectPath, dir);
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
      console.log(`   - Deleted: ${dir}`);
    }
  }

  const appDir = path.join(projectPath, 'app');
  if (await fs.pathExists(appDir)) {
    await fs.emptyDir(appDir);
    console.log(`   - Emptied: app/`);
  }
}

/**
 * إعدادات الملفات الأساسية (Pure File Ops)
 */
async function setupExpoConfig(projectPath) {
  // 1. Configure app.json scheme for deep linking
  const appJsonPath = path.join(projectPath, "app.json");
  if (await fs.pathExists(appJsonPath)) {
    const appJson = await fs.readJson(appJsonPath);
    if (appJson.expo && !appJson.expo.scheme) {
      appJson.expo.scheme = "retransify-app";
      // إجبار إكسبو على استخدام Metro للويب لضمان توافقية عالية
      appJson.expo.web = appJson.expo.web || {};
      appJson.expo.web.bundler = "metro";
      await fs.writeJson(appJsonPath, appJson, { spaces: 2 });
      console.log("🔧 Configured app.json scheme.");
    }
  }
}

/**
 * Queue Common Dependencies
 */
async function queueCommonDependencies(projectPath, dependencyManager) {
  console.log("🚀 Queuing Expo Router & Standard Libs...");
  dependencyManager.add(COMMON_DEPENDENCIES);
  console.log(`📦 Queued ${COMMON_DEPENDENCIES.length} backbone dependencies.`);
}

/**
 * التحقق من صحة المشروع
 */
async function isValidExpoProject(projectPath) {
  const expoPkg = path.join(projectPath, "node_modules/expo/package.json");
  return await fs.pathExists(expoPkg);
}
