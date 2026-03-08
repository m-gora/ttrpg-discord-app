/**
 * NATS JetStream adapter — implements the MessagingPort interface.
 *
 * Uses JetStream for durable, replayable event delivery so that events
 * produced while a consumer is down are replayed once it reconnects.
 */

import {
  connect,
  type NatsConnection,
  type JetStreamClient,
  type JetStreamManager,
  StringCodec,
  AckPolicy,
  DeliverPolicy,
  type ConsumerConfig,
} from "nats";
import { randomUUID } from "node:crypto";
import type {
  MessagingPort,
  EventEnvelope,
  MessageHandler,
  Subscription,
} from "./port";

const sc = StringCodec();

/** Name of the single JetStream stream that backs all app events */
const STREAM_NAME = "TTRPG_EVENTS";

/** Subjects the stream captures (wildcard: everything under ttrpg.>) */
const STREAM_SUBJECTS = ["session.>", "campaign.>", "rsvp.>", "reminder.>", "reschedule.>"];

export interface NatsAdapterOptions {
  /** NATS server URL, e.g. "nats://nats.ttrpg.svc:4222" */
  url: string;
  /** Optional client name shown in NATS monitoring */
  name?: string;
}

export class NatsAdapter implements MessagingPort {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;
  private readonly url: string;
  private readonly clientName: string;

  constructor(opts: NatsAdapterOptions) {
    this.url = opts.url;
    this.clientName = opts.name ?? "ttrpg-discord-app";
  }

  // ── Connection ────────────────────────────────────────

  async connect(): Promise<void> {
    this.nc = await connect({
      servers: this.url,
      name: this.clientName,
    });

    console.log(`[nats] Connected to ${this.nc.getServer()}`);

    this.jsm = await this.nc.jetstreamManager();
    this.js = this.nc.jetstream();

    await this.ensureStream();
  }

  async disconnect(): Promise<void> {
    if (this.nc) {
      await this.nc.drain();
      console.log("[nats] Connection drained and closed");
      this.nc = null;
      this.js = null;
      this.jsm = null;
    }
  }

  // ── Publish ───────────────────────────────────────────

  async publish<T>(subject: string, data: T): Promise<void> {
    if (!this.js) throw new Error("[nats] Not connected — call connect() first");

    const envelope: EventEnvelope<T> = {
      id: randomUUID(),
      subject,
      timestamp: new Date().toISOString(),
      data,
    };

    await this.js.publish(subject, sc.encode(JSON.stringify(envelope)));
  }

  // ── Subscribe ─────────────────────────────────────────

  async subscribe<T>(
    subject: string,
    durableName: string,
    handler: MessageHandler<T>,
  ): Promise<Subscription> {
    if (!this.js || !this.jsm)
      throw new Error("[nats] Not connected — call connect() first");

    // Ensure a durable consumer exists for this subscription
    const consumerCfg: Partial<ConsumerConfig> = {
      durable_name: durableName,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All, // replay everything on first attach
      filter_subject: subject,
    };

    try {
      await this.jsm.consumers.add(STREAM_NAME, consumerCfg);
    } catch {
      // Consumer may already exist — that's fine
    }

    const consumer = await this.js.consumers.get(STREAM_NAME, durableName);
    const messages = await consumer.consume();

    // Process messages in the background
    (async () => {
      for await (const msg of messages) {
        try {
          const envelope = JSON.parse(sc.decode(msg.data)) as EventEnvelope<T>;
          await handler(envelope);
          msg.ack();
        } catch (err) {
          console.error(`[nats] Error processing ${subject}:`, err);
          // NAK so the message is redelivered later
          msg.nak();
        }
      }
    })();

    return {
      async unsubscribe() {
        messages.stop();
      },
    };
  }

  // ── Internals ─────────────────────────────────────────

  private async ensureStream(): Promise<void> {
    if (!this.jsm) return;

    try {
      await this.jsm.streams.info(STREAM_NAME);
      console.log(`[nats] Stream "${STREAM_NAME}" already exists`);
    } catch {
      await this.jsm.streams.add({
        name: STREAM_NAME,
        subjects: STREAM_SUBJECTS,
        retention: "limits" as any,
        max_bytes: 256 * 1024 * 1024, // 256 MB — must be less than JetStream max_file
        max_age: 30 * 24 * 60 * 60 * 1_000_000_000, // 30 days in nanos
        storage: "file" as any,
        num_replicas: 1,
      });
      console.log(`[nats] Stream "${STREAM_NAME}" created`);
    }
  }
}
