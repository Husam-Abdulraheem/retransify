import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// إنشاء عميل Gemini الجديد
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class GeminiSession {
  constructor(modelName) {
    this.modelName = modelName || (process.env.AI_PROVIDER === 'gemini' && process.env.AI_MODEL ? process.env.AI_MODEL : "gemini-2.0-flash");
    this.chatSession = null;
  }

  async _initSession() {
    if (!this.chatSession) {
      console.log(`🔷 Initializing Gemini Chat Session (${this.modelName})...`);
      // New SDK Pattern
      this.chatSession = ai.chats.create({
        model: this.modelName,
        config: {
          responseMimeType: "application/json",
        },
        history: [],
      });
    }
  }

  async sendMessage(prompt) {
    await this._initSession();
    
    console.log(`🔷 Gemini Session: Sending message...`);
    
    // Retry logic for 429
    let attempt = 0;
    const maxRetries = 3;

    while (attempt < maxRetries) {
      try {
        // ✅ الإصلاح هنا: تغليف النص في كائن يحتوي على خاصية message
        // مكتبة @google/genai تتطلب كائناً يحتوي على message
        const result = await this.chatSession.sendMessage({ message: prompt });
        
        // التعامل مع استجابة المكتبة الجديدة
        // في بعض الإصدارات تكون .text() دالة، وفي بعضها خاصية، لذا نتحقق منها
        let text = "";
        if (typeof result.text === 'function') {
            text = result.text();
        } else if (result.text) {
            text = result.text;
        } else if (result.response && typeof result.response.text === 'function') {
            // fallback للنسخ القديمة أو الهجينة
            text = result.response.text();
        }

        if (!text) {
             console.warn("⚠️ Valid Gemini response but no text content found.");
             return "";
        }

        console.log("📤 Gemini Output:", text.slice(0, 200));
        return text.trim();

      } catch (err) {
        if (err.message && (err.message.includes("429") || err.message.includes("Too Many Requests"))) {
          attempt++;
          console.warn(`⚠️ Rate limited (429). Retrying attempt ${attempt}/${maxRetries} after delay...`);
          await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
        } else {
          console.error("❌ Gemini API Error:", err);
          // في حالة الخطأ القاتل، نخرج فوراً بدلاً من إعادة المحاولة
          return "";
        }
      }
    }
    throw new Error("Exceeded max retries for Gemini API (429 Rate Limit).");
  }
}

/**
 * إرسال Prompt إلى نموذج Gemini
 * Wrapper around GeminiSession for backward compatibility.
 *
 * @param {string} prompt
 * @param {string} [modelName]
 * @returns {Promise<string>}
 */
export async function sendToGemini(prompt, modelName = null) {
    const session = new GeminiSession(modelName);
    return await session.sendMessage(prompt);
}
