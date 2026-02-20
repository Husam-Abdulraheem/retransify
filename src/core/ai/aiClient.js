import path from "path";
import { cleanAIResponse } from "../helpers/cleanAIResponse.js";
import { sendToAI } from "./aiFactory.js";

import { buildPrompt } from "../prompt/promptBuilder.js";

/**
 * الدالة التي تتعامل مع الذكاء الاصطناعي
 *
 * ملاحظة:
 * - يدعم الآن التبديل بين Gemini و Groq عبر AI_PROVIDER
 */
export async function convertFileWithAI(fileContext, options = {}) {
  const prompt = buildPrompt(fileContext);

  // Use the factory function
  const aiResponse = await sendToAI(prompt, options.model, options.provider);
  console.log("📤 Raw AI Response Preview:", aiResponse.slice(0, 200));

  let parsed = { code: "", dependencies: [] };
  console.log("🔍 Attempting to parse AI response...");

  try {
    // Attempt 1: Direct JSON parse
    parsed = JSON.parse(aiResponse);
  } catch (e) {
    // Attempt 2: Extract JSON from Markdown block (```json ... ```) or generic block (``` ... ```)
    const jsonMatch = aiResponse.match(/```json([\s\S]*?)```/i);
    const genericMatch = aiResponse.match(/```([\s\S]*?)```/);
    
    let candidate = null;
    if (jsonMatch && jsonMatch[1]) candidate = jsonMatch[1];
    else if (genericMatch && genericMatch[1]) candidate = genericMatch[1];

    if (candidate) {
        try {
            parsed = JSON.parse(candidate);
        } catch (e2) {
             console.warn("⚠️ Failed to parse extracted JSON block.");
             // Try manual regex extraction on the candidate block
             const codeMatch = candidate.match(/"code"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"dependencies"|\s*})/);
             if (codeMatch && codeMatch[1]) {
                 console.log("⚠️ JSON Parse failed but Code Extracted via Regex.");
                 parsed.code = codeMatch[1];
                 // Try to extract dependencies
                 const depMatch = candidate.match(/"dependencies"\s*:\s*\[([\s\S]*?)\]/);
                 if (depMatch && depMatch[1]) {
                     parsed.dependencies = depMatch[1].split(',').map(d => d.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
                 }
             }
        }
    }
    
    // Attempt 3: Try to find start/end of JSON object (if previous methods failed and no parsed code)
    if (!parsed.code) { 
         // One last try: Check if the raw response has the structure we need (unwrapped)
         const rawCodeMatch = aiResponse.match(/"code"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"dependencies"|\s*})/);
         if (rawCodeMatch && rawCodeMatch[1]) {
             parsed.code = rawCodeMatch[1];
             const rawDepMatch = aiResponse.match(/"dependencies"\s*:\s*\[([\s\S]*?)\]/);
             if (rawDepMatch && rawDepMatch[1]) {
                 parsed.dependencies = rawDepMatch[1].split(',').map(d => d.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
             }
         } else {
             // Try substring trimming
             const start = aiResponse.indexOf('{');
             const end = aiResponse.lastIndexOf('}');
             if (start !== -1 && end !== -1) {
                 try {
                    parsed = JSON.parse(aiResponse.substring(start, end + 1));
                 } catch(e3) {
                    console.warn("⚠️ JSON parse failed even after trimming.");
                 }
             }
         }
    }
  }

  // Fallback: If code is empty, assume legacy non-JSON response (or failed parse)
  if (!parsed.code) {
      console.warn("⚠️ AI did not return valid JSON. Using legacy cleanup.");
      parsed.code = cleanAIResponse(aiResponse);
      parsed.dependencies = [];
  } else {
      // Clean the code inside the JSON (just in case AI added backticks inside the string)
      // Usually not needed if it's a valid JSON string, but safe to check?
      // Actually, JSON stringified code shouldn't have markdown wrappers *around* the content unless AI messed up.
      // We'll assume the code string is pure.
  }

  if (parsed.dependencies && parsed.dependencies.length > 0) {
      console.log(`✅ AI Identified Dependencies: ${parsed.dependencies.join(", ")}`);
  } else {
      console.log("⚠️ No dependencies identified by AI (or array empty).");
  }

  return parsed;
}