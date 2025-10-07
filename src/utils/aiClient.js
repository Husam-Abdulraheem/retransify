import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
const convertingPrompt = path.join(
  process.cwd(),
  "/src/core/prompt/reactToNativePrompt.txt"
);

export async function sendToGemini(code) {
  try {
    const promptContent = fs.readFileSync(convertingPrompt, 'utf-8');
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ text: `${promptContent}\n\n${code}` }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              externalImports: { type: "array", items: { type: "string" } },
              forInstall: { type: "array", items: { type: "string" } },
              convertedCode: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["externalImports", "forInstall", "convertedCode"],
          },
        },
      },
    });

    return response.text;
  } catch (error) {
    console.error("❌ error connecting to Gemini:", error.message);
    throw error;
  }
}
