// src/core/graph/nodes/executorNode.js
import path from 'path';
import { buildPrompt } from '../../prompt/promptBuilder.js';
import { cleanAIResponse } from '../../helpers/cleanAIResponse.js';

/**
 * ExecutorNode - يحوِّل الملف الحالي باستخدام smartModel + RAG
 *
 * المدخلات من state:
 * - state.currentFile: كائن الملف الحالي (مع resolvedDeps من DependencyResolverNode)
 * - state.vectorStore: مثيل MemoryVectorStore
 * - state.pathMap: خريطة المسارات
 * - state.facts: معلومات المشروع
 * - state.installedPackages
 *
 * المخرجات إلى state:
 * - state.generatedCode: الكود المُحوَّل (لا يُكتب على القرص هنا)
 * - state.generatedDependencies: التبعيات التي اقترحها الذكاء الاصطناعي
 *
 * @param {import('../state.js').GraphState} state
 * @param {{ smartModel: Session }} models
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function executorNode(state, models = {}) {
  const {
    currentFile,
    vectorStore,
    pathMap,
    facts,
    installedPackages = [],
  } = state;

  if (!currentFile) {
    console.warn('⚠️  [ExecutorNode] لا يوجد ملف حالي');
    return { generatedCode: null, generatedDependencies: [] };
  }

  const filePath = currentFile.relativeToProject || currentFile.filePath;
  console.log(`\n⚙️  [ExecutorNode] تحويل: ${filePath}`);

  // ── 1. استرجاع السياق المشابه من VectorStore (RAG) ───────────
  let ragContext = '';
  if (vectorStore && currentFile.content) {
    try {
      // استرجاع أكثر 3 ملفات مشابهة لمساعدة الـ AI في فهم نمط المشروع
      const similarDocs = await vectorStore.similaritySearch(
        currentFile.content.slice(0, 500), // أول 500 حرف للبحث
        3
      );

      if (similarDocs.length > 0) {
        ragContext = similarDocs
          .filter((doc) => doc.metadata.filePath !== filePath) // استبعاد الملف نفسه
          .map((doc) => `--- ${doc.metadata.filePath} ---\n${doc.pageContent}`)
          .join('\n\n');

        if (ragContext) {
          console.log(
            `🔍 [ExecutorNode] RAG: تم استرجاع ${similarDocs.length} ملف مشابه`
          );
        }
      }
    } catch (err) {
      console.warn(`⚠️  [ExecutorNode] فشل RAG: ${err.message}`);
    }
  }

  // ── 2. بناء سياق الملف للـ Prompt ───────────────────────────
  const fileContext = buildFileContext(
    currentFile,
    pathMap,
    facts,
    installedPackages,
    ragContext
  );

  // ── 3. بناء الـ Prompt ────────────────────────────────────────
  const prompt = buildPrompt(fileContext);

  const model = models.smartModel;
  if (!model) {
    console.error('❌ [ExecutorNode] لا يوجد smartModel');
    return { generatedCode: null, generatedDependencies: [] };
  }

  try {
    console.log('🤖 [ExecutorNode] إرسال للذكاء الاصطناعي...');
    const response = await model.sendMessage(prompt);

    // محاولة تحليل الاستجابة كـ JSON
    const parsed = parseAIResponse(response);
    const generatedCode = parsed.code;
    const generatedDependencies = parsed.dependencies || [];

    if (!generatedCode) {
      console.warn('⚠️  [ExecutorNode] لم يُنتج الذكاء الاصطناعي كوداً صالحاً');
      return { generatedCode: null, generatedDependencies: [] };
    }

    console.log(`✅ [ExecutorNode] تم توليد ${generatedCode.length} حرف`);

    if (generatedDependencies.length > 0) {
      console.log(
        `📦 [ExecutorNode] تبعيات مقترحة: ${generatedDependencies.join(', ')}`
      );
    }

    // ملاحظة: لا نكتب على القرص هنا - هذا دور DiskWriterNode
    return {
      generatedCode,
      generatedDependencies,
      errors: [], // نصفِّر الأخطاء قبل الـ Verifier
    };
  } catch (err) {
    console.error(`❌ [ExecutorNode] خطأ: ${err.message}`);
    return { generatedCode: null, generatedDependencies: [] };
  }
}

// ── دوال مساعدة ──────────────────────────────────────────────────────────────

/**
 * يبني كائن سياق الملف الكامل لـ buildPrompt()
 * يحافظ على نفس هيكل fileContext الذي كان يبنيه contextBuilder.js
 */
function buildFileContext(
  currentFile,
  pathMap,
  facts,
  installedPackages,
  ragContext
) {
  const filePath = currentFile.relativeToProject || currentFile.filePath;
  const baseName = path.basename(filePath);

  // تحديد إذا كان ملف App الرئيسي
  let isMainEntry = false;
  if (/^App\.(tsx|jsx|js|ts)$/i.test(baseName)) {
    isMainEntry = true;
  } else if (
    facts.mainEntryPoint &&
    (filePath === facts.mainEntryPoint ||
      filePath.endsWith(path.basename(facts.mainEntryPoint)))
  ) {
    isMainEntry = true;
  }

  return {
    // معلومات الملف الأساسية
    filePath,
    content: currentFile.content || '',
    imports: currentFile.imports || [],
    exports: currentFile.exports || [],
    components: currentFile.components || [],
    hooks: currentFile.hooks || [],
    hasJSX: currentFile.hasJSX || false,

    // معلومات المشروع
    globalContext: {
      facts: facts,
      decisions: { pathMap },
    },
    pathMap,
    installedPackages,

    // الـ RAG Context (الجديد)
    ragContext,

    // التبعيات المحلولة (من DependencyResolverNode)
    resolvedDeps: currentFile.resolvedDeps || {},

    // تمييز ملف App الرئيسي
    isMainEntry,

    // مسار الوجهة
    targetPath: pathMap[filePath] || filePath,
  };
}

/**
 * يحاول تحليل استجابة الـ AI كـ JSON
 * نفس منطق aiClient.js الأصلي
 */
function parseAIResponse(aiResponse) {
  if (!aiResponse) return { code: '', dependencies: [] };

  // محاولة 1: JSON مباشر
  try {
    return JSON.parse(aiResponse);
  } catch {
    /* متابعة */
  }

  // محاولة 2: JSON داخل markdown
  const jsonMatch = aiResponse.match(/```json([\s\S]*?)```/i);
  const genericMatch = aiResponse.match(/```([\s\S]*?)```/);
  const candidate = jsonMatch?.[1] || genericMatch?.[1];

  if (candidate) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* متابعة */
    }
  }

  // محاولة 3: regex
  const codeMatch = aiResponse.match(
    /"code"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"dependencies"|\s*})/
  );
  if (codeMatch?.[1]) {
    const depMatch = aiResponse.match(/"dependencies"\s*:\s*\[([\s\S]*?)\]/);
    return {
      code: codeMatch[1],
      dependencies: depMatch?.[1]
        ? depMatch[1]
            .split(',')
            .map((d) => d.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean)
        : [],
    };
  }

  // محاولة 4: Substring
  const start = aiResponse.indexOf('{');
  const end = aiResponse.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try {
      return JSON.parse(aiResponse.substring(start, end + 1));
    } catch {
      /* متابعة */
    }
  }

  // Fallback: كود خام
  return {
    code: cleanAIResponse(aiResponse),
    dependencies: [],
  };
}
