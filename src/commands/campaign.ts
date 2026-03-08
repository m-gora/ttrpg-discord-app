import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
  MessageFlags,
} from "discord.js";
import { randomUUID } from "node:crypto";
import {
  addCampaign,
  getChannelCampaigns,
  updateCampaign,
  removeCampaign,
  type Campaign,
} from "../campaigns";

export const data = new SlashCommandBuilder()
  .setName("campaign")
  .setDescription("Manage TTRPG campaigns for this channel")
  .setIntegrationTypes(
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  )
  .setContexts(
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  )
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Register a new campaign in this channel")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription('Campaign name, e.g. "Curse of Strahd"')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("vtt")
          .setDescription("Link to the VTT (Foundry, Roll20, etc.)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("edit")
      .setDescription("Edit an existing campaign")
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("Campaign ID (use /campaign list to find it)")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("New campaign name")
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("vtt")
          .setDescription("New VTT link")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List campaigns in this channel"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("Delete a campaign")
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("Campaign ID (use /campaign list to find it)")
          .setRequired(true),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    await handleCreate(interaction);
  } else if (sub === "edit") {
    await handleEdit(interaction);
  } else if (sub === "list") {
    await handleList(interaction);
  } else if (sub === "delete") {
    await handleDelete(interaction);
  }
}

// ── Create ────────────────────────────────────────────────

async function handleCreate(interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString("name", true);
  const vtt = interaction.options.getString("vtt") ?? "";

  const campaign: Campaign = {
    id: randomUUID().slice(0, 8),
    channelId: interaction.channelId,
    guildId: interaction.guildId ?? "",
    name,
    vttLink: vtt,
    sessionCounter: 0,
    createdBy: interaction.user.id,
  };

  await addCampaign(campaign);

  const embed = new EmbedBuilder()
    .setTitle("📖 Campaign Created")
    .setColor(0x5865f2)
    .addFields(
      { name: "Name", value: campaign.name, inline: true },
      { name: "ID", value: `\`${campaign.id}\``, inline: true },
      { name: "VTT", value: campaign.vttLink || "*not set*", inline: true },
      { name: "Sessions so far", value: "0", inline: true },
    )
    .setFooter({ text: `Created by ${interaction.user.displayName}` });

  await interaction.reply({ embeds: [embed] });
}

// ── Edit ──────────────────────────────────────────────────

async function handleEdit(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString("id", true);
  const campaigns = await getChannelCampaigns(interaction.channelId);
  const campaign = campaigns.find((c) => c.id === id);

  if (!campaign) {
    await interaction.reply({
      content: "❌ Campaign not found in this channel. Use `/campaign list`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const newName = interaction.options.getString("name");
  const newVtt = interaction.options.getString("vtt");

  if (newName) campaign.name = newName;
  if (newVtt !== null && newVtt !== undefined) campaign.vttLink = newVtt;

  await updateCampaign(campaign);

  const embed = new EmbedBuilder()
    .setTitle("✏️ Campaign Updated")
    .setColor(0x57f287)
    .addFields(
      { name: "Name", value: campaign.name, inline: true },
      { name: "VTT", value: campaign.vttLink || "*not set*", inline: true },
    );

  await interaction.reply({ embeds: [embed] });
}

// ── List ──────────────────────────────────────────────────

async function handleList(interaction: ChatInputCommandInteraction) {
  const campaigns = await getChannelCampaigns(interaction.channelId);

  if (campaigns.length === 0) {
    await interaction.reply({
      content: "📭 No campaigns in this channel. Use `/campaign create` to add one!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📖 Campaigns")
    .setColor(0x5865f2)
    .setDescription(
      campaigns
        .map((c) => {
          const vtt = c.vttLink ? `🔗 [VTT](${c.vttLink})` : "*(no VTT link)*";
          return `**${c.name}** — ${c.sessionCounter} session(s)\n${vtt} | ID: \`${c.id}\``;
        })
        .join("\n\n"),
    );

  await interaction.reply({ embeds: [embed] });
}

// ── Delete ────────────────────────────────────────────────

async function handleDelete(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString("id", true);
  const campaigns = await getChannelCampaigns(interaction.channelId);
  const campaign = campaigns.find((c) => c.id === id);

  if (!campaign) {
    await interaction.reply({
      content: "❌ Campaign not found in this channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await removeCampaign(id);
  await interaction.reply(`🗑️ Campaign **${campaign.name}** has been deleted.`);
}
