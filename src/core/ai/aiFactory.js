import dotenv from 'dotenv';
import { sendToGemini, GeminiSession } from './geminiClient.js';
import { sendToGroq, GroqSession } from './groqClient.js';

dotenv.config();

/**
 * Creates a stateful session for the configured AI provider.
 * @param {string} [model] 
 * @param {string} [provider] 
 * @returns {GroqSession|GeminiSession}
 */
export function createSession(model = null, provider = null) {
    const selectedProvider = provider || process.env.AI_PROVIDER || 'gemini';

    switch (selectedProvider.toLowerCase()) {
        case 'groq':
            return new GroqSession(model);
        case 'gemini':
        default:
            return new GeminiSession(model);
    }
}

/**
 * Sends the prompt to the configured AI provider (Stateless, One-off).
 * 
 * @param {string} prompt 
 * @returns {Promise<string>}
 */
export async function sendToAI(prompt, model = null, provider = null) {
    const selectedProvider = provider || process.env.AI_PROVIDER || 'gemini'; // Default to gemini

    switch (selectedProvider.toLowerCase()) {
        case 'groq':
            return await sendToGroq(prompt, model);
        case 'gemini':
        default:
            return await sendToGemini(prompt, model);
    }
}
