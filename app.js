import { createServer } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dashboard } from './dashboard.js';

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
const roster = db.prepare('SELECT * FROM roster ORDER BY slot DESC, name');
const trainings = db.prepare('SELECT * FROM training WHERE message IS NOT NULL AND date > ? ORDER BY date LIMIT 20');
const attendance = db.prepare('SELECT name, answer FROM attendance WHERE training = ? ORDER BY name');
const scores = db.prepare('SELECT * FROM scores ORDER BY date DESC LIMIT 30');

const password = env.DASHBOARD_PASSWORD;
const digest = value => createHash('sha256').update(value).digest();
if (password) {
  const expected = digest('ember:' + password);
  createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const header = request.headers.authorization || '';
    const authorized = header.startsWith('Basic ') &&
      timingSafeEqual(expected, digest(Buffer.from(header.slice(6), 'base64')));
    if (!authorized) {
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Ember Veil", charset="UTF-8"' });
      return response.end('Acesso restrito');
    }
    if (request.url !== '/') {
      response.writeHead(404);
      return response.end();
    }
    const upcoming = trainings.all(Date.now()).map(row => ({ ...row, people: attendance.all(row.id) }));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(dashboard(upcoming, roster.all(), scores.all()));
  }).listen(Number(env.PORT || 3000), env.HOST || '127.0.0.1', () => console.log('Dashboard iniciado.'));
}

if (Boolean(env.DISCORD_TOKEN) !== Boolean(env.DISCORD_GUILD_ID)) {
  throw new Error('Configure DISCORD_TOKEN e DISCORD_GUILD_ID juntos.');
}
if (!password && !env.DISCORD_TOKEN) throw new Error('Configure o painel ou o bot no arquivo .env.');

if (env.DISCORD_TOKEN) {
  const { Client, Events, GatewayIntentBits, PermissionFlagsBits, MessageFlags } = await import('discord.js');
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

  const reply = (i, content, privateReply = true) => i.reply({
    content, allowedMentions: { parse: [] }, ...(privateReply ? { flags: MessageFlags.Ephemeral } : {})
  });

  client.once(Events.ClientReady, async ready => {
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
      const lines = roster.all().slice(0, 20).map(row => `• <@${row.player}> · ${row.role} · ${row.slot}`);
      return reply(i, lines.length ? '**Escalação Ember Veil**\n' + lines.join('\n') : 'O elenco ainda está vazio.', false);
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
        return reply(i, 'Informe um título e uma data futura com fuso. Exemplo: 2027-01-10T20:00-04:00.');
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
      if (player.bot) return reply(i, 'Escolha um jogador do servidor.');
      if (i.options.getSubcommand() === 'remover') {
        const change = db.prepare('DELETE FROM roster WHERE player = ?').run(player.id);
        return reply(i, change.changes ? 'Jogador removido.' : 'Esse jogador já está fora do elenco.');
      }

      const slot = option('vaga');
      const count = db.prepare('SELECT count(*) AS total FROM roster WHERE slot = ? AND player != ?').get(slot, player.id).total;
      if (slot === 'Titular' && count >= 5) return reply(i, 'As cinco vagas de titular estão preenchidas.');
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
      return reply(i, `**${map}** · Ember Veil ${ours} × ${theirs} ${opponent}`, false);
    }
  }

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
