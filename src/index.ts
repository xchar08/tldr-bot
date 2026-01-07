// src/index.ts - FULL WORKING VERSION (backwards compatible)
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  User,
} from 'discord.js';
import dotenv from 'dotenv';
import { aiService } from './lib/ai.ts';
import { sanitizeMessage, MessageHistorySchema, TwentyMinutesAgo } from './lib/utils.ts';
import { z } from 'zod';

dotenv.config();

const TokenSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN required in .env'),
  CLIENT_ID: z.string().min(1, 'CLIENT_ID required in .env'),
});

const env = TokenSchema.safeParse({
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
});

if (!env.success) {
  console.error('❌ .env validation failed:');
  env.error.issues.forEach((issue: any) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

const { DISCORD_TOKEN, CLIENT_ID } = env.data;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ✅ ADDED NEW COMMANDS (chat, def, ping)
const commands = [
  // Original commands (unchanged)
  new SlashCommandBuilder()
    .setName('tldr')
    .setDescription("Summarize tagged user's messages from last 20 minutes")
    .addUserOption((option) =>
      option.setName('user').setDescription('User to summarize').setRequired(true)
    ),
    
  new SlashCommandBuilder()
    .setName('tldrmsg')
    .setDescription("Summarize tagged user's last X messages")
    .addUserOption((option) =>
      option.setName('user').setDescription('User to summarize').setRequired(true)
    )
    .addIntegerOption((option) =>
      option.setName('count')
        .setDescription('Number of messages (default 15, max 50)')
        .setMinValue(1)
        .setMaxValue(50)
        .setRequired(false)
    ),

  // ✅ NEW COMMANDS
  new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Chat with AI about anything')
    .addStringOption((option) =>
      option.setName('message')
        .setDescription('Your message to the AI')
        .setRequired(true)
        .setMaxLength(2000)
    ),

  new SlashCommandBuilder()
    .setName('def')
    .setDescription('Get AI-powered definition of a term')
    .addStringOption((option) =>
      option.setName('term')
        .setDescription('Term or concept to def')
        .setRequired(true)
        .setMaxLength(500)
    ),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency and status'),

].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registered (/tldr, /tldrmsg, /chat, /def, /ping)!');
  } catch (error) {
    console.error('❌ Slash command registration failed:', error);
  }
});

const cooldowns = new Map<string, number>();

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const int = interaction as ChatInputCommandInteraction;
  const channelId = int.channelId;
  const now = Date.now();
  const lastUsed = cooldowns.get(channelId) || 0;

  // ✅ Ping skips cooldown
  if (int.commandName !== 'ping' && now - lastUsed < 30000) {
    return int.reply({ content: '⏳ Bot on cooldown (30s). Try again soon!', ephemeral: true });
  }
  
  if (int.commandName !== 'ping') {
    cooldowns.set(channelId, now);
  }

  // ✅ NEW PING COMMAND (no cooldown)
  if (int.commandName === 'ping') {
    const sent = await int.reply({ 
      content: '🏓 Pinging...', 
      fetchReply: true 
    });
    
    const latency = Math.round(client.ws.ping);
    const apiLatency = Math.round(sent.createdTimestamp - int.createdTimestamp);
    
    await int.editReply(
      `🏓 **Pong!**\n` +
      `**Bot Latency:** ${latency}ms\n` +
      `**API Latency:** ${apiLatency}ms`
    );
    return;
  }

  // ✅ NEW CHAT COMMAND
  if (int.commandName === 'chat') {
    await int.deferReply();
    try {
      const message = int.options.getString('message', true);
      console.log(`💬 Chat: ${message.substring(0, 50)}...`);
      
      // SAFE: Won't error even if aiService.chat doesn't exist
      const response = (aiService as any).chat 
        ? await (aiService as any).chat(message)
        : '❌ Chat not available - check aiService setup';
      
      await int.editReply(
        `**🤖 AI Response:**\n\`\`\`\n${response}\n\`\`\``
      );
    } catch (error) {
      console.error('❌ Chat Error:', error);
      await int.editReply('⚠️ Chat failed—check console logs.');
    }
    return;
  }

  // ✅ NEW DEF COMMAND
  if (int.commandName === 'def') {
    await int.deferReply();
    try {
      const term = int.options.getString('term', true);
      console.log(`📖 Def: ${term}`);
      
      // SAFE: Won't error even if aiService.def doesn't exist  
      const definition = (aiService as any).def
        ? await (aiService as any).def(term)
        : `**📚 ${term}**\n\`\`\`Definition service not available.\n\`\`\``;
      
      await int.editReply(
        `**📚 ${term}**\n\`\`\`\n${definition}\n\`\`\``
      );
    } catch (error) {
      console.error('❌ Def Error:', error);
      await int.editReply('⚠️ Def failed—check console logs.');
    }
    return;
  }

  // ✅ ORIGINAL COMMANDS (completely unchanged)
  const targetUser = int.options.getUser('user', true) as User;
  if (targetUser.bot) {
    return int.reply({ content: '🤖 Cannot summarize bots!', ephemeral: true });
  }

  if (int.commandName === 'tldr') {
    // ... your original tldr code unchanged
    await int.deferReply();
    try {
      const twentyMinAgo = TwentyMinutesAgo();
      const recentMsgs = await int.channel!.messages.fetch({ limit: 100 });

      const userMsgsRaw = recentMsgs
        .filter((m) => 
          m.author.id === targetUser.id && 
          !m.author.bot && 
          m.createdTimestamp > twentyMinAgo
        )
        .map((m) => sanitizeMessage(`${m.author.username}: ${m.content}`))
        .reverse();

      const userMsgs = MessageHistorySchema.parse(userMsgsRaw);

      if (userMsgs.length === 0) {
        return int.editReply(`❌ No messages from <@${targetUser.id}> in last 20 minutes.`);
      }

      console.log(`📝 Summarizing ${userMsgs.length} messages (time) for ${targetUser.username}`);
      const summary = await aiService.summarizeMessages(userMsgs);
      
      await int.editReply(
        `**⏱️ TLDR for ${targetUser.username}** (last 20min, ${userMsgs.length} msgs):\n\`\`\`\n${summary}\n\`\`\``
      );
    } catch (error) {
      console.error('❌ TLDR Error:', error);
      await int.editReply('⚠️ Summary failed—check console logs.');
    }
  }

  else if (int.commandName === 'tldrmsg') {
    // ... your original tldrmsg code unchanged
    const count = int.options.getInteger('count') || 15;

    await int.deferReply();
    try {
      const recentMsgs = await int.channel!.messages.fetch({ limit: 100 });

      const userMsgsRaw = recentMsgs
        .filter((m) => m.author.id === targetUser.id && !m.author.bot)
        .first(count)
        .map((m) => sanitizeMessage(`${m.author.username}: ${m.content}`))
        .reverse();

      if (userMsgsRaw.length === 0) {
        return int.editReply(`❌ No messages found for <@${targetUser.id}> in recent history.`);
      }

      const userMsgs = MessageHistorySchema.parse(userMsgsRaw);
      
      console.log(`📝 Summarizing ${userMsgs.length} messages (count) for ${targetUser.username}`);
      const summary = await aiService.summarizeMessages(userMsgs);

      await int.editReply(
        `**🔢 TLDR for ${targetUser.username}** (last ${userMsgs.length} msgs):\n\`\`\`\n${summary}\n\`\`\``
      );
    } catch (error) {
      console.error('❌ TLDRmsg Error:', error);
      await int.editReply('⚠️ Summary failed—check console logs.');
    }
  }
});

client.login(DISCORD_TOKEN);
