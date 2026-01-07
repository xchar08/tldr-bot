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

// Define Commands
const commands = [
  // Original Time-Based Command
  new SlashCommandBuilder()
    .setName('tldr')
    .setDescription("Summarize tagged user's messages from last 20 minutes")
    .addUserOption((option) =>
      option.setName('user').setDescription('User to summarize').setRequired(true)
    ),
    
  // New Count-Based Command
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
        .setRequired(false) // Optional, defaults to 15
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registered (/tldr, /tldrmsg)!');
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

  // Shared Cooldown (30s)
  if (now - lastUsed < 30000) {
    return int.reply({ content: '⏳ Bot on cooldown (30s). Try again soon!', ephemeral: true });
  }
  cooldowns.set(channelId, now);

  const targetUser = int.options.getUser('user', true) as User;
  if (targetUser.bot) {
    return int.reply({ content: '🤖 Cannot summarize bots!', ephemeral: true });
  }

  // Handle /tldr (Time-based)
  if (int.commandName === 'tldr') {
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
        .reverse(); // Oldest first for context

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

  // Handle /tldrmsg (Count-based)
  else if (int.commandName === 'tldrmsg') {
    const count = int.options.getInteger('count') || 15; // Default 15

    await int.deferReply();
    try {
      // Fetch more messages to ensure we find enough from the specific user
      const recentMsgs = await int.channel!.messages.fetch({ limit: 100 });

      const userMsgsRaw = recentMsgs
        .filter((m) => m.author.id === targetUser.id && !m.author.bot) // Filter by user
        .first(count) // Take the most recent X
        .map((m) => sanitizeMessage(`${m.author.username}: ${m.content}`))
        .reverse(); // Chronological order for AI

      // Validation
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
