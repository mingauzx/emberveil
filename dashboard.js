import { commandOptions } from './staff.js';

const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const time = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Cuiaba'
});
const empty = message => '<p class="empty">' + message + '</p>';

const channelField = '<label> ID do canal <input name="channel" required inputmode="numeric" pattern="[0-9]{17,20}" placeholder="Cole o ID do canal"></label>';
const statuses = new Map([
  ['ok', 'Ação concluída.'], ['invalid', 'Revise os campos e tente novamente.'],
  ['channel', 'Escolha um canal onde você e o bot possam enviar mensagens. Para embeds, dê ao bot a permissão de inserir links.'],
  ['full', 'As cinco vagas de titular estão preenchidas.'], ['failed', 'O Discord não concluiu a ação. Confira o canal antes de tentar novamente.']
]);

function webCommand(command, subcommand) {
  const action = subcommand ? command.name + '/' + subcommand.name : command.name;
  const label = '/' + action.replace('/', ' ');
  const fields = commandOptions(command, subcommand).map(option => {
    const label = option.type === 6 ? 'ID Discord do jogador' : escape(option.description);
    let input;
    if (option.choices) {
      const choices = option.choices.map(choice => '<option value="' + escape(choice.value) + '">' + escape(choice.name) + '</option>').join('');
      input = '<select required name="' + option.name + '">' + choices + '</select>';
    } else {
      const props = option.type === 4
        ? 'type="number" min="' + option.min_value + '" max="' + option.max_value + '"'
        : option.type === 6 ? 'inputmode="numeric" pattern="[0-9]{17,20}"' : 'maxlength="' + option.max_length + '"';
      input = '<input required name="' + option.name + '" ' + props + '>';
    }
    return '<label>' + label + input + '</label>';
  }).join('');
  return '<details><summary>' + label + '</summary><form method="post" action="/staff"><input type="hidden" name="action" value="' + action + '">' +
    fields + (command.name === 'elenco' ? '' : channelField) + '<button>Executar comando</button></form></details>';
}

