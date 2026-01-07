import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.NEBIUS_API_KEY!,
  baseURL: 'https://api.studio.nebius.ai/v1/',
});

async function listModels() {
  try {
    const models = await client.models.list();
    console.log('✅ Nebius Models for your API key:');
    models.data.slice(0, 20).forEach((model: any, i: number) => {
      console.log(`${i+1}. ${model.id}`);
    });
    console.log(`Total: ${models.data.length} models`);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.status === 404) console.log('✅ Use: meta-llama/Llama-3.1-8B-Instruct');
  }
}

listModels();
