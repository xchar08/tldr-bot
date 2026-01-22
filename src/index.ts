import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,      // <--- ADDED
  ApplicationCommandType,         // <--- ADDED
  MessageContextMenuCommandInteraction, // <--- ADDED
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

// ✅ REGISTER ALL 6 COMMANDS (5 Slash + 1 Context Menu)
const commands = [
  // 1. Original tldr command
  new SlashCommandBuilder()
    .setName('tldr')
    .setDescription("Summarize tagged user's messages from last 20 minutes")
    .addUserOption((option) =>
      option.setName('user').setDescription('User to summarize').setRequired(true)
    ),
    
  // 2. Original tldrmsg command
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

  // 3. Chat command
  new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Chat with AI about anything')
    .addStringOption((option) =>
      option.setName('message')
        .setDescription('Your message to the AI')
        .setRequired(true)
        .setMaxLength(2000)
    ),

  // 4. Define command
  new SlashCommandBuilder()
    .setName('def')
    .setDescription('Get AI-powered definition of a term')
    .addStringOption((option) =>
      option.setName('term')
        .setDescription('Term or concept to define')
        .setRequired(true)
        .setMaxLength(500)
    ),

  // 5. Ping command
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency and status'),

  // 6. NEW: Context Menu (Summarize Link)
  new ContextMenuCommandBuilder()
    .setName('Summarize Link')
    .setType(ApplicationCommandType.Message),

].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
  try {
    // This registers the commands immediately when the bot starts
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ All commands registered (Slash + Context Menu)!');
  } catch (error) {
    console.error('❌ Command registration failed:', error);
  }
});

const cooldowns = new Map<string, number>();

client.on('interactionCreate', async (interaction) => {
  
  // ------------------------------------------------------------------
  // 1. HANDLE CONTEXT MENUS (Right Click)
  // ------------------------------------------------------------------
  if (interaction.isMessageContextMenuCommand()) {
    const int = interaction as MessageContextMenuCommandInteraction;

    if (int.commandName === 'Summarize Link') {
      await int.deferReply({ ephemeral: true }); // Only you see the summary
      try {
        const targetMessage = int.targetMessage;
        const content = targetMessage.content;
        
        // Extract URL using regex
        const urlMatch = content.match(/https?:\/\/[^\s]+/);
        if (!urlMatch) {
          await int.editReply('❌ No link found in this message.');
          return;
        }

        const url = urlMatch[0];
        console.log(`🔗 Summarizing Link: ${url}`);

        // Call AI Service (using 'any' cast in case interface isn't updated yet)
        const summary = (aiService as any).summarizeLink 
          ? await (aiService as any).summarizeLink(url) 
          : "⚠️ `summarizeLink` function missing in ai.ts";

        await int.editReply(`**🔗 Link Summary:**\n${summary}`);
      } catch (error) {
        console.error('❌ Link Summary Error:', error);
        await int.editReply('⚠️ Failed to summarize link.');
      }
    }
    return; // Stop here for context menus
  }

  // ------------------------------------------------------------------
  // 2. HANDLE SLASH COMMANDS
  // ------------------------------------------------------------------
  if (!interaction.isChatInputCommand()) return;

  const int = interaction as ChatInputCommandInteraction;
  const channelId = int.channelId;
  const now = Date.now();
  const lastUsed = cooldowns.get(channelId) || 0;

  // Global Cooldown (except ping)
  if (int.commandName !== 'ping' && now - lastUsed < 30000) {
    return int.reply({ content: '⏳ Bot on cooldown (30s). Try again soon!', ephemeral: true });
  }
  
  if (int.commandName !== 'ping') {
    cooldowns.set(channelId, now);
  }

  // --- SLASH COMMAND HANDLERS ---

  // PING
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

  // CHAT
  if (int.commandName === 'chat') {
    await int.deferReply();
    try {
      const message = int.options.getString('message', true);
      console.log(`💬 Chat: ${message.substring(0, 50)}...`);
      
      const response = (aiService as any).chat 
        ? await (aiService as any).chat(message)
        : '❌ Chat function not found in AiService.';
      
      await int.editReply(
        `**🤖 AI Response:**\n\`\`\`\n${response}\n\`\`\``
      );
    } catch (error) {
      console.error('❌ Chat Error:', error);
      await int.editReply('⚠️ Chat failed—check console logs.');
    }
    return;
  }

  // DEF
  if (int.commandName === 'def') {
    await int.deferReply();
    try {
      const term = int.options.getString('term', true);
      console.log(`📖 Def: ${term}`);
      
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

  // TLDR / TLDRMSG
  const targetUser = int.options.getUser('user');
  
  if ((int.commandName === 'tldr' || int.commandName === 'tldrmsg') && !targetUser) {
    return int.reply({ content: '❌ User argument required.', ephemeral: true });
  }

  if (targetUser?.bot) {
    return int.reply({ content: '🤖 Cannot summarize bots!', ephemeral: true });
  }

  // TLDR (Time based)
  if (int.commandName === 'tldr' && targetUser) {
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

  // TLDRMSG (Count based)
  else if (int.commandName === 'tldrmsg' && targetUser) {
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
