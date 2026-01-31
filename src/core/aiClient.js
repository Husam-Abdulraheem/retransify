import path from "path";
import { cleanAIResponse } from "./helpers/cleanAIResponse.js";
import { sendToAI } from "./ai/aiFactory.js";

import { buildPrompt } from "./prompt/promptBuilder.js";

/**
 * الدالة التي تتعامل مع الذكاء الاصطناعي
 *
 * ملاحظة:
 * - يدعم الآن التبديل بين Gemini و Groq عبر AI_PROVIDER
 */
export async function convertFileWithAI(fileContext, options = {}) {
  const prompt = buildPrompt(fileContext);

  // Use the factory function
  const aiResponse = await sendToAI(prompt, options.model, options.provider);
  console.log("📤 In AIClient before cleaning Markdown output preview:", aiResponse.slice(0, 200)); // أول 200 حرف

  // تنظيف الاستجابة من Markdown أو إضافات غير مرغوبة
  const cleanCode = cleanAIResponse(aiResponse);
  console.log("📤 In AIClient after cleaning Markdown Gemini output preview:", cleanCode.slice(0, 200)); // أول 200 حرف
  

  return cleanCode;
}