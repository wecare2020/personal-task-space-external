import {sqliteTable, text, integer, index, uniqueIndex} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';

export const tasks = sqliteTable('native_tasks', {
  id:text('id').primaryKey(), data:text('data').notNull(), version:integer('version').notNull().default(1),
  baseline:text('baseline'), syncRevision:integer('sync_revision').notNull().default(0),
  deleted:integer('deleted').notNull().default(0), updatedAt:integer('updated_at').notNull(),
});
export const projects = sqliteTable('native_projects', {id:text('id').primaryKey(),data:text('data').notNull(),exported:integer('exported').notNull().default(0)},table=>[uniqueIndex('idx_native_projects_name').on(sql`lower(${table.id})`)]);
export const receipts = sqliteTable('native_receipts', {
  id:text('id').primaryKey(),fingerprint:text('fingerprint').notNull(),taskId:text('task_id').notNull(),
  result:text('result').notNull(),createdAt:integer('created_at').notNull(),
});
// A coalescing outbox: every committed task version remains dirty until reconciled.
export const outbox = sqliteTable('native_outbox', {
  taskId:text('task_id').primaryKey(),version:integer('version').notNull(),attempts:integer('attempts').notNull().default(0),
  nextAttempt:integer('next_attempt').notNull().default(0),lastError:text('last_error'),
},table=>[index('idx_native_outbox_due').on(table.nextAttempt)]);
export const attempts = sqliteTable('native_sync_attempts', {
  taskId:text('task_id').primaryKey(),id:text('id').notNull(),base:text('base'),desired:text('desired').notNull(),
  version:integer('version').notNull(),syncRevision:integer('sync_revision').notNull(),createdAt:integer('created_at').notNull(),
});
export const conflicts = sqliteTable('native_conflicts', {
  taskId:text('task_id').primaryKey(),base:text('base'),local:text('local').notNull(),remote:text('remote'),
  fields:text('fields').notNull(),createdAt:integer('created_at').notNull(),
});
export const recovery = sqliteTable('native_recovery', {
  id:text('id').primaryKey(),taskId:text('task_id').notNull(),data:text('data').notNull(),reason:text('reason').notNull(),createdAt:integer('created_at').notNull(),
});
export const state = sqliteTable('native_state', {key:text('key').primaryKey(),value:text('value').notNull()});

// Share grants never travel to Google Sheets. Tokens are returned only to the owner.
export const shares = sqliteTable('native_task_shares', {
  taskId:text('task_id').primaryKey(), token:text('token').notNull(), tokenHash:text('token_hash').notNull(),
  ownerId:text('owner_id').notNull(), permission:text('permission').notNull(), generation:integer('generation').notNull(),
  updatedAt:integer('updated_at').notNull(),
},table=>[uniqueIndex('idx_share_token_hash').on(table.tokenHash)]);
export const shareAssets = sqliteTable('native_share_assets', {
  assetId:text('asset_id').primaryKey(), taskId:text('task_id').notNull(), r2Key:text('r2_key').notNull(),
  uploadedAt:integer('uploaded_at').notNull().default(0), grantGeneration:integer('grant_generation').notNull().default(0),
},table=>[index('idx_share_assets_task').on(table.taskId)]);
export const shareLimits = sqliteTable('native_share_limits', {
  key:text('key').primaryKey(), window:integer('window').notNull(), count:integer('count').notNull(),
});

// Service keys are read-only and retained as hashes. They never travel to Sheets.
export const taskReadKeys = sqliteTable('native_task_read_keys', {
  id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),name:text('name').notNull(),
  tokenHash:text('token_hash').notNull(),createdAt:integer('created_at').notNull(),
  expiresAt:integer('expires_at').notNull(),revokedAt:integer('revoked_at'),
},table=>[uniqueIndex('idx_task_read_key_hash').on(table.tokenHash),index('idx_task_read_key_owner').on(table.ownerId)]);
