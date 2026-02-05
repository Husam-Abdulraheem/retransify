import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// إنشاء عميل Gemini الجديد
// apiKey is passed in the constructor options
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * إرسال Prompt إلى نموذج Gemini
 *
 * @param {string} prompt
 * @param {string} [modelName]
 * @returns {Promise<string>}
 */
export async function sendToGemini(prompt, modelName = null) {
  try {
    // اختر النموذج - الأولوية للوسيط الممرر، ثم المتغير البيئي، ثم الافتراضي
    const selectedModel = modelName || (process.env.AI_PROVIDER === 'gemini' && process.env.AI_MODEL ? process.env.AI_MODEL : "gemini-2.0-flash");
    
    console.log(`🔷 Actual Gemini Model Used: ${selectedModel}`);

    // Retry logic for 429 errors
    let attempt = 0;
    const maxRetries = 3;
    
    while (attempt < maxRetries) {
      try {
        // الاستخدام الجديد حسب وثائق @google/genai
        const response = await ai.models.generateContent({
          model: selectedModel,
          config: {
            responseMimeType: "application/json",
          },
          contents: prompt,
        });

        // استخراج النص من الاستجابة
        const text = response.text; // حسب مثال المستخدم

        if (!text) {
             console.warn("⚠️ Valid Gemini response but no text content found.");
             return "";
        }

        console.log("📤 Gemini Output:", text.slice(0, 200)); // أول 200 حرف لمعاينة
        return text.trim();
        
      } catch (err) {
        // Check for 429 in the new SDK error structure (usually similar msg)
        if (err.message && (err.message.includes("429") || err.message.includes("Too Many Requests"))) {
          attempt++;
          console.warn(`⚠️ Rate limited (429). Retrying attempt ${attempt}/${maxRetries} after delay...`);
          await new Promise(resolve => setTimeout(resolve, 3000 * attempt)); // Exponential-ish backoff
        } else {
          throw err; // Rethrow other errors
        }
      }
    }
    
    throw new Error("Exceeded max retries for Gemini API (429 Rate Limit).");

  } catch (error) {
    console.error("❌ Gemini API Error:", error);
    return "";
  }
}
