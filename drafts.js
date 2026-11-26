import { randomUUID } from 'node:crypto';

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const limits = {
  title: 256, description: 4096, author: 256, footer: 500,
  banner: 2000, thumbnail: 2000, format: 7, color: 7,
  role: 20, channel: 20, ping: 2, ping_members: 2, dividers: 2
};
for (let index = 1; index <= 5; index++) {
  limits['button_label_' + index] = 80;
  limits['button_url_' + index] = 512;
  limits['button_emoji_' + index] = 20;
}
for (let index = 1; index <= 3; index++) {
  limits['field_title_' + index] = 100;
  limits['field_body_' + index] = 1024;
}

export function embedDrafts(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS embed_drafts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    revision INTEGER NOT NULL
  )`);
  const list = db.prepare('SELECT id, name FROM embed_drafts ORDER BY updated_at DESC, name, id');
  const byId = db.prepare('SELECT id, name, data, revision FROM embed_drafts WHERE id = ?');
  const insert = db.prepare('INSERT INTO embed_drafts VALUES (?, ?, ?, ?, 1)');
  const update = db.prepare(`UPDATE embed_drafts SET name = ?, data = ?, updated_at = ?, revision = revision + 1
    WHERE id = ? AND revision = ?`);

  return {
    list: () => list.all(),
    read(id) {
      const row = idPattern.test(id || '') ? byId.get(id) : null;
      return row && { ...row, data: JSON.parse(row.data) };
    },
    save(form, asCopy = false) {
      const name = form.get('draft_name')?.trim() || '';
      const id = asCopy ? '' : form.get('draft_id') || '';
      const revision = form.get('draft_revision') || '';
      if (!name || name.length > 100 || (id && (!idPattern.test(id) || !/^\d{1,12}$/.test(revision)))) {
        return { status: 'draft-invalid' };
      }

      const data = {};
      for (const [key, max] of Object.entries(limits)) {
        const value = form.get(key);
        if (value === null) continue;
        if (value.length > max) return { status: 'draft-invalid', id };
        data[key] = value;
      }

      const payload = JSON.stringify(data);
      const date = Date.now();
      if (id) {
        const result = update.run(name, payload, date, id, Number(revision));
        return { status: result.changes ? 'draft-saved' : 'draft-conflict', id };
      }
      const newId = randomUUID();
      insert.run(newId, name, payload, date);
      return { status: 'draft-saved', id: newId };
    }
  };
}
