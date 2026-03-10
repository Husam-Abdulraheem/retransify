// src/core/graph/nodes/dependencyResolverNode.js
import {
  CONFLICT_MAP,
  WEB_ONLY_BLOCKLIST,
  COMMON_DEPENDENCIES,
} from '../../config/libraryRules.js';
import { runSilentCommand } from '../../helpers/shell.js';

/**
 * DependencyResolverNode - يفحص imports الملف الحالي ويتحقق من توافق المكتبات
 *
 * المدخلات من state:
 * - state.currentFile: كائن الملف الحالي (يجب أن يحتوي على imports)
 * - state.installedPackages: الحزم المثبتة حالياً
 * - state.facts.tech: معلومات الـ tech stack
 *
 * المخرجات إلى state:
 * - state.currentFile: محدَّث بمعلومات التبعيات المحلولة (resolvedDeps)
 *
 * @param {import('../state.js').GraphState} state
 * @param {{ fastModel: Session }} models
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function dependencyResolverNode(state, models = {}) {
  const { currentFile, installedPackages = [], facts = {} } = state;

  if (!currentFile) {
    console.warn('⚠️  [DependencyResolverNode] لا يوجد ملف حالي');
    return {};
  }

  const filePath = currentFile.relativeToProject || currentFile.filePath;
  console.log(`\n🔍 [DependencyResolverNode] فحص تبعيات: ${filePath}`);

  const imports = currentFile.imports || [];
  const installedSet = new Set(installedPackages);

  const resolvedDeps = {
    safe: [], // مكتبات آمنة للاستخدام
    replaced: [], // مكتبات تم استبدالها ببديل RN
    blocked: [], // مكتبات محظورة (Web Only)
    unknown: [], // مكتبات مجهولة تحتاج فحص
    stubs: [], // مكتبات تحتاج Stub بدلاً من تثبيت
  };

  for (const imp of imports) {
    const source = imp.source || imp;

    // تجاهل الـ imports النسبية (ملفات محلية)
    if (source.startsWith('.') || source.startsWith('/')) continue;

    // تجاهل الحزم الأساسية (react, react-native, إلخ)
    if (isCorePkg(source)) continue;

    // ── 1. فحص قائمة المحظورات (Web Only) ─────────────────────
    if (isWebOnly(source)) {
      console.log(`🛡️  [DependencyResolverNode] محظور (Web Only): ${source}`);
      resolvedDeps.blocked.push(source);
      continue;
    }

    // ── 2. فحص خريطة التعارضات (CONFLICT_MAP) ─────────────────
    const replacement = findReplacement(source);
    if (replacement !== undefined) {
      if (replacement === null) {
        resolvedDeps.blocked.push(source);
      } else {
        resolvedDeps.replaced.push({ original: source, replacement });
        console.log(
          `🔄 [DependencyResolverNode] استبدال: ${source} -> ${replacement}`
        );
      }
      continue;
    }

    // ── 3. فحص إذا كانت المكتبة مثبتة بالفعل ──────────────────
    if (installedSet.has(source)) {
      resolvedDeps.safe.push(source);
      continue;
    }

    // ── 4. فحص إذا كانت مكتبة Expo/RN معروفة ──────────────────
    if (isKnownExpoOrRN(source)) {
      resolvedDeps.safe.push(source);
      continue;
    }

    // ── 5. المكتبات المجهولة: استخدم fastModel لاقتراح بديل ─────
    console.log(`❓ [DependencyResolverNode] مكتبة مجهولة: ${source}`);

    if (models.fastModel) {
      const suggestion = await suggestAlternative(source, models.fastModel);

      if (suggestion.action === 'use_expo') {
        resolvedDeps.replaced.push({
          original: source,
          replacement: suggestion.package,
        });
        console.log(
          `💡 [DependencyResolverNode] اقتراح AI: ${source} -> ${suggestion.package}`
        );
      } else if (suggestion.action === 'stub') {
        resolvedDeps.stubs.push(source);
        console.log(`🔧 [DependencyResolverNode] سيُنشأ Stub لـ: ${source}`);
      } else {
        // التحقق من وجود الحزمة في npm
        const exists = await checkNpmPackage(source);
        if (exists) {
          resolvedDeps.safe.push(source);
        } else {
          resolvedDeps.stubs.push(source);
          console.warn(
            `⚠️  [DependencyResolverNode] الحزمة غير موجودة في npm: ${source}`
          );
        }
      }
    } else {
      // بدون AI، نضعها كـ unknown للمراجعة اليدوية
      resolvedDeps.unknown.push(source);
    }
  }

  // إضافة معلومات التبعيات المحلولة للملف الحالي
  const updatedFile = {
    ...currentFile,
    resolvedDeps,
  };

  console.log(
    `✅ [DependencyResolverNode] آمن: ${resolvedDeps.safe.length} | مستبدَل: ${resolvedDeps.replaced.length} | محظور: ${resolvedDeps.blocked.length}`
  );

  return {
    currentFile: updatedFile,
  };
}

// ── دوال مساعدة ──────────────────────────────────────────────────────────────

function isCorePkg(source) {
  const corePkgs = ['react', 'react-native', 'react-dom', 'expo'];
  return corePkgs.some((p) => source === p || source.startsWith(`${p}/`));
}

function isWebOnly(source) {
  return WEB_ONLY_BLOCKLIST.some(
    (blocked) => source === blocked || source.startsWith(`${blocked}/`)
  );
}

function findReplacement(source) {
  // فحص مباشر
  if (Object.prototype.hasOwnProperty.call(CONFLICT_MAP, source)) {
    return CONFLICT_MAP[source];
  }
  // فحص النطاق (scoped packages)
  const scope = source.startsWith('@')
    ? source.split('/')[0] + '/' + source.split('/')[1]
    : null;
  if (scope && Object.prototype.hasOwnProperty.call(CONFLICT_MAP, scope)) {
    return CONFLICT_MAP[scope];
  }
  return undefined;
}

function isKnownExpoOrRN(source) {
  return (
    source.startsWith('expo-') ||
    source.startsWith('@expo/') ||
    source.startsWith('react-native-') ||
    source.startsWith('@react-navigation/') ||
    COMMON_DEPENDENCIES.includes(source)
  );
}

/**
 * يسأل fastModel عن بديل مناسب لمكتبة ويب
 */
async function suggestAlternative(packageName, fastModel) {
  const prompt = `You are a React Native expert. A web package "${packageName}" needs a React Native/Expo alternative.
Respond with JSON only:
{
  "action": "use_expo" | "stub" | "keep",
  "package": "expo-package-name or null",
  "reason": "brief reason"
}
If there's a good Expo/RN alternative, use "use_expo".
If no alternative exists and it's UI-only, use "stub".
If it works in RN already, use "keep".`;

  try {
    const response = await fastModel.sendMessage(prompt);
    const parsed = JSON.parse(response);
    return parsed;
  } catch {
    return { action: 'keep', package: null };
  }
}

/**
 * يتحقق من وجود الحزمة في npm
 */
async function checkNpmPackage(packageName) {
  try {
    runSilentCommand(`npm view ${packageName} name`, process.cwd(), null);
    return true;
  } catch {
    return false;
  }
}
