// src/core/fileScanner.js
import path from "path";
import fs from "fs/promises";

/**
 * الإعدادات الافتراضية لملف الـ Scanner
 */
const DEFAULT_OPTIONS = {
  // من أين يبدأ الفحص (داخل مجلد المشروع)
  srcDir: "src",

  // الامتدادات التي نهتم بها
  extensions: [".js", ".jsx", ".ts", ".tsx"],

  // مجلدات يتم تجاهلها تماماً
  ignoreDirs: [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".expo",
    "android",
    "ios"
  ],

  // ملفات بعينها يمكن تجاهلها إن أحببت
  ignoreFiles: []
};

/**
 * دالة رئيسية لمسح المشروع
 * @param {string} projectRoot - المسار الجذري لمشروع React
 * @param {object} options - إعدادات اختيارية
 * @returns {Promise<{ files: Array, structure: object }>}
 */
export async function scanProject(projectRoot, options = {}) {
  const config = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  const srcRoot = path.join(projectRoot, config.srcDir);

  const files = await collectFiles(srcRoot, {
    ...config,
    projectRoot,
    srcRoot
  });

  const structure = buildStructureTree(files, srcRoot);

  return {
    files,
    structure
  };
}

/**
 * يجمع جميع الملفات (recursively) مع بعض الميتاداتا المهمة
 * @param {string} dir - المجلد الحالي الذي يتم مسحه
 * @param {object} config
 * @returns {Promise<Array>}
 */
async function collectFiles(dir, config) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relToSrc = path.relative(config.srcRoot, fullPath);

    // تجاهل المجلدات غير المرغوبة
    if (entry.isDirectory()) {
      if (config.ignoreDirs.includes(entry.name)) continue;

      const children = await collectFiles(fullPath, config);
      result.push(...children);
      continue;
    }

    if (entry.isFile()) {
      // تجاهل الملفات المحذوفة
      if (config.ignoreFiles.includes(entry.name)) continue;

      const ext = path.extname(entry.name);

      // لو الامتداد مش من الامتدادات اللي نهتم بها، نتجاهله
      if (!config.extensions.includes(ext)) continue;

      const isTest =
        entry.name.endsWith(".test.js") ||
        entry.name.endsWith(".spec.js") ||
        entry.name.endsWith(".test.jsx") ||
        entry.name.endsWith(".spec.jsx") ||
        entry.name.endsWith(".test.ts") ||
        entry.name.endsWith(".spec.ts") ||
        entry.name.endsWith(".test.tsx") ||
        entry.name.endsWith(".spec.tsx");

      result.push({
        absolutePath: fullPath,
        relativeToSrc: normalizePath(relToSrc),
        relativeToProject: normalizePath(
          path.relative(config.projectRoot, fullPath)
        ),
        filename: entry.name,
        ext,
        isTestFile: isTest,
        segments: normalizePath(relToSrc).split("/")
      });
    }
  }

  return result;
}

/**
 * بناء شجرة هيكل المشروع من قائمة الملفات
 * @param {Array} files
 * @param {string} srcRoot
 * @returns {object} structure tree
 */
function buildStructureTree(files, srcRoot) {
  const rootNode = {
    name: path.basename(srcRoot),
    type: "directory",
    children: {}
  };

  for (const file of files) {
    const parts = file.relativeToSrc.split("/");
    let current = rootNode;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          type: isLast ? "file" : "directory",
          children: isLast ? undefined : {}
        };
      }

      current = current.children[part];
    }
  }

  // نحول children من object إلى array لتكون أسهل في العرض/الإرسال
  const normalizeNode = (node) => {
    if (node.type === "file") return node;

    return {
      name: node.name,
      type: "directory",
      children: Object.values(node.children).map(normalizeNode)
    };
  };

  return normalizeNode(rootNode);
}

/**
 * توحيد صيغة المسارات إلى /
 */
function normalizePath(p) {
  return p.split(path.sep).join("/");
}
