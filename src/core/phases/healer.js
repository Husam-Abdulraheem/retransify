import { buildFixPrompt } from '../prompt/promptBuilder.js';
import { sendToAI } from '../ai/aiFactory.js';
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
    
    let currentCode = code;
    let currentErrors = initialErrors;

    // Try up to 2 times (initial + 2 retries = 3 attempts total)
    for (let attempt = 1; attempt <= 2; attempt++) {
        console.log(`   🩹 Healing Attempt ${attempt}/2...`);
        
        // 1. Build Prompt
        const prompt = buildFixPrompt(currentCode, currentErrors);

        // 2. Query AI
        const response = await sendToAI(prompt, this.aiOptions.model, this.aiOptions.provider);
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

        // 3. Save Candidate Fix
        // We overwrite the file locally to let 'tsc' check it again
        // We don't know the exact SDK version here easily without passing it down, 
        // but 'saveConvertedFile' mostly needs it for init. If project exists, it ignores it.
        // We'll pass '50' or undefined as a dummy if mostly project exists.
        // Better: ensureNativeProject is already run.
        await saveConvertedFile(`src/${filePath}`, fixedCode, this.aiOptions.sdkVersion); 

        // 4. Verify Again
        const newErrors = await this.verifier.verify(projectPath, filePath);

        if (newErrors.length === 0) {
            console.log(`✨ Healed successfully!`);
            return true;
        }

        // 5. Still broken? Update loop variables
        currentErrors = newErrors;
        currentCode = fixedCode;
    }

    console.warn(`❌ Could not heal ${filePath} after multiple attempts.`);
    return false;
  }
}
