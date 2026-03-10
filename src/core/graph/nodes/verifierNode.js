// src/core/graph/nodes/verifierNode.js
import path from 'path';
import crypto from 'crypto';

/**
 * VerifierNode - يفحص الكود الناتج من ExecutorNode
 *
 * المدخلات: state.generatedCode, state.rnProjectPath
 * المخرجات: state.errors (فارغ = نجح، ممتلئ = فشل -> HealerNode)
 *
 * @param {import('../state.js').GraphState} state
 * @returns {Partial<import('../state.js').GraphState>}
 */
export async function verifierNode(state) {
  const { generatedCode, currentFile } = state;

  if (!generatedCode) {
    console.warn('⚠️  [VerifierNode] لا يوجد كود للتحقق');
    return { errors: ['No code generated'] };
  }

  const filePath =
    currentFile?.relativeToProject || currentFile?.filePath || 'unknown';
  console.log(`\n🔍 [VerifierNode] فحص: ${filePath}`);

  const errors = [];

  // ── 1. فحص الـ Syntax الأساسي ─────────────────────────────────
  const syntaxErrors = checkBasicSyntax(generatedCode);
  errors.push(...syntaxErrors);

  // ── 2. فحص وجود React Native imports الأساسية ─────────────────
  const rnErrors = checkReactNativeBasics(generatedCode, filePath);
  errors.push(...rnErrors);

  // ── 3. فحص عدم وجود Web-Only APIs ────────────────────────────
  const webErrors = checkWebOnlyAPIs(generatedCode);
  errors.push(...webErrors);

  if (errors.length === 0) {
    console.log(`✅ [VerifierNode] الكود صالح`);
  } else {
    console.log(`❌ [VerifierNode] وجد ${errors.length} خطأ:`);
    errors.slice(0, 3).forEach((e) => console.log(`   - ${e}`));
  }

  // حساب هاش الأخطاء لكشف الحلقات في HealerNode
  const errorHash =
    errors.length > 0
      ? crypto
          .createHash('md5')
          .update(errors.join(''))
          .digest('hex')
          .slice(0, 16)
      : null;

  return {
    errors,
    lastErrorHash: errorHash,
  };
}

function checkBasicSyntax(code) {
  const errors = [];

  // فحص توازن الأقواس
  let braces = 0,
    brackets = 0,
    parens = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (inString) {
      if (c === stringChar && code[i - 1] !== '\\') inString = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = true;
      stringChar = c;
      continue;
    }
    if (c === '{') braces++;
    if (c === '}') braces--;
    if (c === '[') brackets++;
    if (c === ']') brackets--;
    if (c === '(') parens++;
    if (c === ')') parens--;
  }

  if (braces !== 0)
    errors.push(`Unbalanced braces: ${braces > 0 ? 'missing }' : 'extra }'}`);
  if (brackets !== 0) errors.push(`Unbalanced brackets`);
  if (parens !== 0) errors.push(`Unbalanced parentheses`);

  // فحص وجود export default
  if (!code.includes('export default') && !code.includes('module.exports')) {
    errors.push('Missing export default');
  }

  return errors;
}

function checkReactNativeBasics(code, filePath) {
  const errors = [];
  const isComponent =
    filePath.includes('component') ||
    filePath.includes('screen') ||
    filePath.includes('page') ||
    /\.(tsx|jsx)$/.test(filePath);

  if (isComponent && code.includes('<div') && !code.includes('<View')) {
    errors.push('Using HTML <div> instead of React Native <View>');
  }
  if (code.includes('<span') && !code.includes('<Text')) {
    errors.push('Using HTML <span> instead of React Native <Text>');
  }
  if (code.includes('<img') && !code.includes('<Image')) {
    errors.push('Using HTML <img> instead of React Native <Image>');
  }

  return errors;
}

function checkWebOnlyAPIs(code) {
  const errors = [];
  const webAPIs = [
    'document.',
    'window.',
    'localStorage.',
    'sessionStorage.',
    'getElementById',
  ];

  webAPIs.forEach((api) => {
    if (code.includes(api)) {
      errors.push(`Web-only API detected: ${api}`);
    }
  });

  return errors;
}
