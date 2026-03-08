/**
 * Barrel export for the storage module.
 */

export type { StoragePort, SessionStore, CampaignStore } from "./port";
export { createJsonStorage } from "./json-adapter";
export { createSqliteStorage } from "./sqlite-adapter";
