import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { HttpError } from '@/lib/env';
import { json, handleError, readJson } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const cleanName = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
const nameKey = (s: string) => cleanName(s).toLocaleLowerCase('en');

const NameField = z
  .string()
  .transform(cleanName)
  .refine((s) => s.length >= 2 && s.length <= 80, 'Name must be 2–80 characters.')
  .refine((s) => !/[<>]/.test(s), 'Name cannot contain < or >.');

const Body = z.object({ name: NameField, categoryId: z.string().uuid(), published: z.boolean().optional() });

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const b = Body.parse(await readJson(req));
    try {
      const rows = await query<{ id: string }>(
        `INSERT INTO nominees (category_id, display_name, name_key, published)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [b.categoryId, b.name, nameKey(b.name), b.published ?? false]
      );
      revalidatePath('/');
      return json({ ok: true, id: rows[0].id }, 201);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === '23505') throw new HttpError(409, 'That nominee already exists in this category (it may be archived — restore it instead).');
      if (code === '23503') throw new HttpError(400, 'Please choose a valid category.');
      throw e;
    }
  } catch (e) {
    return handleError(e);
  }
}
