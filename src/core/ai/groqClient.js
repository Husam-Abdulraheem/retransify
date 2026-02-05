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
        
        console.log(`🔷 Actual Groq Model Used: ${model}`); // Standardized debug log

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            model: model,
            temperature: 0.2,
            max_completion_tokens: 8192,
            top_p: 1,
            stream: false, // Usage in non-streaming context for file conversion
            response_format: { type: "json_object" }, // FORCE JSON
            stop: null
        });

        const text = completion.choices[0]?.message?.content || "";
        console.log("📥 Groq Output:", text.slice(0, 200));
        return text.trim();

    } catch (error) {
        // Attempt to recover from JSON validation errors
        if (error?.error?.code === 'json_validate_failed' && error?.error?.failed_generation) {
            console.warn("⚠️ Groq JSON Validation Failed. Attempting to recover...");
            let raw = error.error.failed_generation;

            // Fix common issue: Double closing braces "}}" at the end
            if (raw.trim().endsWith('}}')) {
                 raw = raw.replace(/}}\s*$/, '}');
            }

            try {
                // Verify if it's valid JSON now
                JSON.parse(raw); 
                console.log("✅ Recovered valid JSON from failed generation.");
                return raw;
            } catch (jsonError) {
                console.error("❌ Recovery failed. JSON is still invalid.");
            }
        }

        console.error("❌ Groq API Error:", error);
        return "";
    }
}
