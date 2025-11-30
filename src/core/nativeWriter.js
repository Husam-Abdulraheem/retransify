import path from "path";
import fs from "fs-extra";
import { execSync } from "child_process";

/**
 * 1) إنشاء مشروع Expo React Native إذا لم يكن موجودًا
 *
 * @returns {string} projectPath
 */
export async function ensureNativeProject() {
  const projectPath = path.join(process.cwd(), "converted-expo-app");

  // المشروع موجود مسبقًا؟
  if (await fs.pathExists(projectPath)) {
    console.log("🟡 Using existing Expo project:", projectPath);
    return projectPath;
  }

  console.log("🟢 Creating new Expo project...");

  execSync(`npx create-expo-app ${projectPath} --template blank`, {
    stdio: "inherit",
  });

  console.log("✅ Expo project created at:", projectPath);
  return projectPath;
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
    const destPath = path.join(rnProjectPath, "src", relativePath);

    // إنشاء المجلدات داخل src/
    const destDir = path.dirname(destPath);
    await ensureDirectory(destDir);

    // كتابة الملف
    await fs.writeFile(destPath, code, "utf-8");

    console.log(`📁 File written: src/${relativePath}`);
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
 */
export async function saveConvertedFile(relativePath, convertedCode) {
  const rnProjectPath = await ensureNativeProject();
  await ensureRNProjectSrc(rnProjectPath);

  await writeConvertedFile(rnProjectPath, relativePath, convertedCode);
}
