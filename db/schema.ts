import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const monitoredUrls = sqliteTable("monitored_urls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  label: text("label").notNull().default(""),
  groupName: text("group_name").notNull().default("Website"),
  status: text("status").notNull().default("Unknown"),
  httpCode: integer("http_code"),
  finalUrl: text("final_url"),
  indexedStatus: text("indexed_status").notNull().default("Unknown"),
  googleFirstSeen: text("google_first_seen"),
  lastCheckedAt: text("last_checked_at"),
  alertMessage: text("alert_message"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_monitored_urls_status").on(table.status),
  index("idx_monitored_urls_group").on(table.groupName),
]);

export const statusHistory = sqliteTable("status_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  urlId: integer("url_id").notNull().references(() => monitoredUrls.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  httpCode: integer("http_code"),
  finalUrl: text("final_url"),
  note: text("note"),
  checkedAt: text("checked_at").notNull(),
}, (table) => [index("idx_status_history_url_checked").on(table.urlId, table.checkedAt)]);

export const monitorSettings = sqliteTable("monitor_settings", {
  id: integer("id").primaryKey(),
  schedule: text("schedule").notNull().default("Every 6 hours"),
  alertsEnabled: integer("alerts_enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull(),
});
