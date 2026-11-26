const buttonCount = 3;

export function composeEmbed(form, guild, channel, member, mentionEveryone) {
  const title = form.get('title')?.trim() || '';
  const description = form.get('description')?.trim() || '';
  const color = form.get('color') || '';
  const format = form.get('format') || 'classic';
  if ((!title && !description) || title.length > 256 || description.length > 4096 ||
      !/^#[0-9a-f]{6}$/i.test(color) || !['classic', 'v2'].includes(format)) return null;

  const buttons = [];
  for (let index = 1; index <= buttonCount; index++) {
    const label = form.get('button_label_' + index)?.trim() || '';
    const address = form.get('button_url_' + index)?.trim() || '';
    if (!label && !address) continue;
    if (!label || label.length > 80 || address.length > 512) return null;
    try {
      const url = new URL(address);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 512) return null;
      buttons.push({ type: 2, style: 5, label, url: url.href });
    } catch {
      return null;
    }
  }

  const roles = [];
  if (form.get('ping') === 'on') {
    const selected = guild.roles.cache.get(form.get('role'));
    const botCanMention = channel.permissionsFor(guild.members.me)?.has(mentionEveryone);
    const staffCanMention = channel.permissionsFor(member)?.has(mentionEveryone);
    if (!selected || selected.id === guild.id || !description.includes('<@&' + selected.id + '>') ||
        (!selected.mentionable && !(botCanMention && staffCanMention))) return null;
    roles.push(selected.id);
  }

  const row = buttons.length ? [{ type: 1, components: buttons }] : [];
  const allowedMentions = { parse: [], roles };
  const accent = Number.parseInt(color.slice(1), 16);
  if (format === 'v2') {
    const text = [];
    if (title) text.push({ type: 10, content: '## ' + title.replace(/[\r\n]+/g, ' ') });
    if (description) text.push({ type: 10, content: description });
    return { flags: 32768, components: [{ type: 17, accent_color: accent, components: [...text, ...row] }], allowedMentions };
  }

  return {
    embeds: [{ ...(title ? { title } : {}), ...(description ? { description } : {}), color: accent }],
    ...(roles.length ? { content: '<@&' + roles[0] + '>' } : {}),
    ...(row.length ? { components: row } : {}),
    allowedMentions
  };
}
