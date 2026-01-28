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
export async function sendToAI(prompt) {
    const provider = process.env.AI_PROVIDER || 'gemini'; // Default to gemini

    switch (provider.toLowerCase()) {
        case 'groq':
            return await sendToGroq(prompt);
        case 'gemini':
        default:
            return await sendToGemini(prompt);
    }
}
