import { buildFixPrompt } from '../prompt/promptBuilder.js';
import { createSession } from '../ai/aiFactory.js';
import { saveConvertedFile, ensureNativeProject } from '../nativeWriter.js';
import { cleanAIResponse } from '../helpers/cleanAIResponse.js'; // Fallback cleaner

export class Healer {
  constructor(verifier, aiOptions = {}) {
    this.verifier = verifier;
    this.aiOptions = aiOptions;
  }

  /**
   * Attempt to fix the file by feeding errors back to AI.
   * @param {string} projectPath 
   * @param {string} filePath 
   * @param {string} coding - The current broken code
   * @param {string[]} initialErrors 
   * @returns {Promise<boolean>} - True if fixed, False if gave up.
   */
  async heal(projectPath, filePath, code, initialErrors) {
    console.log(`🚑 Attempting to heal ${filePath}...`);
    
    // 1. Initialize Stateful Session
    const session = createSession(this.aiOptions.model, this.aiOptions.provider);

    let currentCode = code;
    let currentErrors = initialErrors;

    // Try up to 2 times (initial + 2 retries = 3 attempts total)
    for (let attempt = 1; attempt <= 2; attempt++) {
        console.log(`   🩹 Healing Attempt ${attempt}/2...`);
        
        // 2. Build Prompt
        // Note: For stateful sessions, we might just need to send the "Update" on subsequent turns,
        // but re-sending context is safer for now unless we optimize promptBuilder specifically for chat.
        // However, promptBuilder.js builds a full prompt. 
        // In a chat flow, the history will accumulate.
        // Attempt 1: "Here is code + errors. Fix it."
        // Attempt 2: "That didn't work. New errors: [...]. Fix it again."
        
        let prompt;
        if (attempt === 1) {
            prompt = buildFixPrompt(currentCode, currentErrors);
        } else {
             // For subsequent attempts, we can be more conversational if we wanted, 
             // but buildFixPrompt provides a structured "Here is the situation" block.
             // Since we are pushing to history, the AI sees:
             // User: Fix this (Code A, Errors A)
             // AI: (Code B)
             // User: Fix this (Code B, Errors B) -> This works naturally.
             prompt = buildFixPrompt(currentCode, currentErrors);
        }

        // 3. Query AI (Using Session)
        const response = await session.sendMessage(prompt);
        let fixedCode = "";

        // Parse JSON (Reusing logic from aiClient roughly, or simple parse)
        try {
           const parsed = JSON.parse(response);
           fixedCode = parsed.code;
        } catch (e) {
            // Try extracting from markdown
            const match = response.match(/```json([\s\S]*?)```/);
            if (match) {
                try {
                    fixedCode = JSON.parse(match[1]).code;
                } catch(e2) {}
            }
        }

        if (!fixedCode) {
            // Fallback
             fixedCode = cleanAIResponse(response);
        }

        // 4. Save Candidate Fix
        // We overwrite the file locally to let 'tsc' check it again
        await saveConvertedFile(`src/${filePath}`, fixedCode, this.aiOptions.sdkVersion); 

        // 5. Verify Again
        const newErrors = await this.verifier.verify(projectPath, filePath);

        if (newErrors.length === 0) {
            console.log(`✨ Healed successfully!`);
            return true;
        }

        // 6. Still broken? Update loop variables
        currentErrors = newErrors;
        currentCode = fixedCode;
    }

    console.warn(`❌ Could not heal ${filePath} after multiple attempts.`);
    return false;
  }
}
