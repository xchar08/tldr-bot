import { REST, Routes, SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const commands = [
  new SlashCommandBuilder().setName('tldr').setDescription("Summarize tagged user's messages (20m)").addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
  new SlashCommandBuilder().setName('tldrmsg').setDescription("Summarize tagged user's last X messages").addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)).addIntegerOption((o) => o.setName('count').setDescription('Count')),
  new SlashCommandBuilder().setName('chat').setDescription('Chat with AI').addStringOption((o) => o.setName('message').setDescription('Message').setRequired(true)),
  new SlashCommandBuilder().setName('def').setDescription('Define a term').addStringOption((o) => o.setName('term').setDescription('Term').setRequired(true)),
  new SlashCommandBuilder().setName('ping').setDescription('Check latency'),
  
  // THE IMPORTANT ONE
  new ContextMenuCommandBuilder()
    .setName('Summarize Link')
    .setType(ApplicationCommandType.Message),
].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    // Explicitly using the CLIENT_ID from env
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID!), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
