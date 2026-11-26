import { createHash } from 'node:crypto';

export function resultAnnouncements(db, client, route, guildId, channelId, bannerUrl) {
  db.exec('DROP TRIGGER IF EXISTS queue_result_announcement');
  db.exec(`CREATE TABLE IF NOT EXISTS result_summary (
    id INTEGER PRIMARY KEY CHECK (id = 1), message_id TEXT NOT NULL, digest TEXT NOT NULL
  )`);
  const all = db.prepare('SELECT opponent, map, ours, theirs, date FROM scores ORDER BY date DESC, id DESC');
  const stored = db.prepare('SELECT message_id, digest FROM result_summary WHERE id = 1');
  const record = db.prepare('INSERT OR REPLACE INTO result_summary VALUES (1, ?, ?)');
  const escape = value => Array.from(String(value), char => {
    const code = char.charCodeAt(0);
    if (code === 10 || code === 13) return " ";
    const markdown = [42, 95, 96, 126, 124, 60, 62, 91, 93, 92, 64];
    return markdown.includes(code) ? String.fromCharCode(92) + char : char;
  }).join("");
  let running = false;

  async function refreshSummary(channel) {
    const results = all.all();
    const wins = results.filter(row => row.ours > row.theirs).length;
    const losses = results.filter(row => row.ours < row.theirs).length;
    let description = `**${results.length} partidas \u00b7 ${wins} vit\u00f3rias \u00b7 ${losses} derrotas \u00b7 ${results.length - wins - losses} empates**\n\n`;
    for (const row of results) {
      const line = `\u2022 **${row.ours} \u00d7 ${row.theirs}** \u00b7 ${escape(row.opponent)} \u00b7 ${escape(row.map)} \u00b7 <t:${Math.floor(row.date / 1000)}:d>\n`;
      if (description.length + line.length > 3800) {
        if (bannerUrl) description += '\n[Ver o hist\u00f3rico completo](' + new URL('/#historico', bannerUrl).href + ')';
        break;
      }
      description += line;
    }
    const embed = {
      title: 'Resultados gerais \u00b7 Ember Veil', description, color: 0xf45c40,
      ...(bannerUrl ? { image: { url: bannerUrl } } : {})
    };
    const digest = createHash('sha256').update(JSON.stringify(embed)).digest('hex');
    const previous = stored.get();
    if (previous?.digest === digest) return;
    const body = { embeds: [embed], allowed_mentions: { parse: [] } };
    let message;
    if (previous) {
      try {
        message = await client.rest.patch(route(channel.id) + '/' + previous.message_id, { body });
      } catch (error) {
        if (error.code !== 10008) throw error;
      }
    }
    message ||= await client.rest.post(route(channel.id), {
      body: { ...body, nonce: 'ember-results-summary', enforce_nonce: true }
    });
    record.run(message.id, digest);
    console.log('Placar geral atualizado:', channel.id, message.id, results.length);
  }

  async function flush() {
    if (running || !client.isReady()) return;

    running = true;
    try {
      const guild = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId);
      if (!channel?.isSendable()) throw Error('Canal de resultados indispon\u00edvel.');
      await refreshSummary(channel);
    } catch (error) {
      console.error('Falha ao publicar resultado:', error.code || error.message);
    } finally {
      running = false;
    }
  }

  setInterval(() => void flush(), 30000).unref();
  return flush;
}

