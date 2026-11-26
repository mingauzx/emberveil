import { resultAnnouncements } from './result-announcements.js';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { discordLogin } from './login.js';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dashboard } from './dashboard.js';
import { staffAction, getStaff, canSendTo, memberChoice } from './staff.js';
import { lineupMessage } from './embed.js';
import { premierSync } from './premier.js';
import { embedDrafts } from './drafts.js';

const env = process.env;
const directory = env.DATA_DIR || './data';
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(join(directory, 'ember.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS training (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, date INTEGER NOT NULL, message TEXT
  );
  CREATE TABLE IF NOT EXISTS attendance (
    training TEXT REFERENCES training(id) ON DELETE CASCADE, player TEXT,
    name TEXT NOT NULL, answer TEXT NOT NULL, PRIMARY KEY (training, player)
  );
  CREATE TABLE IF NOT EXISTS roster (
    player TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, slot TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scores (
    id TEXT PRIMARY KEY, opponent TEXT NOT NULL, map TEXT NOT NULL,
    ours INTEGER NOT NULL, theirs INTEGER NOT NULL, date INTEGER NOT NULL
  );
`);
// Remove the explicitly identified test result from the original dashboard.
const testScore = db.prepare(`SELECT id FROM scores
  WHERE opponent = 'a' AND map = 'a' AND ours = 2 AND theirs = 1
    AND date >= ? AND date < ?`).all(
  Date.parse('2026-11-26T03:12:00Z'), Date.parse('2026-11-26T03:13:00Z')
);
if (testScore.length === 1) {
  const queued = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'result_announcements'").get();
  if (!queued || !db.prepare('SELECT 1 FROM result_announcements WHERE score_id = ?').get(testScore[0].id)) {
    db.prepare('DELETE FROM scores WHERE id = ?').run(testScore[0].id);
  }
}
const roster = db.prepare('SELECT * FROM roster ORDER BY slot DESC, name');
const trainings = db.prepare('SELECT * FROM training WHERE message IS NOT NULL AND date > ? ORDER BY date LIMIT 20');
const attendance = db.prepare('SELECT name, answer FROM attendance WHERE training = ? ORDER BY name');
const scores = db.prepare('SELECT * FROM scores ORDER BY date DESC LIMIT 30');

const premier = premierSync(db, env);
const drafts = embedDrafts(db);
const login = discordLogin(env);
const lineupBanner = readFileSync(new URL('./assets/lineup-banner.png', import.meta.url));
const bannerPath = '/assets/lineup-banner.png';
const resultsBannerPath = '/assets/results-banner.png';
const resultsBanner = readFileSync(new URL('./assets/results-banner.png', import.meta.url));
const bannerUrl = env.PUBLIC_URL && new URL(bannerPath, env.PUBLIC_URL).href;
let discordStaff;
createServer(async (request, response) => {
  const banner = request.url === bannerPath ? lineupBanner : request.url === resultsBannerPath ? resultsBanner : null;
  if (banner && ['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': banner.length,
      'Cache-Control': 'public, max-age=86400'
    });
    response.end(request.method === 'HEAD' ? undefined : banner);
    return;
  }
  response.setHeader('Cache-Control', 'no-store');
  try {
    const userId = await login(request, response);
    if (!userId) return;
    if (request.method === 'POST') {
      await staffAction(request, response, discordStaff, userId);
      return;
    }
    const signedIn = userId !== 'public';
    const staff = signedIn ? await getStaff(discordStaff, userId).catch(() => null) : null;
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/staff/members' && request.method === 'GET') {
      if (!staff) return response.writeHead(403).end();
      const query = url.searchParams.get('q')?.trim() || '';
      const members = query && query.length <= 32
        ? await staff.guild.members.search({ query, limit: 15, cache: false })
        : [];
      return response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        .end(JSON.stringify([...members.values()].map(memberChoice)));
    }
    const noticeCode = url.searchParams.get('status');
    const draftState = staff ? { entries: drafts.list(), selected: drafts.read(url.searchParams.get('draft')) } : null;
    let choices = null;
    if (staff) {
      const draft = draftState.selected?.data || {};
      const mentionIds = new Set(Object.values(draft).flatMap(value =>
        [...value.matchAll(/<@!?(\d{17,20})>/g)].map(match => match[1])));
      const [channels, members] = await Promise.all([
        staff.guild.channels.fetch().catch(() => staff.guild.channels.cache),
        Promise.all([...mentionIds].slice(0, 20).map(id => staff.guild.members.fetch(id).catch(() => null)))
      ]);
      choices = {
        channels: [...channels.values()].filter(channel => canSendTo(channel, staff, discordStaff))
          .map(channel => ({ id: channel.id, name: channel.name, category: channel.parent?.name || '',
            classic: canSendTo(channel, staff, discordStaff, true) }))
          .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
        roles: [...staff.guild.roles.cache.values()].filter(role => role.id !== staff.guild.id)
          .sort((a, b) => b.position - a.position),
        emojis: [...staff.guild.emojis.cache.values()].filter(emoji => emoji.available !== false)
          .sort((a, b) => a.name.localeCompare(b.name)),
        members: members.filter(Boolean).map(memberChoice)
      };
    }
    const upcoming = trainings.all(Date.now()).map(row => ({ ...row, people: attendance.all(row.id) }));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(dashboard(upcoming, roster.all(), scores.all(), staff ? discordStaff.commands : [], noticeCode, choices, signedIn, staff ? { state: premier.state(), pending: premier.pending() } : null, draftState));
  } catch {
    response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Falha na conexão com o Discord. Tente novamente.');
  }
}).listen(Number(env.PORT || 3000), env.HOST || '127.0.0.1', () => console.log('Dashboard iniciado.'));

if (env.DISCORD_TOKEN && !env.DISCORD_GUILD_ID) {
  throw new Error('Configure DISCORD_TOKEN e DISCORD_GUILD_ID juntos.');
}

if (env.DISCORD_TOKEN) {
  const { Client, Events, GatewayIntentBits, PermissionFlagsBits, MessageFlags, Routes } = await import('discord.js');
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const string = (name, description, max_length = 80) => ({ type: 3, name, description, required: true, max_length });
  const user = { type: 6, name: 'jogador', description: 'Membro do time', required: true };
  const score = (name, description) => ({ type: 4, name, description, required: true, min_value: 0, max_value: 999 });
  const commands = [
    { name: 'treino', description: 'Agenda do time', options: [
      { type: 1, name: 'marcar', description: 'Publicar um treino ou scrim', options: [
        string('titulo', 'Título ou adversário'), string('data', 'Data com fuso, ex. 2027-01-10T20:00-04:00', 30)
      ] }
    ] },
    { name: 'elenco', description: 'Gerenciar jogadores', options: [
      { type: 1, name: 'definir', description: 'Adicionar ou atualizar jogador', options: [
        user, { ...string('funcao', 'Função no time'), choices: ['Duelista', 'Iniciador', 'Controlador', 'Sentinela', 'Flex'].map(name => ({ name, value: name })) },
        { ...string('vaga', 'Vaga no time'), choices: ['Titular', 'Reserva'].map(name => ({ name, value: name })) }
      ] },
      { type: 1, name: 'remover', description: 'Retirar jogador do elenco', options: [user] }
    ] },
    { name: 'lineup', description: 'Ver a escalação do time' },
    { name: 'resultado', description: 'Registrar o placar de uma partida', options: [
      string('adversario', 'Nome do outro time'), string('mapa', 'Mapa jogado'), score('ember', 'Rounds da Ember Veil'), score('rival', 'Rounds do adversário')
    ] },
    { name: 'gg', description: 'Cumprimentar o adversário' }
  ];

  const reply = (i, content, privateReply = true, status = 'ok') => {
    i.setOutcome?.(status);
    return i.reply({
      content, allowedMentions: { parse: [] }, ...(privateReply ? { flags: MessageFlags.Ephemeral } : {})
    });
  };

  const announceResults = resultAnnouncements(db, client, Routes.channelMessages,
    env.DISCORD_GUILD_ID, env.RESULTS_CHANNEL_ID || '1575361261993201757', env.PUBLIC_URL && new URL(resultsBannerPath, env.PUBLIC_URL).href);
  client.once(Events.ClientReady, async ready => {
    void announceResults();
    try {
      const guild = await ready.guilds.fetch(env.DISCORD_GUILD_ID);
      await guild.commands.set(commands);
      console.log('Comandos da Ember Veil registrados.');
    } catch (error) {
      console.error('Falha ao registrar comandos no servidor:', error.message);
    }
  });

  async function handle(i) {
    if (i.guildId !== env.DISCORD_GUILD_ID) return;
    if (i.isButton() && i.customId.startsWith('attendance:')) {
      const [, id, answer] = i.customId.split(':');
      const event = db.prepare('SELECT * FROM training WHERE id = ?').get(id);
      if (!event || (event.message && event.message !== i.message.id) || event.date <= Date.now()) {
        return reply(i, 'As confirmações deste treino já foram encerradas.');
      }
      if (!['Confirmado', 'Talvez', 'Ausente'].includes(answer)) return;
      db.prepare(`INSERT INTO attendance VALUES (?, ?, ?, ?) ON CONFLICT(training, player)
        DO UPDATE SET name = excluded.name, answer = excluded.answer`)
        .run(id, i.user.id, i.member?.displayName || i.user.displayName, answer);
      return reply(i, 'Presença atualizada: ' + answer + '.');
    }

    if (!i.isChatInputCommand()) return;
    if (i.commandName === 'gg') {
      return reply(i, 'Prezada equipe adversária, agradecemos pela partida. Desejamos boa sorte nos próximos jogos. GG!', false);
    }
    if (i.commandName === 'lineup') {
      return i.reply(lineupMessage(roster.all().slice(0, 20), bannerUrl));
    }

    const roles = i.member?.roles;
    const captain = env.STAFF_ROLE_ID && (Array.isArray(roles) ? roles.includes(env.STAFF_ROLE_ID) : roles?.cache.has(env.STAFF_ROLE_ID));
    if (!captain && !i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return reply(i, 'Este comando é reservado à staff do time.');
    }

    const option = name => i.options.getString(name, true).trim();
    if (i.commandName === 'treino') {
      const title = option('titulo');
      const dateText = option('data');
      const date = Date.parse(dateText);
      if (!title || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(dateText) ||
          !Number.isFinite(date) || date <= Date.now()) {
        return reply(i, 'Informe um título e uma data futura com fuso. Exemplo: 2027-01-10T20:00-04:00.', true, 'invalid');
      }

      const id = randomUUID();
      db.prepare('INSERT INTO training (id, title, date) VALUES (?, ?, ?)').run(id, title, date);
      let result;
      try {
        result = await i.reply({
          embeds: [{ title, description: `<t:${Math.floor(date / 1000)}:F>\nConfirme sua presença abaixo.`, color: 0xf45c40 }],
          components: [{ type: 1, components: [
            ['Confirmo', 'Confirmado', 3], ['Talvez', 'Talvez', 2], ['Não vou', 'Ausente', 4]
          ].map(([label, answer, style]) => ({ type: 2, label, style, custom_id: `attendance:${id}:${answer}` })) }],
          allowedMentions: { parse: [] },
          withResponse: true
        });
      } catch (error) {
        db.prepare('DELETE FROM training WHERE id = ?').run(id);
        throw error;
      }
      const message = result.resource?.message || await i.fetchReply();
      db.prepare('UPDATE training SET message = ? WHERE id = ?').run(message.id, id);
      return;
    }

    if (i.commandName === 'elenco') {
      const player = i.options.getUser('jogador', true);
      if (player.bot) return reply(i, 'Escolha um jogador do servidor.', true, 'invalid');
      if (i.options.getSubcommand() === 'remover') {
        const change = db.prepare('DELETE FROM roster WHERE player = ?').run(player.id);
        return reply(i, change.changes ? 'Jogador removido.' : 'Esse jogador já está fora do elenco.');
      }

      const slot = option('vaga');
      const count = db.prepare('SELECT count(*) AS total FROM roster WHERE slot = ? AND player != ?').get(slot, player.id).total;
      if (slot === 'Titular' && count >= 5) return reply(i, 'As cinco vagas de titular estão preenchidas.', true, 'full');
      db.prepare(`INSERT INTO roster VALUES (?, ?, ?, ?) ON CONFLICT(player)
        DO UPDATE SET name = excluded.name, role = excluded.role, slot = excluded.slot`)
        .run(player.id, player.displayName, option('funcao'), slot);
      return reply(i, 'Escalação atualizada.');
    }

    if (i.commandName === 'resultado') {
      const opponent = option('adversario');
      const map = option('mapa');
      if (!opponent || !map) return reply(i, 'Preencha o adversário e o mapa.');
      const ours = i.options.getInteger('ember', true);
      const theirs = i.options.getInteger('rival', true);
      db.prepare('INSERT OR IGNORE INTO scores VALUES (?, ?, ?, ?, ?, ?)')
        .run(i.id, opponent, map, ours, theirs, Date.now());
      void announceResults();
      return reply(i, 'Resultado registrado.');
    }
  }

  discordStaff = {
    client, guildId: env.DISCORD_GUILD_ID, roleId: env.STAFF_ROLE_ID,
    manageGuild: PermissionFlagsBits.ManageGuild,
    viewChannel: PermissionFlagsBits.ViewChannel,
    sendMessages: PermissionFlagsBits.SendMessages,
    embedLinks: PermissionFlagsBits.EmbedLinks,
    mentionEveryone: PermissionFlagsBits.MentionEveryone,
    sendMessage: (channel, message) => {
      if (message.flags !== MessageFlags.IsComponentsV2) return channel.send(message);
      const { allowedMentions, ...payload } = message;
      return client.rest.post(Routes.channelMessages(channel.id), {
        body: { ...payload, allowed_mentions: allowedMentions }
      });
    },
    premier, drafts, commands, handle, announceResults
  };
  client.on(Events.InteractionCreate, async interaction => {
    try {
      await handle(interaction);
    } catch (error) {
      console.error('Falha ao processar interação:', error.message);
      if (!interaction.replied && !interaction.deferred) {
        await reply(interaction, 'Falha ao processar a ação. Tente novamente.').catch(() => {});
      }
    }
  });
  client.on(Events.Error, error => console.error('Erro no Discord:', error.message));
  await client.login(env.DISCORD_TOKEN);
}
