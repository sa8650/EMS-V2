import 'server-only';
import type { Database } from '@/server/db';

export interface ActivityEntry {
  shopId?: string | null;
  adminId?: string | null;
  actorType: 'owner' | 'admin' | 'staff' | 'system';
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Appends to the audit log. Never fails the surrounding operation. */
export async function logActivity(db: Database, e: ActivityEntry): Promise<void> {
  try {
    await db.from('activity_logs').insert({
      shop_id: e.shopId ?? null,
      admin_id: e.adminId ?? null,
      actor_type: e.actorType,
      actor_id: e.actorId ?? null,
      action: e.action,
      entity_type: e.entityType ?? null,
      entity_id: e.entityId ?? null,
      metadata: e.metadata ?? {},
    });
  } catch (err) {
    console.error('[ems] activity log failed', err);
  }
}
