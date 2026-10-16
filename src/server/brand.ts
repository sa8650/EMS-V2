import 'server-only';
import { cache } from 'react';
import { getDb } from '@/server/db';
import { getSetting, SETTING_SCHEMAS, type SettingValue } from '@/server/settings';

export interface Brand extends SettingValue<'branding'> {
  theme: SettingValue<'theme'>;
  /** False when the database is not reachable or not initialised yet. */
  ready: boolean;
}

/** Branding for page chrome and metadata; falls back to defaults if the database is unavailable. */
export const getBrand = cache(async (): Promise<Brand> => {
  try {
    const db = await getDb();
    const [branding, theme] = await Promise.all([getSetting(db, 'branding'), getSetting(db, 'theme')]);
    return { ...branding, theme, ready: true };
  } catch {
    return { ...SETTING_SCHEMAS.branding.parse({}), theme: SETTING_SCHEMAS.theme.parse({}), ready: false };
  }
});
