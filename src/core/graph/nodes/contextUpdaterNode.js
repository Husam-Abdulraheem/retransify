// src/core/graph/nodes/contextUpdaterNode.js
import path from 'path';
import { Project } from 'ts-morph';
import { Document } from '@langchain/core/documents';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

/**
 * ContextUpdaterNode - يُحدِّث VectorStore بالكود الجديد بعد التحويل
 *
 * يحذف المتجه القديم للملف ويُدرج الجديد مع الواجهات المُحوَّلة
 *
 * @param {import('../state.js').GraphState} state
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function contextUpdaterNode(state) {
  const { generatedCode, currentFile, vectorStore, vectorIdMap } = state;

  if (!generatedCode || !vectorStore) return {};

  const filePath = currentFile?.relativeToProject || currentFile?.filePath;
  if (!filePath) return {};

  console.log(`\n🔄 [ContextUpdaterNode] تحديث VectorStore لـ: ${filePath}`);

  try {
    // استخراج خلاصة الكود الجديد بـ ts-morph
    const newSummary = extractSummaryFromCode(generatedCode, filePath);

    if (!newSummary) return {};

    // إنشاء Document جديد
    const newDoc = new Document({
      pageContent: newSummary,
      metadata: { filePath, type: 'converted_file' },
    });

    // إضافة المتجه الجديد للـ VectorStore
    // MemoryVectorStore لا يدعم الحذف المباشر، لذا نُضيف فقط
    // (الـ similarity search ستجد الأحدث أكثر صلة)
    await vectorStore.addDocuments([newDoc]);

    // تحديث الـ Map بالـ ID الجديد
    const newVectorIdMap = {
      ...vectorIdMap,
      [filePath]: `converted_${filePath}`,
    };

    console.log(`✅ [ContextUpdaterNode] تم تحديث VectorStore`);
    return { vectorIdMap: newVectorIdMap };
  } catch (err) {
    console.warn(`⚠️  [ContextUpdaterNode] فشل التحديث: ${err.message}`);
    return {};
  }
}

function extractSummaryFromCode(code, filePath) {
  try {
    const tsProject = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, jsx: 2, strict: false },
    });

    const sourceFile = tsProject.createSourceFile(
      `temp_${path.basename(filePath)}`,
      code,
      { overwrite: true }
    );

    const parts = [`FILE: ${filePath} (CONVERTED)`];

    const interfaces = sourceFile.getInterfaces();
    if (interfaces.length > 0) {
      parts.push(
        'INTERFACES: ' + interfaces.map((i) => i.getName()).join(', ')
      );
    }

    const exports = sourceFile.getFunctions().filter((f) => f.isExported());
    if (exports.length > 0) {
      parts.push('EXPORTS: ' + exports.map((f) => f.getName()).join(', '));
    }

    const imports = sourceFile
      .getImportDeclarations()
      .filter((i) => i.getModuleSpecifierValue().startsWith('react-native'))
      .slice(0, 5)
      .map((i) => `from '${i.getModuleSpecifierValue()}'`);

    if (imports.length > 0) {
      parts.push('RN_IMPORTS: ' + imports.join(', '));
    }

    return parts.join('\n');
  } catch {
    return `FILE: ${filePath} (CONVERTED)\nCODE_PREVIEW: ${code.slice(0, 200)}`;
  }
}
