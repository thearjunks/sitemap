import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  removedAt: text("removed_at"),
  removedBy: text("removed_by"),
  removalReason: text("removal_reason"),
  statusBeforeRemoval: text("status_before_removal"),
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

export const urlImports = sqliteTable("url_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceType: text("source_type").notNull(),
  sourceName: text("source_name").notNull(),
  importedAt: text("imported_at").notNull(),
  totalRows: integer("total_rows").notNull(),
  uniqueUrls: integer("unique_urls").notNull(),
  addedCount: integer("added_count").notNull(),
  existingCount: integer("existing_count").notNull(),
  duplicateCount: integer("duplicate_count").notNull(),
  invalidCount: integer("invalid_count").notNull(),
}, (table) => [index("idx_url_imports_imported_at").on(table.importedAt)]);

export const urlImportItems = sqliteTable("url_import_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").notNull().references(() => urlImports.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  result: text("result").notNull(),
  duplicateCount: integer("duplicate_count").notNull().default(0),
}, (table) => [uniqueIndex("idx_url_import_items_import_url").on(table.importId, table.url)]);

export const generalMonitoredUrls = sqliteTable("general_monitored_urls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  domain: text("domain").notNull(),
  status: text("status").notNull().default("Unknown"),
  httpCode: integer("http_code"),
  finalUrl: text("final_url"),
  lastCheckedAt: text("last_checked_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_general_urls_status").on(table.status),
  index("idx_general_urls_domain").on(table.domain),
]);
