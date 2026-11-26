import { createHash } from 'node:crypto';

export function resultAnnouncements(db, client, route, guildId, channelId, bannerUrl) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS result_announcements (
      score_id TEXT PRIMARY KEY REFERENCES scores(id),
      message_id TEXT
    );
    CREATE TRIGGER IF NOT EXISTS queue_result_announcement AFTER INSERT ON scores
    BEGIN
      INSERT INTO result_announcements (score_id) VALUES (NEW.id);
    END;
  `);
  // Publish the most recent existing result requested in the results channel.
  db.prepare(`INSERT OR IGNORE INTO result_announcements (score_id)
    SELECT id FROM scores WHERE opponent = ? AND map = ? AND ours = ? AND theirs = ?
      AND date >= ? AND date < ? ORDER BY date DESC LIMIT 1`).run(
    'Armageddon', 'Abyss', 13, 7,
    Date.parse('2026-11-26T04:02:00Z'), Date.parse('2026-11-26T04:03:00Z')
  );
  const pending = db.prepare(`SELECT scores.* FROM result_announcements
    JOIN scores ON scores.id = score_id WHERE message_id IS NULL ORDER BY scores.date LIMIT 20`);
  const delivered = db.prepare('UPDATE result_announcements SET message_id = ? WHERE score_id = ?');
  let running = false;

  async function flush() {
    if (running || !client.isReady()) return;
    const rows = pending.all();
    if (!rows.length) return;
    running = true;
    try {
      const guild = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId);
      if (!channel?.isSendable()) throw Error('Canal de resultados indisponível.');
      for (const match of rows) {
        const kind = match.id.startsWith('premier:') ? 'Resultado Premier' : 'Resultado da partida';
        const nonce = createHash('sha256').update(match.id).digest('hex').slice(0, 24);
        const message = await client.rest.post(route(channel.id), { body: {
          nonce, enforce_nonce: true, allowed_mentions: { parse: [] },
          embeds: [{
            title: kind + ' · Ember Veil',
            description: `**Ember Veil ${match.ours} × ${match.theirs} ${match.opponent}**`,
            color: 0xf45c40,
            fields: [{ name: 'Mapa', value: match.map, inline: true }],
            timestamp: new Date(match.date).toISOString(),
            ...(bannerUrl ? { image: { url: bannerUrl } } : {})
          }]
        } });
        delivered.run(message.id, match.id);
        console.log('Resultado publicado:', channel.id, message.id);
      }
    } catch (error) {
      console.error('Falha ao publicar resultado:', error.code || error.message);
    } finally {
      running = false;
    }
  }

  setInterval(() => void flush(), 30000).unref();
  return flush;
}
