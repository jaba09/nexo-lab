import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const laboratories = sqliteTable("laboratories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  manager: text("manager").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_laboratories_code").on(table.code)]);

export const installations = sqliteTable("installations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  laboratoryId: integer("laboratory_id").notNull().references(() => laboratories.id, { onDelete: "restrict" }),
  category: text("category").notNull(),
  capacity: integer("capacity").notNull(),
  status: text("status").notNull().default("Operativa"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_installations_code").on(table.code),
  index("idx_installations_laboratory_id").on(table.laboratoryId),
]);

export const practices = sqliteTable("practices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  installationId: integer("installation_id").notNull().references(() => installations.id, { onDelete: "restrict" }),
  duration: integer("duration").notNull(),
  riskLevel: text("risk_level").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_practices_code").on(table.code),
  index("idx_practices_installation_id").on(table.installationId),
]);

export const degrees = sqliteTable("degrees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  level: text("level").notNull(),
  academicYear: integer("academic_year").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_degrees_code").on(table.code)]);

export const degreePractices = sqliteTable("degree_practices", {
  degreeId: integer("degree_id").notNull().references(() => degrees.id, { onDelete: "cascade" }),
  practiceId: integer("practice_id").notNull().references(() => practices.id, { onDelete: "restrict" }),
}, (table) => [
  primaryKey({ columns: [table.degreeId, table.practiceId] }),
  index("idx_degree_practices_practice_id").on(table.practiceId),
]);

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
