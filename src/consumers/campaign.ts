/**
 * Consumers for campaign command events:
 *   - campaign.create.requested
 *   - campaign.edit.requested
 *   - campaign.delete.requested
 */

import { REST, EmbedBuilder } from "discord.js";
import {
  addCampaign,
  getChannelCampaigns,
  updateCampaign,
  removeCampaign,
} from "../campaigns";
import { Subjects } from "../messaging/events";
import type {
  CampaignCreateRequestedEvent,
  CampaignEditRequestedEvent,
  CampaignDeleteRequestedEvent,
  CampaignCreatedEvent,
  CampaignUpdatedEvent,
  CampaignDeletedEvent,
} from "../messaging/events";
import type { MessagingPort, EventEnvelope } from "../messaging/port";

const CREATE_CONSUMER = "campaign-create-handler";
const EDIT_CONSUMER = "campaign-edit-handler";
const DELETE_CONSUMER = "campaign-delete-handler";

export async function startCampaignConsumers(messaging: MessagingPort): Promise<void> {
  // ── Create ──────────────────────────────────────────────

  await messaging.subscribe<CampaignCreateRequestedEvent>(
    Subjects.CAMPAIGN_CREATE_REQUESTED,
    CREATE_CONSUMER,
    async (envelope: EventEnvelope<CampaignCreateRequestedEvent>) => {
      const { campaign, createdByDisplayName, interactionToken, applicationId } =
        envelope.data;

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
        .setFooter({ text: `Created by ${createdByDisplayName}` });

      await editDeferredReply(applicationId, interactionToken, {
        embeds: [embed.toJSON()],
      });

      await messaging.publish<CampaignCreatedEvent>(Subjects.CAMPAIGN_CREATED, {
        campaign,
      });

      console.log(`[consumer] Campaign created: ${campaign.name} (${campaign.id})`);
    },
  );

  console.log(`[consumer] ${CREATE_CONSUMER} subscribed to ${Subjects.CAMPAIGN_CREATE_REQUESTED}`);

  // ── Edit ────────────────────────────────────────────────

  await messaging.subscribe<CampaignEditRequestedEvent>(
    Subjects.CAMPAIGN_EDIT_REQUESTED,
    EDIT_CONSUMER,
    async (envelope: EventEnvelope<CampaignEditRequestedEvent>) => {
      const { campaignId, channelId, newName, newVtt, interactionToken, applicationId } =
        envelope.data;

      const campaigns = await getChannelCampaigns(channelId);
      const campaign = campaigns.find((c) => c.id === campaignId);

      if (!campaign) {
        await editDeferredReply(applicationId, interactionToken, {
          content: "❌ Campaign not found (it may have been deleted).",
        });
        return;
      }

      if (newName) campaign.name = newName;
      if (newVtt !== null && newVtt !== undefined) campaign.vttLink = newVtt;

      const updatedFields: string[] = [];
      if (newName) updatedFields.push("name");
      if (newVtt !== null && newVtt !== undefined) updatedFields.push("vttLink");

      await updateCampaign(campaign);

      const embed = new EmbedBuilder()
        .setTitle("✏️ Campaign Updated")
        .setColor(0x57f287)
        .addFields(
          { name: "Name", value: campaign.name, inline: true },
          { name: "VTT", value: campaign.vttLink || "*not set*", inline: true },
        );

      await editDeferredReply(applicationId, interactionToken, {
        embeds: [embed.toJSON()],
      });

      await messaging.publish<CampaignUpdatedEvent>(Subjects.CAMPAIGN_UPDATED, {
        campaign,
        updatedFields,
      });

      console.log(`[consumer] Campaign updated: ${campaign.name} (${campaignId})`);
    },
  );

  console.log(`[consumer] ${EDIT_CONSUMER} subscribed to ${Subjects.CAMPAIGN_EDIT_REQUESTED}`);

  // ── Delete ──────────────────────────────────────────────

  await messaging.subscribe<CampaignDeleteRequestedEvent>(
    Subjects.CAMPAIGN_DELETE_REQUESTED,
    DELETE_CONSUMER,
    async (envelope: EventEnvelope<CampaignDeleteRequestedEvent>) => {
      const { campaignId, channelId, deletedBy, interactionToken, applicationId } =
        envelope.data;

      const campaigns = await getChannelCampaigns(channelId);
      const campaign = campaigns.find((c) => c.id === campaignId);

      if (!campaign) {
        await editDeferredReply(applicationId, interactionToken, {
          content: "❌ Campaign not found (it may have been deleted already).",
        });
        return;
      }

      await removeCampaign(campaignId);

      await editDeferredReply(applicationId, interactionToken, {
        content: `🗑️ Campaign **${campaign.name}** has been deleted.`,
      });

      await messaging.publish<CampaignDeletedEvent>(Subjects.CAMPAIGN_DELETED, {
        campaignId,
        name: campaign.name,
        deletedBy,
      });

      console.log(`[consumer] Campaign deleted: ${campaign.name} (${campaignId})`);
    },
  );

  console.log(`[consumer] ${DELETE_CONSUMER} subscribed to ${Subjects.CAMPAIGN_DELETE_REQUESTED}`);
}

async function editDeferredReply(
  applicationId: string,
  interactionToken: string,
  body: Record<string, unknown>,
): Promise<void> {
  const rest = new REST({ version: "10" });
  const url = `/webhooks/${applicationId}/${interactionToken}/messages/@original` as const;
  await rest.patch(url, { body, auth: false });
}
