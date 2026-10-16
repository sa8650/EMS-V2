import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { ZodError, type z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { DbError } from '@/server/db';
import { AppError } from '@/server/errors';

/**
 * Runs the body of a form Server Action and converts the outcome into an
 * ActionState: success message, field errors (zod), business errors (AppError)
 * or database rule violations. Unexpected errors are logged and reported
 * generically. Next.js redirects and notFound() pass through untouched.
 */
export async function runAction(body: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await body();
    return { status: 'success', message: message || undefined, at: Date.now() };
  } catch (e) {
    unstable_rethrow(e);
    return { ...errorState(e), at: Date.now() };
  }
}

export function errorState(e: unknown): ActionState {
  if (e instanceof AppError) return { status: 'error', message: e.message, fields: e.fields ? { ...e.fields } : undefined };
  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of e.issues) {
      const key = String(issue.path[0] ?? 'form');
      if (!fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', message: 'Please check the highlighted fields.', fields };
  }
  if (e instanceof DbError && e.status < 500) {
    if (e.code === '23505') return { status: 'error', message: 'That value is already in use. Please choose another one.' };
    if (e.code === '23503') return { status: 'error', message: 'This record is linked to other records and cannot be changed that way.' };
    if (e.code === 'P0001' || e.code === 'not_found') return { status: 'error', message: e.message };
    return { status: 'error', message: 'Some values were not accepted. Please check the form.' };
  }
  console.error('[ems] action failed', e);
  return { status: 'error', message: 'Something went wrong. Please try again.' };
}

/** FormData → plain object of trimmed strings (repeated keys become arrays). */
export function formValues(form: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, raw] of form.entries()) {
    if (key.startsWith('$ACTION')) continue;
    const value = typeof raw === 'string' ? raw.trim() : raw.name;
    const prev = out[key];
    out[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  return out;
}

/** Validates FormData with a zod schema (throws ZodError → field messages). */
export function parseForm<S extends z.ZodType>(schema: S, form: FormData): z.infer<S> {
  return schema.parse(formValues(form));
}
