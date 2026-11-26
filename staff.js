import { composeEmbed } from './embed.js';

const snowflake = /^\d{17,20}$/;

export async function getStaff(context, userId) {
  if (!context?.client.isReady()) return null;
  const guild = await context.client.guilds.fetch(context.guildId);
  const member = await guild.members.fetch({ user: userId, force: true });
  return member.permissions.has(context.manageGuild) || member.roles.cache.has(context.roleId)
    ? { guild, member } : null;
}

export function commandOptions(command, subcommand) {
  return subcommand ? subcommand.options : (command.options || []);
}

async function formData(request) {
  if (!request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 145000) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

export async function staffAction(request, response, context, userId) {
  const redirect = status => response.writeHead(303, { Location: '/?status=' + status + '#staff' }).end();
  const staff = await getStaff(context, userId).catch(() => null);
  if (!staff) return response.writeHead(403).end('Acesso restrito à staff da Ember Veil.');
  const form = await formData(request);
  if (!form) return redirect('invalid');
  const { guild, member } = staff;
  const action = form.get('action');
  if (action === 'premier/approve' || action === 'premier/reject') {
    return redirect(context.premier.decide(action, form.get('match'), form.get('opponent')?.trim(), form.get('map')?.trim()));
  }
  const [name, sub] = (action || '').split('/');
  const command = context.commands.find(command => command.name === name);
  const subcommand = sub && command?.options?.find(option => option.type === 1 && option.name === sub);
  if (name !== 'embed' && (!command || (sub && !subcommand) || (!sub && command.options?.some(o => o.type === 1)))) {
    return redirect('invalid');
  }

  let channel;
  if (name !== 'elenco') {
    const channelId = form.get('channel')?.trim() || '';
    channel = snowflake.test(channelId) ? await guild.channels.fetch(channelId).catch(() => null) : null;
    const permissions = [context.viewChannel, context.sendMessages];
    if ((name === 'embed' && form.get('format') === 'classic') || name === 'treino') permissions.push(context.embedLinks);
    if (!channel?.isSendable() || channel.isThread() ||
        !channel.permissionsFor(member)?.has(permissions.slice(0, 2)) ||
        !channel.permissionsFor(guild.members.me)?.has(permissions)) {
      return redirect('channel');
    }
  }

  try {
    if (name === 'embed') {
      const message = composeEmbed(form, guild, channel, member, context.mentionEveryone);
      if (!message) return redirect('invalid');
      await context.sendMessage(channel, message);
      return redirect(message.flags === 32768 ? 'sent-v2' : 'sent-classic');
    }

    const values = new Map();
    for (const option of commandOptions(command, subcommand)) {
      const value = form.get(option.name)?.trim() || '';
      if (!value || (option.max_length && value.length > option.max_length) ||
          (option.choices && !option.choices.some(choice => choice.value === value))) return redirect('invalid');
      if (option.type === 4) {
        const number = Number(value);
        if (!/^\d+$/.test(value) || !Number.isInteger(number) || number < option.min_value || number > option.max_value) return redirect('invalid');
        values.set(option.name, number);
      } else if (option.type === 6) {
        const target = snowflake.test(value) && await guild.members.fetch(value).catch(() => null);
        if (!target) return redirect('invalid');
        values.set(option.name, target.user);
      } else {
        values.set(option.name, value);
      }
    }

    let outcome = 'ok';
    const send = async options => {
      if (options.flags) return;
      const { withResponse, ...message } = options;
      const sent = await context.sendMessage(channel, message);
      return { resource: { message: sent } };
    };
    await context.handle({
      id: 'web-' + crypto.randomUUID(), guildId: guild.id, commandName: name,
      member, memberPermissions: member.permissions, user: member.user,
      isButton: () => false, isChatInputCommand: () => true, reply: send,
      setOutcome: status => { outcome = status; },
      options: {
        getString: key => values.get(key),
        getInteger: key => values.get(key),
        getUser: key => values.get(key),
        getSubcommand: () => sub
      }
    });
    return redirect(outcome);
  } catch (error) {
    console.error('Falha em ação da staff:', error.code || error.name);
    return redirect('failed');
  }
}
