// ./lib/ai.ts - FULL UPDATED VERSION (adds chat + def)
import OpenAI from 'openai';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Debugging: Check for conflicting env vars
console.log('[DEBUG] Env Vars Check:', {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'Set (Might conflict)' : 'Unset',
  NEBIUS_KEY_LEN: process.env.NEBIUS_API_KEY?.length
});

const ConfigSchema = z.object({
  NEBIUS_API_KEY: z.string().min(1, 'NEBIUS_API_KEY required'),
  NEBIUS_MODEL: z.string().default('meta-llama/Meta-Llama-3.1-8B-Instruct-fast'),
});

const config = ConfigSchema.parse({
  NEBIUS_API_KEY: process.env.NEBIUS_API_KEY?.trim(),
  NEBIUS_MODEL: process.env.NEBIUS_MODEL?.trim() || 'meta-llama/Meta-Llama-3.1-8B-Instruct-fast',
});

export class AiService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.NEBIUS_API_KEY,
      baseURL: 'https://api.studio.nebius.ai/v1/',
      dangerouslyAllowBrowser: true,
    });
  }

  // ✅ YOUR ORIGINAL summarizeMessages (UNCHANGED)
  async summarizeMessages(messages: string[], maxTokens = 250): Promise<string> {
    const prompt = `Summarize these messages (TLDR):\n\n${messages.slice(0, 15).join('\n')}\n\nTLDR:`;
    
    try {
      console.log(`[DEBUG] Requesting ${config.NEBIUS_MODEL}...`);
      
      const response = await this.client.chat.completions.create({
        model: config.NEBIUS_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content?.trim() || 'No summary.';
    } catch (error: any) {
      console.error('❌ Nebius API Error:', error.status, error.message);
      
      if (error.status === 401) {
        console.log('⚠️ 401 detected. Attempting raw fetch fallback...');
        return this.rawFetchFallback(messages, maxTokens);
      }
      return '⚠️ AI Summary unavailable.';
    }
  }

  // ✅ NEW: chat command
  async chat(message: string, maxTokens = 1000): Promise<string> {
    const systemPrompt = `You are a helpful, concise Discord bot assistant. 
    Answer directly without unnecessary fluff or greetings.`;

    try {
      console.log(`[DEBUG] Chat request: ${message.substring(0, 50)}...`);
      
      const response = await this.client.chat.completions.create({
        model: config.NEBIUS_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      });
      
      return response.choices[0]?.message?.content?.trim() || 'No response.';
    } catch (error: any) {
      console.error('❌ Chat API Error:', error.status, error.message);
      
      if (error.status === 401) {
        return this.rawChatFallback(message);
      }
      return '⚠️ Chat unavailable.';
    }
  }

  // ✅ NEW: def command  
  async def(term: string, maxTokens = 400): Promise<string> {
    const systemPrompt = `You are a technical dictionary. For each term respond with:
    1. **Definition**: 1 clear sentence
    2. **Example**: 1 brief real-world use  
    3. **Key Fact**: 1 important distinction/note
    
    Format cleanly. Be precise and concise.`;

    try {
      console.log(`[DEBUG] Def request: ${term}`);
      
      const response = await this.client.chat.completions.create({
        model: config.NEBIUS_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: term }
        ],
        max_tokens: maxTokens,
        temperature: 0.2, // Low temp for factual accuracy
      });
      
      return response.choices[0]?.message?.content?.trim() || `No definition for "${term}".`;
    } catch (error: any) {
      console.error('❌ Def API Error:', error.status, error.message);
      
      if (error.status === 401) {
        return this.rawDefFallback(term);
      }
      return `⚠️ Definition unavailable for "${term}".`;
    }
  }

  // ✅ UPDATED: Raw fallback now supports chat + def
  private async rawFetchFallback(messages: string[], maxTokens: number): Promise<string> {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('https://api.studio.nebius.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.NEBIUS_API_KEY}`
        },
        body: JSON.stringify({
          model: config.NEBIUS_MODEL,
          messages: [{ role: 'user', content: `Summarize:\n${messages.slice(0, 10).join('\n')}` }],
          max_tokens: maxTokens,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[Fallback] Raw Fetch Failed: ${response.status} - ${text}`);
        return `⚠️ API Error (Fallback): ${response.status}`;
      }

      const data: any = await response.json();
      return data.choices[0]?.message?.content?.trim() || 'No summary (fallback).';
    } catch (err) {
      console.error('[Fallback] Fetch Error:', err);
      return '⚠️ AI Service completely unreachable.';
    }
  }

  private async rawChatFallback(message: string): Promise<string> {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('https://api.studio.nebius.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.NEBIUS_API_KEY}`
        },
        body: JSON.stringify({
          model: config.NEBIUS_MODEL,
          messages: [
            { role: 'system', content: 'Helpful concise assistant.' },
            { role: 'user', content: message }
          ],
          max_tokens: 1000,
          temperature: 0.7
        })
      });

      if (!response.ok) return `⚠️ Chat fallback failed: ${response.status}`;
      
      const data: any = await response.json();
      return data.choices[0]?.message?.content?.trim() || 'No response.';
    } catch (err) {
      return '⚠️ Chat fallback failed.';
    }
  }

  private async rawDefFallback(term: string): Promise<string> {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('https://api.studio.nebius.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.NEBIUS_API_KEY}`
        },
        body: JSON.stringify({
          model: config.NEBIUS_MODEL,
          messages: [
            { role: 'system', content: 'Technical dictionary. 1 definition + 1 example + 1 fact.' },
            { role: 'user', content: term }
          ],
          max_tokens: 400,
          temperature: 0.2
        })
      });

      if (!response.ok) return `⚠️ Def fallback failed: ${response.status}`;
      
      const data: any = await response.json();
      return data.choices[0]?.message?.content?.trim() || 'No definition.';
    } catch (err) {
      return '⚠️ Def fallback failed.';
    }
  }
}

export const aiService = new AiService();
