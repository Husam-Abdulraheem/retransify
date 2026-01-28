import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// إنشاء عميل Gemini الرسمي
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * إرسال Prompt إلى نموذج Gemini 2.0 Flash
 *
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function sendToGemini(prompt) {
  try {
    // اختر النموذج - الأولوية للمتغير البيئي AI_MODEL إذا كان المزود gemini أو غير محدد، وإلا الافتراضي
    const modelName = process.env.AI_PROVIDER === 'gemini' && process.env.AI_MODEL ? process.env.AI_MODEL : "gemini-2.0-flash";
    const model = genAI.getGenerativeModel({
      model: modelName,
    });

    // إرسال النص مباشرة بدون contents/parts
    const result = await model.generateContent(prompt);

    // 🔥 أهم شيء: استخراج النص بالتنسيق الجديد
    const text = await result.response.text();

    console.log("📤 Gemini Output:", text.slice(0, 200)); // أول 200 حرف لمعاينة

    return text.trim();
  } catch (error) {
    console.error("❌ Gemini API Error:", error);
    return "";
  }
}
