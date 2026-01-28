import dotenv from 'dotenv';
import { sendToAI } from '../src/core/ai/aiFactory.js';
import { sendToGroq } from '../src/core/ai/groqClient.js';
import { sendToGemini } from '../src/core/ai/geminiClient.js';

dotenv.config();

async function testProviders() {
    console.log("🚀 Testing AI Providers...");

    console.log("\n--- Testing Direct Gemini Client ---");
    const geminiResponse = await sendToGemini("Hello from Gemini test script! Say 'Gemini OK'");
    console.log("Gemini Response:", geminiResponse);

    console.log("\n--- Testing Direct Groq Client ---");
    // Using a model that is likely to exist or falling back to default
    // We explicitly pass a model here to avoid picking up 'gemini-2.0-flash' from .env if AI_PROVIDER is gemini
    const groqResponse = await sendToGroq("Hello from Groq test script! Say 'Groq OK'", "llama-3.1-8b-instant");
    console.log("Groq Response:", groqResponse);

    console.log("\n--- Testing Factory (Configured Provider) ---");
    console.log(`Current Provider: ${process.env.AI_PROVIDER}`);
    console.log(`Current Model: ${process.env.AI_MODEL}`);
    
    // Test factory
    const factoryResponse = await sendToAI("Hello from Factory! Say 'Factory OK'");
    console.log("Factory Response:", factoryResponse);
}

testProviders();
