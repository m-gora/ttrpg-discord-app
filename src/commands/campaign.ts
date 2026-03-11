import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { randomUUID } from "node:crypto";
import {
  getChannelCampaigns,
  type Campaign,
} from "../campaigns";
import { CONFIG } from "../config";
import type { MessagingPort } from "../messaging/port";
import { Subjects } from "../messaging/events";
import type {
  CampaignCreateRequestedEvent,
  CampaignEditRequestedEvent,
  CampaignDeleteRequestedEvent,
} from "../messaging/events";

export const data = new SlashCommandBuilder()
  .setName("campaign")
  .setDescription("Manage TTRPG campaigns for this channel")
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
      .addIntegerOption((opt) =>
        opt
          .setName("players")
          .setDescription("Total number of players + GM")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(20),
      )
      .addStringOption((opt) =>
        opt
          .setName("vtt")
          .setDescription("Link to the VTT (Foundry, Roll20, etc.)")
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("timezone")
          .setDescription(`IANA timezone, e.g. Europe/Rome (default: ${CONFIG.DEFAULT_TIMEZONE})`)
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
      )
      .addIntegerOption((opt) =>
        opt
          .setName("players")
          .setDescription("New total number of players + GM")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(20),
      )
      .addStringOption((opt) =>
        opt
          .setName("timezone")
          .setDescription("New IANA timezone, e.g. Europe/Rome")
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

export async function execute(
  interaction: ChatInputCommandInteraction,
  messaging?: MessagingPort,
) {
  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    await handleCreate(interaction, messaging);
  } else if (sub === "edit") {
    await handleEdit(interaction, messaging);
  } else if (sub === "list") {
    await handleList(interaction);
  } else if (sub === "delete") {
    await handleDelete(interaction, messaging);
  }
}

// ── Create ────────────────────────────────────────────────

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  messaging?: MessagingPort,
) {
  if (!messaging) {
    await interaction.reply({
      content: "❌ Messaging is not configured — campaign creation requires NATS.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const name = interaction.options.getString("name", true);
  const vtt = interaction.options.getString("vtt") ?? "";
  const playerCount = interaction.options.getInteger("players", true);
  const timezone = interaction.options.getString("timezone") ?? CONFIG.DEFAULT_TIMEZONE;

  const campaign: Campaign = {
    id: randomUUID().slice(0, 8),
    channelId: interaction.channelId,
    guildId: interaction.guildId!,
    name,
    vttLink: vtt,
    playerCount,
    sessionCounter: 0,
    createdBy: interaction.user.id,
    timezone,
  };

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await messaging.publish<CampaignCreateRequestedEvent>(
    Subjects.CAMPAIGN_CREATE_REQUESTED,
    {
      campaign,
      createdByDisplayName: interaction.user.displayName,
      interactionToken: interaction.token,
      applicationId: interaction.applicationId,
    },
  );
}

// ── Edit ──────────────────────────────────────────────────

async function handleEdit(
  interaction: ChatInputCommandInteraction,
  messaging?: MessagingPort,
) {
  if (!messaging) {
    await interaction.reply({
      content: "❌ Messaging is not configured — campaign editing requires NATS.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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
  const newPlayerCount = interaction.options.getInteger("players");
  const newTimezone = interaction.options.getString("timezone");

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await messaging.publish<CampaignEditRequestedEvent>(
    Subjects.CAMPAIGN_EDIT_REQUESTED,
    {
      campaignId: id,
      channelId: interaction.channelId,
      newName,
      newVtt,
      newPlayerCount,
      newTimezone,
      interactionToken: interaction.token,
      applicationId: interaction.applicationId,
    },
  );
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
          const tz = c.timezone ? `🕐 ${c.timezone}` : "🕐 UTC";
          const players = c.playerCount ? `${c.playerCount} players` : "*(no player count)*";
          return `**${c.name}** — ${c.sessionCounter} session(s) · ${players}\n${vtt} | ${tz} | ID: \`${c.id}\``;
        })
        .join("\n\n"),
    );

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ── Delete ────────────────────────────────────────────────

async function handleDelete(
  interaction: ChatInputCommandInteraction,
  messaging?: MessagingPort,
) {
  if (!messaging) {
    await interaction.reply({
      content: "❌ Messaging is not configured — campaign deletion requires NATS.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await messaging.publish<CampaignDeleteRequestedEvent>(
    Subjects.CAMPAIGN_DELETE_REQUESTED,
    {
      campaignId: id,
      channelId: interaction.channelId,
      deletedBy: interaction.user.id,
      interactionToken: interaction.token,
      applicationId: interaction.applicationId,
    },
  );
}
