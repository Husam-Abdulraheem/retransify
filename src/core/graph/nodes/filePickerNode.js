// src/core/graph/nodes/filePickerNode.js
import path from 'path';

/**
 * FilePickerNode - يسحب الملف التالي من filesQueue لمعالجته
 *
 * هذه عقدة مساعدة تُشغَّل في بداية كل دورة معالجة:
 * - تسحب أول ملف من filesQueue
 * - تتحقق إذا كان الملف يجب تخطيه
 * - تصفِّر healAttempts و errors للملف الجديد
 *
 * المدخلات: state.filesQueue, state.completedFiles, state.facts
 * المخرجات: state.currentFile, state.filesQueue (محدَّث), state.healAttempts: 0
 *
 * @param {import('../state.js').GraphState} state
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function filePickerNode(state) {
  const { filesQueue, completedFiles = [], facts = {} } = state;

  if (!filesQueue || filesQueue.length === 0) {
    console.log('\n✅ [FilePickerNode] تمت معالجة جميع الملفات');
    return { currentFile: null };
  }

  // سحب الملف الأول
  const [nextFile, ...remainingFiles] = filesQueue;
  const filePath = nextFile.relativeToProject || nextFile.filePath;

  // ── التحقق من الملفات المكتملة سابقاً (استئناف) ─────────────
  if (completedFiles.includes(filePath)) {
    console.log(`⏩ [FilePickerNode] تخطي (مكتمل سابقاً): ${filePath}`);
    return {
      filesQueue: remainingFiles,
      currentFile: null, // سيُعاد الاستدعاء للملف التالي
    };
  }

  // ── التحقق من ملفات Web Mount التي يجب حذفها ─────────────────
  const baseName = path.basename(filePath);
  if (
    /^(main|index)\.(tsx|jsx|js|ts)$/i.test(baseName) &&
    filePath.includes('src')
  ) {
    console.log(`🚫 [FilePickerNode] حذف Web Mount File: ${filePath}`);
    return {
      filesQueue: remainingFiles,
      currentFile: null,
    };
  }

  // ── التحقق من قائمة الملفات المحظورة (writePhaseIgnores) ──────
  const writePhaseIgnores = facts.writePhaseIgnores || [];
  if (writePhaseIgnores.some((regex) => regex.test(filePath))) {
    console.log(`🚫 [FilePickerNode] محظور بقاعدة Profile: ${filePath}`);
    return {
      filesQueue: remainingFiles,
      currentFile: null,
    };
  }

  console.log(`\n📂 [FilePickerNode] الملف التالي: ${filePath}`);
  console.log(`   (${remainingFiles.length} ملف متبقٍ)`);

  // قراءة محتوى الملف إذا لم يكن موجوداً
  let fileWithContent = nextFile;
  if (!nextFile.content && nextFile.filePath) {
    try {
      const { readFile } = await import('fs/promises');
      const absolutePath = nextFile.filePath;
      const content = await readFile(absolutePath, 'utf-8');
      fileWithContent = { ...nextFile, content };
    } catch (err) {
      console.warn(`⚠️  [FilePickerNode] تعذّر قراءة: ${filePath}`);
    }
  }

  return {
    currentFile: fileWithContent,
    filesQueue: remainingFiles,
    healAttempts: 0, // تصفير محاولات الإصلاح لكل ملف جديد
    errors: [], // تصفير الأخطاء
    generatedCode: null, // تصفير الكود السابق
    generatedDependencies: [], // تصفير التبعيات السابقة
    lastErrorHash: null, // تصفير هاش الأخطاء
  };
}
