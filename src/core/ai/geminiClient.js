import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// Create new Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class GeminiSession {
  constructor(modelName) {
    this.modelName =
      modelName ||
      (process.env.AI_PROVIDER === 'gemini' && process.env.AI_MODEL
        ? process.env.AI_MODEL
        : 'gemini-2.0-flash');
    this.chatSession = null;
  }

  async _initSession() {
    if (!this.chatSession) {
      console.log(`🔷 Initializing Gemini Chat Session (${this.modelName})...`);
      // New SDK Pattern
      this.chatSession = ai.chats.create({
        model: this.modelName,
        config: {
          responseMimeType: 'application/json',
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
        // ✅ Fix: Wrap text in an object containing message property
        // @google/genai requires an object with a message property
        const result = await this.chatSession.sendMessage({ message: prompt });

        // Handle new library response
        // In some versions .text() is a function, in others a property, so we check
        let text = '';
        if (typeof result.text === 'function') {
          text = result.text();
        } else if (result.text) {
          text = result.text;
        } else if (
          result.response &&
          typeof result.response.text === 'function'
        ) {
          // fallback for old or hybrid versions
          text = result.response.text();
        }

        if (!text) {
          console.warn('⚠️ Valid Gemini response but no text content found.');
          return '';
        }

        console.log('📤 Gemini Output:', text.slice(0, 200));
        return text.trim();
      } catch (err) {
        if (
          err.message &&
          (err.message.includes('429') ||
            err.message.includes('Too Many Requests'))
        ) {
          attempt++;
          console.warn(
            `⚠️ Rate limited (429). Retrying attempt ${attempt}/${maxRetries} after delay...`
          );
          await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
        } else {
          console.error('❌ Gemini API Error:', err);
          // On fatal error, exit immediately instead of retrying
          return '';
        }
      }
    }
    throw new Error('Exceeded max retries for Gemini API (429 Rate Limit).');
  }
}

/**
 * Send Prompt to Gemini model
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
