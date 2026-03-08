/**
 * Messaging port — the application's contract for event publishing and subscribing.
 *
 * Any adapter (NATS, Redis Streams, Kafka, in-memory, …) must implement this
 * interface so the rest of the app stays transport-agnostic.
 */

/** Metadata attached to every published event */
export interface EventEnvelope<T = unknown> {
  /** Unique event ID (typically a UUID) */
  id: string;
  /** Dot-delimited subject, e.g. "session.created" */
  subject: string;
  /** ISO-8601 timestamp of when the event was produced */
  timestamp: string;
  /** The domain payload */
  data: T;
}

/** Callback invoked when a message arrives */
export type MessageHandler<T = unknown> = (envelope: EventEnvelope<T>) => Promise<void>;

/** Subscription handle — call `unsubscribe()` to stop receiving messages */
export interface Subscription {
  unsubscribe(): Promise<void>;
}

/**
 * The messaging port that the application depends on.
 *
 * Adapters are responsible for:
 *   • serialization / deserialization
 *   • durable delivery (JetStream, consumer groups, etc.)
 *   • reconnection & back-pressure
 */
export interface MessagingPort {
  /** Open the connection to the underlying transport */
  connect(): Promise<void>;

  /**
   * Publish an event.
   * @param subject  Dot-delimited subject (e.g. "session.created")
   * @param data     Serializable payload
   */
  publish<T>(subject: string, data: T): Promise<void>;

  /**
   * Subscribe to events matching `subject` (may include wildcards).
   * @param subject   Subject or pattern (e.g. "session.>" for all session events)
   * @param durableName  Durable consumer / group name — survives restarts
   * @param handler   Async callback for each incoming message
   */
  subscribe<T>(
    subject: string,
    durableName: string,
    handler: MessageHandler<T>,
  ): Promise<Subscription>;

  /** Gracefully drain and close the connection */
  disconnect(): Promise<void>;
}
