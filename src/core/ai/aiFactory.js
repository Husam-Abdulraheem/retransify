import dotenv from 'dotenv';
import { sendToGemini } from './geminiClient.js';
import { sendToGroq } from './groqClient.js';

dotenv.config();

/**
 * Sends the prompt to the configured AI provider.
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
