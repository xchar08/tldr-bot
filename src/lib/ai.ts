import OpenAI from 'openai';
import { z } from 'zod';
import dotenv from 'dotenv';

// 1. Force load .env immediately
dotenv.config();

// 2. Define Schema
const ConfigSchema = z.object({
  NEBIUS_API_KEY: z.string().min(1, 'NEBIUS_API_KEY required'),
  NEBIUS_MODEL: z.string().default('meta-llama/Meta-Llama-3.1-8B-Instruct-fast'),
});

// 3. Parse & Sanitize Config
const rawConfig = {
  // .trim() is CRITICAL here based on your test results
  NEBIUS_API_KEY: process.env.NEBIUS_API_KEY?.trim(),
  NEBIUS_MODEL: process.env.NEBIUS_MODEL?.trim() || 'meta-llama/Meta-Llama-3.1-8B-Instruct-fast',
};

// 4. Validate
const config = ConfigSchema.parse(rawConfig);

console.log('✅ AI Service Initialized:', { 
  model: config.NEBIUS_MODEL, 
  keyValid: !!config.NEBIUS_API_KEY,
  keyLen: config.NEBIUS_API_KEY.length 
});

export class AiService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.NEBIUS_API_KEY,
      baseURL: 'https://api.studio.nebius.ai/v1/',
    });
  }

  async summarizeMessages(messages: string[], maxTokens = 250): Promise<string> {
    const prompt = `Summarize these Discord messages from a single user into 2-4 concise bullet points (TLDR style):\n\n${messages.slice(0, 20).join('\n')}\n\nTLDR:`;
    
    try {
      const response = await this.client.chat.completions.create({
        model: config.NEBIUS_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content?.trim() || 'No summary generated.';
    } catch (error: any) {
      console.error('❌ Nebius API Error:', error.status || 'Unknown', error.message);
      if (error.status === 401) return '⚠️ API Error: Unauthorized (401). Check API Key.';
      if (error.status === 404) return '⚠️ API Error: Model not found (404).';
      return '⚠️ AI Summary unavailable.';
    }
  }
}

export const aiService = new AiService();