export function dashboard(trainings, roster, matches, commands = [], noticeCode, choices = null, signedIn = false) {
  const tools = commands.flatMap(command => {
    const subcommands = command.options?.filter(option => option.type === 1) || [];
    return subcommands.length ? subcommands.map(sub => webCommand(command, sub)) : [webCommand(command)];
  }).join('');
  const notice = statuses.get(noticeCode);
  const roleOptions = (choices?.roles || []).map(role =>
    '<option value="' + escape(role.id) + '" data-markup="' + escape('<@&' + role.id + '>') + '">@' + escape(role.name) + '</option>'
  ).join('');
  const emojiOptions = (choices?.emojis || []).map(emoji =>
    '<option value="' + escape(emoji.id) + '" data-markup="' + escape('<' + (emoji.animated ? 'a' : '') + ':' + emoji.name + ':' + emoji.id + '>') + '">:' + escape(emoji.name) + ':</option>'
  ).join('');
  const buttons = [1, 2, 3].map(index =>
    '<div class="editor-row"><label>Texto do botão ' + index + '<input name="button_label_' + index + '" maxlength="80"></label>' +
    '<label>URL do botão ' + index + '<input name="button_url_' + index + '" type="url" maxlength="512" placeholder="https://"></label></div>'
  ).join('');
  const visits = trainings.map(event => {
    const groups = ['Confirmado', 'Talvez', 'Ausente'].map(status => {
      const people = event.people.filter(person => person.answer === status);
      return '<div><strong>' + status + ' · ' + people.length + '</strong><span>' +
        (signedIn ? (people.map(person => escape(person.name)).join(', ') || '—') : '') + '</span></div>';
    });
    return '<article><h3>' + escape(event.title) + '</h3><p>' +
      time.format(event.date) + ' · Cuiabá</p><div class="attendance">' + groups.join('') + '</div></article>';
  }).join('');
  const players = roster.map(player => '<li><span><strong>' + escape(player.name) +
    '</strong><small>' + escape(player.role) + '</small></span><span class="tag">' +
    escape(player.slot) + '</span></li>').join('');
  const results = matches.map(match => {
    const status = match.ours > match.theirs ? 'Vitória' : match.ours < match.theirs ? 'Derrota' : 'Empate';
    return '<tr><td>' + escape(match.opponent) + '</td><td>' + escape(match.map) +
      '</td><td><strong>' + match.ours + ' × ' + match.theirs + '</strong></td><td>' +
      status + '</td><td>' + time.format(match.date) + '</td></tr>';
  }).join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ember Veil · Painel do time</title>
<style>
:root{color-scheme:dark;font:16px system-ui,sans-serif;color:#f7f1ee;background:#100e11;--accent:#ff8069;--muted:#c4b5b9;--line:#3d2b32;--surface:#1a151a}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 85% 0%,#412023 0%,transparent 42%)}main,nav{max-width:1240px;margin:auto;padding:0 26px}
header{border-bottom:1px solid var(--line);background:#151115eb}nav{display:flex;flex-wrap:wrap;gap:24px;align-items:center;min-height:68px;padding-block:14px}
nav strong{margin-right:auto;color:#fff;letter-spacing:.17em;font-size:.93rem}nav strong:before{content:'';display:inline-block;width:11px;height:11px;background:var(--accent);transform:rotate(45deg);margin-right:12px}a{color:var(--muted);text-decoration:none}a:hover,a:focus-visible{color:white;text-decoration:underline}
.hero{padding:58px 0 32px}h1,h2,h3,p{margin:0}h1{font-size:clamp(3rem,8vw,6.2rem);line-height:.95;letter-spacing:-.08em;font-weight:850}p,small{color:var(--muted)}.hero p{margin-top:16px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 0 22px}.stats div{display:flex;flex-direction:column;gap:4px;border:1px solid var(--line);border-top:2px solid #af5349;padding:15px 18px;background:var(--surface)}.stats strong{font-size:1.55rem;color:var(--accent)}
.grid,.staff-grid{display:grid;grid-template-columns:1.35fr 1fr;gap:16px}section{min-width:0;padding:23px;border:1px solid var(--line);border-radius:4px;background:var(--surface);margin-bottom:16px;scroll-margin-top:14px}h2{font-size:1.24rem;letter-spacing:-.025em;margin-bottom:18px}h3{overflow-wrap:anywhere}
article,.empty,.preview,.notice{padding:16px;border-left:2px solid #9d4a45;background:#251c23;margin-top:8px}.notice{margin-bottom:18px}.preview{white-space:pre-wrap;overflow-wrap:anywhere}.preview p{margin-top:8px}article p{margin:6px 0 13px}.attendance{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.attendance span,small{display:block;overflow-wrap:anywhere}.attendance span{margin-top:5px;color:var(--muted)}.attendance strong{font-size:.84rem;color:var(--accent)}
ul{margin:0;padding:0;list-style:none}li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line)}.tag{font-size:.76rem;font-weight:700;color:var(--accent);background:#3c2429;padding:5px 9px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}td,th{padding:12px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-size:.84rem}
.editor-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.editor-row button{margin-top:6px}.editor-row label{align-content:start}.check{display:flex;align-items:center;gap:8px}.check input{width:auto;min-height:auto}.preview img{width:1.25em;vertical-align:middle}.preview button{margin:10px 8px 0 0;padding:6px 9px;opacity:.75}.preview p:empty,.preview strong:empty{display:none}.preview[data-format=v2]{border:1px solid #58414b;border-left-width:3px;border-radius:8px}form{display:grid;gap:12px;margin-top:12px}label{display:grid;gap:5px;color:var(--muted);font-size:.9rem}input,textarea,select,button{font:inherit}input,textarea,select{width:100%;min-height:40px;background:#100e11;color:#fff;border:1px solid #58414b;border-radius:4px;padding:9px}input[type=color]{max-width:90px;padding:4px}textarea{resize:vertical}button{justify-self:start;border:0;border-radius:4px;padding:10px 15px;background:var(--accent);color:#1b1012;font-weight:800;cursor:pointer}button:hover{background:#ffab98}details{padding:12px;border-bottom:1px solid var(--line)}summary{cursor:pointer;font-weight:650}
@media(max-width:760px){.grid,.staff-grid{grid-template-columns:1fr;gap:0}.staff-grid{gap:24px}.hero{padding-top:42px}nav{gap:12px}main,nav{padding-inline:16px}.stats div{padding:12px 9px}.stats small{font-size:.75rem}section{padding:16px}}@media(max-width:400px){.attendance{grid-template-columns:1fr}}
</style>
</head>
<body><header><nav aria-label="Painel"><strong>EMBER VEIL</strong><a href="#treinos">Treinos</a><a href="#elenco">Elenco</a><a href="#historico">Histórico</a>${tools ? '<a href="#staff">Staff</a>' : ''}${signedIn ? '<a href="/sair">Sair</a>' : '<a href="/auth/discord">Entrar com Discord</a>'}</nav></header>
<main><div class="hero"><h1>Painel do time</h1><p>Agenda, escalação e partidas da Ember Veil.</p></div>
<div class="stats"><div><strong>${trainings.length}</strong><small>Próximos treinos</small></div><div><strong>${roster.filter(player => player.slot === "Titular").length}/5</strong><small>Titulares</small></div><div><strong>${matches.length}</strong><small>Resultados recentes</small></div></div><div class="grid"><section id="treinos"><h2>Próximos treinos</h2>${visits || empty('Nenhum treino agendado. Use /treino marcar no Discord.')}</section>
<section id="elenco"><h2>Escalação</h2>${players ? '<ul>' + players + '</ul>' : empty('Nenhum jogador cadastrado. Use /elenco definir no Discord.')}</section></div>
<section id="historico"><h2>Últimas partidas</h2>${results ? '<div class="scroll"><table><thead><tr><th>Adversário</th><th>Mapa</th><th>Placar</th><th>Resultado</th><th>Data</th></tr></thead><tbody>' + results + '</tbody></table></div>' : empty('Nenhuma partida registrada. Use /resultado no Discord.')}</section>
${tools ? `<section id="staff"><h2>Ferramentas da staff</h2>${notice ? '<p class="notice" role="status">' + notice + '</p>' : ''}
<div class="staff-grid"><div><h3>Criar embed</h3><form id="embed-form" method="post" action="/staff"><input type="hidden" name="action" value="embed">
<label>Título<input name="title" maxlength="256"></label><label>Descrição<textarea name="description" maxlength="4096" rows="5"></textarea></label>
<div class="editor-row"><label>Formato<select name="format"><option value="classic">Embed clássico</option><option value="v2">Components V2</option></select></label><label>Cor <input name="color" type="color" value="#ff8069"></label></div>
<div class="editor-row"><div><label>Cargo<select name="role"><option value="">Selecione</option>${roleOptions}</select></label><button type="button" data-insert="role">Inserir cargo</button></div>
<div><label>Emoji personalizado<select name="emoji"><option value="">Selecione</option>${emojiOptions}</select></label><button type="button" data-insert="emoji">Inserir emoji</button></div></div>
<label class="check"><input name="ping" type="checkbox"> Notificar o cargo selecionado</label>
<details><summary>Botões de link</summary>${buttons}</details>
<div class="preview" id="embed-preview" aria-label="Prévia do embed"><strong>Título do embed</strong><p>A descrição aparece aqui.</p><div id="preview-buttons"></div></div>
${channelField}<button>Enviar embed</button></form></div><div><h3>Comandos do Discord</h3>${tools}</div></div></section>
<script>
const form = document.querySelector('#embed-form');
const preview = document.querySelector('#embed-preview');
const description = form.elements.description;
const roleOptions = new Map([...form.elements.role.options].map(option => [option.value, option.textContent]));
const emojiOptions = new Map([...form.elements.emoji.options].map(option => [option.value, option.textContent]));
function updatePreview() {
  preview.querySelector('strong').textContent = form.elements.title.value || 'Título do embed';
  const body = preview.querySelector('p');
  body.replaceChildren();
  const value = description.value || 'A descrição aparece aqui.';
  for (const part of value.split(/(<@&[0-9]+>|<a?:[a-zA-Z0-9_]+:[0-9]+>)/g)) {
    if (part.startsWith('<@&') && roleOptions.has(part.slice(3, -1))) {
      body.append(roleOptions.get(part.slice(3, -1)));
    } else if (/^<a?:[a-zA-Z0-9_]+:[0-9]+>$/.test(part)) {
      const id = part.slice(part.lastIndexOf(':') + 1, -1);
      const image = document.createElement('img');
      image.alt = emojiOptions.get(id) || ':emoji:';
      image.src = 'https://cdn.discordapp.com/emojis/' + id + (part.startsWith('<a:') ? '.gif' : '.png');
      body.append(image);
    } else {
      body.append(part);
    }
  }
  preview.style.borderLeftColor = form.elements.color.value;
  preview.dataset.format = form.elements.format.value;
  const buttons = document.querySelector('#preview-buttons');
  buttons.replaceChildren();
  for (let index = 1; index <= 3; index++) {
    const label = form.elements['button_label_' + index].value.trim();
    if (!label) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = true;
    button.textContent = label;
    buttons.append(button);
  }
}
form.addEventListener('input', updatePreview);
form.addEventListener('click', event => {
  const name = event.target.dataset.insert;
  if (!name) return;
  const markup = form.elements[name].selectedOptions[0]?.dataset.markup;
  if (!markup) return;
  const start = description.selectionStart;
  const end = description.selectionEnd;
  if (description.value.length - (end - start) + markup.length + 1 > description.maxLength) return;
  description.setRangeText(markup + ' ', start, end, 'end');
  description.focus();
  updatePreview();
});
</script>` : ''}
</main></body></html>`;
}
