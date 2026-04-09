import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import dotenv from 'dotenv';
import pc from 'picocolors';
dotenv.config();

/**
 * safeInvoke - A robust wrapper that handles model failures by retrying
 * and eventually falling back to a secondary model (Flash).
 *
 * @param {Object} primaryModel - Primary AI model
 * @param {Object} fallbackModel - Secondary AI model (Flash)
 * @param {string|Object} prompt - Input prompt
 * @param {Object} options - Options (schema, maxRetries, etc.)
 */
export async function safeInvoke(
  primaryModel,
  fallbackModel = null,
  prompt,
  options = {}
) {
  const {
    schema = null,
    maxRetries = 3,
    initialDelayMs = 2000,
    onRetry = null,
    onFallback = null,
  } = options;

  let attempt = 0;
  let delayMs = initialDelayMs;

  while (attempt < maxRetries) {
    try {
      const model = schema
        ? primaryModel.withStructuredOutput(schema)
        : primaryModel;

      if (attempt > 0 && onRetry) {
        onRetry(attempt, maxRetries);
      }

      return await model.invoke(prompt);
    } catch (err) {
      attempt++;

      // If we still have retries left, wait and back off
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2; // Exponential backoff
      } else {
        // No more retries for primary model
        if (fallbackModel) {
          if (onFallback) onFallback();

          console.log(
            pc.yellow(
              `  ⚠  Model is currently overloaded. Switching to Gemini Flash to ensure continuity...`
            )
          );

          const fModel = schema
            ? fallbackModel.withStructuredOutput(schema)
            : fallbackModel;
          return await fModel.invoke(prompt);
        }

        // Rethrow if no fallback
        throw err;
      }
    }
  }
}

const PROVIDER = process.env.AI_PROVIDER || 'gemini';

export function createFastModel() {
  if (PROVIDER === 'groq') {
    return new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.AI_FAST_MODEL || 'llama-3.1-8b-instant',
      temperature: 0.1,
      maxRetries: 3,
    });
  }
  return new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.AI_FAST_MODEL || 'gemini-2.0-flash',
    temperature: 0.1,
    maxRetries: 3,
  });
}

export function createSmartModel() {
  if (PROVIDER === 'groq') {
    return new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.AI_SMART_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.2,
      maxRetries: 3,
    });
  }
  return new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.AI_SMART_MODEL || 'gemini-2.5-pro',
    temperature: 0.2,
    maxRetries: 3,
  });
}

export function createEmbeddings() {
  // Currently using Gemini Embeddings (available free with API Key)
  // If you want Groq: use OpenAIEmbeddings with Groq endpoint
  if (PROVIDER === 'gemini' || !process.env.GROQ_API_KEY) {
    return new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GEMINI_API_KEY,
      modelName: 'gemini-embedding-2-preview',
    });
  }

  // Fallback: use Gemini even with Groq (Groq has no independent embeddings)
  return new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    modelName: 'gemini-embedding-2-preview',
  });
}

export function createModelPair() {
  return {
    fastModel: createFastModel(),
    smartModel: createSmartModel(),
  };
}
