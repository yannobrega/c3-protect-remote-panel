import { boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
};

export const users = pgTable("users", {
  id: serial("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull(), passwordHash: text("password_hash").notNull(), role: text("role").notNull().default("viewer"), active: boolean("active").notNull().default(true), failedLoginCount: integer("failed_login_count").notNull().default(0), lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "string" }), lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "string" }), ...timestamps,
}, (table) => [uniqueIndex("idx_users_email").on(table.email), index("idx_users_active").on(table.active)]);

export const authSessions = pgTable("auth_sessions", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), tokenHash: text("token_hash").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(), ipAddress: text("ip_address"), userAgent: text("user_agent"), createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_auth_sessions_token").on(table.tokenHash), index("idx_auth_sessions_user").on(table.userId), index("idx_auth_sessions_expires").on(table.expiresAt)]);

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(), legalName: text("legal_name").notNull(), tradeName: text("trade_name").notNull(), taxId: text("tax_id").notNull(), hasContract: boolean("has_contract").notNull().default(false), createdBy: text("created_by").notNull(), ...timestamps,
}, (table) => [uniqueIndex("idx_companies_tax_id").on(table.taxId), index("idx_companies_trade_name").on(table.tradeName), index("idx_companies_has_contract").on(table.hasContract)]);

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(), companyId: integer("company_id").references(() => companies.id), rbName: text("rb_name").notNull(), clientName: text("client_name").notNull(), managementIp: text("management_ip").notNull(), sstpUser: text("sstp_user").notNull(), sshUsername: text("ssh_username").notNull().default("c3.remote"), sshPasswordEncrypted: text("ssh_password_encrypted").notNull(), sshPasswordIv: text("ssh_password_iv").notNull(), pendingSshPasswordEncrypted: text("pending_ssh_password_encrypted"), pendingSshPasswordIv: text("pending_ssh_password_iv"), pendingSshPasswordCreatedAt: timestamp("pending_ssh_password_created_at", { withTimezone: true, mode: "string" }), status: text("status").notNull().default("pending"), createdBy: text("created_by").notNull(), ...timestamps,
}, (table) => [uniqueIndex("idx_devices_management_ip").on(table.managementIp), uniqueIndex("idx_devices_sstp_user").on(table.sstpUser), index("idx_devices_client_name").on(table.clientName), index("idx_devices_status").on(table.status)]);

export const remoteSessions = pgTable("remote_sessions", {
  id: serial("id").primaryKey(), gatewaySessionId: text("gateway_session_id").notNull(), deviceId: integer("device_id").references(() => devices.id), deviceName: text("device_name").notNull(), clientName: text("client_name").notNull(), managementIp: text("management_ip").notNull(), actorEmail: text("actor_email").notNull(), status: text("status").notNull().default("pending"), connectedAt: timestamp("connected_at", { withTimezone: true, mode: "string" }), endedAt: timestamp("ended_at", { withTimezone: true, mode: "string" }), endedReason: text("ended_reason"), createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idx_remote_sessions_gateway_id").on(table.gatewaySessionId), index("idx_remote_sessions_device_id").on(table.deviceId), index("idx_remote_sessions_status").on(table.status), index("idx_remote_sessions_created_at").on(table.createdAt)]);

export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(), actorEmail: text("actor_email").notNull(), action: text("action").notNull(), resourceType: text("resource_type").notNull(), resourceId: text("resource_id").notNull(), summary: text("summary").notNull(), createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("idx_audit_events_created_at").on(table.createdAt), index("idx_audit_events_resource").on(table.resourceType, table.resourceId)]);
