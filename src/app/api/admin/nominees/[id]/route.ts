import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { HttpError } from '@/lib/env';
import { json, handleError, readJson } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const cleanName = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
const NameField = z
  .string()
  .transform(cleanName)
  .refine((s) => s.length >= 2 && s.length <= 80, 'Name must be 2–80 characters.')
  .refine((s) => !/[<>]/.test(s), 'Name cannot contain < or >.');

const Body = z.object({
  name: NameField.optional(),
  categoryId: z.string().uuid().optional(),
  published: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, 'Nominee not found.');
    const b = Body.parse(await readJson(req));

    const cur = (await query<{ category_id: string; archived_at: Date | null; votes: number }>(
      `SELECT n.category_id, n.archived_at, (SELECT count(*)::int FROM ballot_selections bs WHERE bs.nominee_id = n.id) AS votes
       FROM nominees n WHERE n.id = $1`, [id]
    ))[0];
    if (!cur) throw new HttpError(404, 'Nominee not found.');

    if (b.categoryId && b.categoryId !== cur.category_id && cur.votes > 0) {
      throw new HttpError(409, 'This nominee already has votes, so they cannot be moved. Archive them and add a new nominee instead.');
    }
    const willBeArchived = b.archived ?? !!cur.archived_at;
    if (b.published && willBeArchived) throw new HttpError(400, 'Restore this nominee before publishing them.');

    const sets: string[] = [];
    const vals: unknown[] = [];
    const add = (sql: string, v: unknown) => { vals.push(v); sets.push(sql.replace('?', `$${vals.length}`)); };
    if (b.name !== undefined) { add('display_name = ?', b.name); add('name_key = ?', b.name.toLocaleLowerCase('en')); }
    if (b.categoryId !== undefined) add('category_id = ?', b.categoryId);
    if (b.published !== undefined) add('published = ?', b.published);
    if (b.archived === true) { sets.push('archived_at = COALESCE(archived_at, now())'); sets.push('published = false'); }
    if (b.archived === false) sets.push('archived_at = NULL');
    if (!sets.length) throw new HttpError(400, 'Nothing to update.');
    vals.push(id);

    try {
      await query(`UPDATE nominees SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === '23505') throw new HttpError(409, 'Another nominee with that name already exists in this category.');
      if (code === '23503') throw new HttpError(400, 'Please choose a valid category.');
      throw e;
    }
    revalidatePath('/');
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
