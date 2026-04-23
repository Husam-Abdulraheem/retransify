import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import dotenv from 'dotenv';
dotenv.config();

const PROVIDER = process.env.AI_PROVIDER || 'gemini';

export function createFastModel() {
  if (PROVIDER === 'groq') {
    return new ChatGroq({
      model: process.env.AI_FAST_MODEL || 'llama-3.1-8b-instant',
      temperature: 0,
      maxRetries: 3,
    });
  }
  return new ChatGoogleGenerativeAI({
    model: process.env.AI_FAST_MODEL || 'gemini-2.5-flash-lite',
    temperature: 0,
    maxRetries: 3,
  });
}

export function createSmartModel() {
  if (PROVIDER === 'groq') {
    return new ChatGroq({
      model: process.env.AI_SMART_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0,
      maxRetries: 3,
    });
  }
  return new ChatGoogleGenerativeAI({
    model: process.env.AI_SMART_MODEL || 'gemini-2.5-pro',
    temperature: 0,
    maxRetries: 6,
  });
}

export function createEmbeddings() {
  // Currently using Gemini Embeddings (available free with API Key)
  // If you want Groq: use OpenAIEmbeddings with Groq endpoint
  if (PROVIDER === 'gemini' || !process.env.GROQ_API_KEY) {
    return new GoogleGenerativeAIEmbeddings({
      modelName: 'gemini-embedding-2-preview',
    });
  }

  // Fallback: use Gemini even with Groq (Groq has no independent embeddings)
  return new GoogleGenerativeAIEmbeddings({
    modelName: 'gemini-embedding-2-preview',
  });
}

export function createModelPair() {
  return {
    fastModel: createFastModel(),
    smartModel: createSmartModel(),
  };
}
