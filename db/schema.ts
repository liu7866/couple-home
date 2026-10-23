import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const roomState = sqliteTable('room_state', {
  id: integer('id').primaryKey(),
  data: text('data').notNull(),
  revision: integer('revision').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});

export const members = sqliteTable('members', {
  userId: text('user_id').primaryKey(),
  slot: integer('slot').notNull(),
  displayName: text('display_name').notNull(),
  lastSeen: integer('last_seen').notNull(),
}, table => [uniqueIndex('members_slot_unique').on(table.slot)]);

export const homeEvents = sqliteTable('home_events', {
  id: text('id').primaryKey(),
  revision: integer('revision').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  objectKey: text('object_key').notNull(),
  caption: text('caption').notNull(),
  createdAt: integer('created_at').notNull(),
  userId: text('user_id').notNull(),
});

export const homeKeys = sqliteTable('home_keys', {
  slot: integer('slot').primaryKey(),
  keyHash: text('key_hash').notNull(),
  userId: text('user_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const homeSessions = sqliteTable('home_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  keyHash: text('key_hash').notNull(),
  userId: text('user_id').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const authAttempts = sqliteTable('auth_attempts', {
  ipHash: text('ip_hash').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const memberPasswords = sqliteTable('member_passwords', {
  slot: integer('slot').primaryKey(),
  userId: text('user_id').notNull(),
  salt: text('salt').notNull(),
  passwordHash: text('password_hash').notNull(),
  version: text('version').notNull(),
  createdAt: integer('created_at').notNull(),
});
