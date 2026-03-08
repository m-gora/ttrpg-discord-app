/**
 * Barrel export for the messaging module.
 */

export { type MessagingPort, type EventEnvelope, type MessageHandler, type Subscription } from "./port";
export { NatsAdapter, type NatsAdapterOptions } from "./nats-adapter";
export { Subjects } from "./events";
export type * from "./events";
