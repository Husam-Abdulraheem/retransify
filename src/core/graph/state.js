// src/core/graph/state.js
import { Annotation } from '@langchain/langgraph';

/**
 * GraphState - الحالة المشتركة التي تنتقل بين جميع العقد (Nodes)
 * يستبدل GlobalMigrationContext و StateManager
 *
 * كل حقل يحتوي على reducer يحدد كيفية تحديث القيمة
 * (_, x) => x  يعني: "استبدل القيمة الحالية بالقيمة الجديدة"
 */
export const GraphState = Annotation.Root({
  // ── معلومات المشروع ──────────────────────────────────────────
  projectPath: Annotation({
    reducer: (_, x) => x,
    default: () => '',
  }),

  // مسار مشروع React Native الوجهة (يُعبأ بعد ensureNativeProject)
  rnProjectPath: Annotation({
    reducer: (_, x) => x,
    default: () => '',
  }),

  // نتائج الـ Analyzer (tech stack, entry files, إلخ)
  facts: Annotation({
    reducer: (prev, x) => ({ ...prev, ...x }),
    default: () => ({}),
  }),

  // ── قائمة الملفات ────────────────────────────────────────────
  // مصفوفة كائنات الملفات المتبقية للتحويل (من FileScanner)
  filesQueue: Annotation({
    reducer: (_, x) => x,
    default: () => [],
  }),

  // خريطة المسارات القديمة -> الجديدة (من PathMapper)
  pathMap: Annotation({
    reducer: (_, x) => x,
    default: () => ({}),
  }),

  // ── الملف الحالي ─────────────────────────────────────────────
  // كائن الملف الذي يتم معالجته الآن
  currentFile: Annotation({
    reducer: (_, x) => x,
    default: () => null,
  }),

  // الكود الناتج من ExecutorNode (قبل الكتابة على القرص)
  generatedCode: Annotation({
    reducer: (_, x) => x,
    default: () => null,
  }),

  // التبعيات التي اقترحها الذكاء الاصطناعي للملف الحالي
  generatedDependencies: Annotation({
    reducer: (_, x) => x,
    default: () => [],
  }),

  // ── RAG / VectorStore ────────────────────────────────────────
  // مثيل MemoryVectorStore (يُعبأ في AnalyzerNode)
  vectorStore: Annotation({
    reducer: (_, x) => x,
    default: () => null,
  }),

  // خريطة: اسم الملف -> Document ID في VectorStore
  // تُستخدم في ContextUpdaterNode لحذف المتجه القديم وإدراج الجديد
  vectorIdMap: Annotation({
    reducer: (prev, x) => ({ ...prev, ...x }),
    default: () => ({}),
  }),

  // ── إدارة الحالة ─────────────────────────────────────────────
  // عدد محاولات الـ Healing للملف الحالي (يُصفَّر مع كل ملف جديد)
  healAttempts: Annotation({
    reducer: (_, x) => x,
    default: () => 0,
  }),

  // هاش آخر خطأ (لكشف الحلقات اللانهائية في Healer)
  lastErrorHash: Annotation({
    reducer: (_, x) => x,
    default: () => null,
  }),

  // الملفات التي تمت معالجتها بنجاح (للاستئناف عند الانقطاع)
  completedFiles: Annotation({
    reducer: (prev, x) => {
      const set = new Set(prev);
      if (Array.isArray(x)) x.forEach((f) => set.add(f));
      else set.add(x);
      return Array.from(set);
    },
    default: () => [],
  }),

  // ── الأخطاء ──────────────────────────────────────────────────
  // أخطاء الملف الحالي (تُعبأ من VerifierNode)
  errors: Annotation({
    reducer: (_, x) => x,
    default: () => [],
  }),

  // سجل الأخطاء الكاملة عبر جميع الملفات
  errorLog: Annotation({
    reducer: (prev, x) => [...prev, ...x],
    default: () => [],
  }),

  // ── إدارة التبعيات ───────────────────────────────────────────
  // مثيل DependencyManager (يُعبأ في بداية الـ workflow)
  dependencyManager: Annotation({
    reducer: (_, x) => x,
    default: () => null,
  }),

  // الحزم المثبتة حالياً في مشروع RN (لتجنب التكرار)
  installedPackages: Annotation({
    reducer: (_, x) => x,
    default: () => [],
  }),

  // ── خيارات التشغيل ───────────────────────────────────────────
  options: Annotation({
    reducer: (_, x) => x,
    default: () => ({}),
  }),
});

/**
 * ثوابت مسارات العقد - تُستخدم في workflow.js للـ Edges
 */
export const NODE_NAMES = {
  ANALYZER: 'analyzerNode',
  PLANNER: 'plannerNode',
  DEPENDENCY_RESOLVER: 'dependencyResolverNode',
  EXECUTOR: 'executorNode',
  VERIFIER: 'verifierNode',
  HEALER: 'healerNode',
  CONTEXT_UPDATER: 'contextUpdaterNode',
  DISK_WRITER: 'diskWriterNode',
  FILE_PICKER: 'filePickerNode', // عقدة مساعدة: تسحب الملف التالي من filesQueue
};

export const MAX_HEAL_ATTEMPTS = 3;
