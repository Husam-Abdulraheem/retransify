import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

// Create the Groq client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

/**
 * Sends a prompt to the Groq API and returns the response text.
 * 
 * @param {string} prompt 
 * @param {string} [modelName] - Optional model override
 * @returns {Promise<string>}
 */
export async function sendToGroq(prompt, modelName) {
    try {
        const model = modelName || process.env.AI_MODEL || "llama-3.1-8b-instant"; // Default fallback
        
        console.log(`🤖 Sending to Groq (Model: ${model})...`);

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            model: model,
            temperature: 0.6,
            max_completion_tokens: 4096,
            top_p: 0.95,
            stream: false, // Usage in non-streaming context for file conversion
            stop: null
        });

        const text = completion.choices[0]?.message?.content || "";
        console.log("📥 Groq Output:", text.slice(0, 200));
        return text.trim();

    } catch (error) {
        console.error("❌ Groq API Error:", error);
        return "";
    }
}
