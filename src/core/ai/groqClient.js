import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

// Create the Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Stateful session for Groq to maintain conversation context.
 */
export class GroqSession {
  constructor(modelName) {
    this.model = modelName || process.env.AI_MODEL || 'llama-3.1-8b-instant';
    // Groq/Llama requires 'json' to be mentioned in the messages if response_format is json_object
    this.history = [
      {
        role: 'system',
        content:
          'You are a helpful assistant. You must always output valid JSON.',
      },
    ];
  }

  /**
   * Sends a message to Groq and appends it to the history.
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async sendMessage(prompt) {
    try {
      console.log(`🔷 Groq Session (${this.model}): Sending message...`);

      // Add user message to history
      this.history.push({ role: 'user', content: prompt });

      const completion = await groq.chat.completions.create({
        messages: this.history,
        model: this.model,
        temperature: 0.2,
        max_completion_tokens: 8192,
        top_p: 1,
        stream: false,
        response_format: { type: 'json_object' },
        stop: null,
      });

      const text = completion.choices[0]?.message?.content || '';
      console.log('📥 Groq Output:', text.slice(0, 200));

      // Add assistant response to history
      this.history.push({ role: 'assistant', content: text });

      return text.trim();
    } catch (error) {
      // Attempt to recover from JSON validation errors
      if (
        error?.error?.code === 'json_validate_failed' &&
        error?.error?.failed_generation
      ) {
        console.warn(
          '⚠️ Groq JSON Validation Failed. Attempting to recover...'
        );
        let raw = error.error.failed_generation;

        // Fix common issue: Double closing braces "}}" at the end
        if (raw.trim().endsWith('}}')) {
          raw = raw.replace(/}}\s*$/, '}');
        }

        try {
          // Verify if it's valid JSON now
          JSON.parse(raw);
          console.log('✅ Recovered valid JSON from failed generation.');

          // Add recovered response to history so context isn't lost
          this.history.push({ role: 'assistant', content: raw });
          return raw;
        } catch {
          console.error('❌ Recovery failed. JSON is still invalid.');
        }
      }

      console.error('❌ Groq API Error:', error);
      return '';
    }
  }
}

/**
 * Sends a prompt to the Groq API and returns the response text.
 * Wrapper for backward compatibility using a one-off session.
 *
 * @param {string} prompt
 * @param {string} [modelName] - Optional model override
 * @returns {Promise<string>}
 */
export async function sendToGroq(prompt, modelName) {
  const session = new GroqSession(modelName);
  return await session.sendMessage(prompt);
}
