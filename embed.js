const buttonCount = 5;

export function wideMessage(components, accent, allowedMentions = { parse: [] }) {
  return { flags: 32768, components: [{ type: 17, accent_color: accent, components }], allowedMentions };
}

const divider = { type: 14, divider: true, spacing: 1 };
const text = content => ({ type: 10, content });
const singleLine = value => value.replace(/[\r\n]+/g, ' ');

function httpsUrl(value) {
  if (!value) return '';
  if (value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function lineupMessage(rows) {
  const components = [text('# Escalação Ember Veil')];
  for (const [slot, heading] of [['Titular', 'Titulares'], ['Reserva', 'Reservas']]) {
    const players = rows.filter(row => row.slot === slot);
    if (!players.length) continue;
    const lines = players.map(row => `• <@${row.player}> · ${row.role}`);
    components.push(divider, text(`## ${heading}\n${lines.join('\n')}`));
  }
  if (components.length === 1) components.push(text('O elenco ainda está vazio.'));
  return wideMessage(components, 0xf45c40);
}

export function composeEmbed(form, guild, channel, member, mentionEveryone) {
  const title = form.get('title')?.trim() || '';
  const description = form.get('description')?.trim() || '';
  const color = form.get('color') || '';
  const format = form.get('format') || 'v2';
  const author = form.get('author')?.trim() || '';
  const footer = form.get('footer')?.trim() || '';
  const banner = httpsUrl(form.get('banner')?.trim());
  const thumbnail = httpsUrl(form.get('thumbnail')?.trim());
  if (title.length > 256 || description.length > 4096 || author.length > 256 || footer.length > 500 ||
      banner === null || thumbnail === null || !/^#[0-9a-f]{6}$/i.test(color) ||
      !['classic', 'v2'].includes(format)) return null;
  const fields = [];
  for (let index = 1; index <= 3; index++) {
    const name = form.get('field_title_' + index)?.trim() || '';
    const value = form.get('field_body_' + index)?.trim() || '';
    if (!name && !value) continue;
    if (!name || !value || name.length > 100 || value.length > 1024) return null;
    fields.push({ name, value });
  }
  if (!title && !description && !fields.length && !banner && !thumbnail) return null;
  const textLength = title.length + description.length + author.length + footer.length +
    fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);

  const buttons = [];
  for (let index = 1; index <= buttonCount; index++) {
    const label = form.get('button_label_' + index)?.trim() || '';
    const address = form.get('button_url_' + index)?.trim() || '';
    if (!label && !address) continue;
    if (!label || label.length > 80 || address.length > 512) return null;
    try {
      const url = new URL(address);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 512) return null;
      const id = form.get('button_emoji_' + index);
      const emoji = id && guild.emojis.cache.get(id);
      if (id && (!emoji || emoji.available === false)) return null;
      buttons.push({
        type: 2, style: 5, label, url: url.href,
        ...(emoji ? { emoji: { id: emoji.id, name: emoji.name, animated: Boolean(emoji.animated) } } : {})
      });
    } catch {
      return null;
    }
  }

  const roles = [];
  if (form.get('ping') === 'on') {
    const selected = guild.roles.cache.get(form.get('role'));
    const botCanMention = channel.permissionsFor(guild.members.me)?.has(mentionEveryone);
    const staffCanMention = channel.permissionsFor(member)?.has(mentionEveryone);
    if (!selected || selected.id === guild.id || ![description, ...fields.map(field => field.value)].some(value => value.includes('<@&' + selected.id + '>')) ||
        (!selected.mentionable && !(botCanMention && staffCanMention))) return null;
    roles.push(selected.id);
  }

  const row = buttons.length ? [{ type: 1, components: buttons }] : [];
  const allowedMentions = { parse: [], roles };
  const accent = Number.parseInt(color.slice(1), 16);
  if (format === 'v2') {
    const components = [];
    const separate = form.get('dividers') === 'on';
    const append = component => {
      if (separate && components.length) components.push(divider);
      components.push(component);
    };
    if (author) components.push(text('-# ' + singleLine(author)));
    if (thumbnail) {
      components.push({
        type: 9, components: [text('# ' + (singleLine(title) || 'Informações'))],
        accessory: { type: 11, media: { url: thumbnail }, description: 'Miniatura' }
      });
    } else if (title) {
      components.push(text('# ' + singleLine(title)));
    }
    if (description) append(text(description));
    for (const field of fields) append(text('## ' + singleLine(field.name) + '\n' + field.value));
    if (banner) append({ type: 12, items: [{ media: { url: banner } }] });
    if (footer) append(text('-# ' + singleLine(footer)));
    if (row.length) components.push(...row);
    const countText = block => (block.type === 10 ? block.content.length : 0) +
      (block.components || []).reduce((sum, child) => sum + countText(child), 0);
    if (components.reduce((sum, block) => sum + countText(block), 0) > 4000) return null;
    return wideMessage(components, accent, allowedMentions);
  }
  if (textLength > 6000) return null;
  return {
    embeds: [{
      ...(title ? { title } : {}), ...(description ? { description } : {}), color: accent,
      ...(author ? { author: { name: author } } : {}),
      ...(footer ? { footer: { text: footer } } : {}),
      ...(banner ? { image: { url: banner } } : {}),
      ...(thumbnail ? { thumbnail: { url: thumbnail } } : {}),
      ...(fields.length ? { fields } : {})
    }],
    ...(roles.length ? { content: '<@&' + roles[0] + '>' } : {}),
    ...(row.length ? { components: row } : {}),
    allowedMentions
  };
}
