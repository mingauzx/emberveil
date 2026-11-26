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
  ['ok', 'Ação concluída.'], ['draft-saved', 'Rascunho salvo.'],
  ['draft-invalid', 'Informe um nome de até 100 caracteres e confira o tamanho dos campos.'],
  ['draft-conflict', 'Outra edição foi salva antes da sua. O painel abriu a versão mais recente.'], ['premier-approved', 'Resultado Premier publicado.'],
  ['premier-rejected', 'Partida descartada.'], ['premier-reviewed', 'Essa partida já foi revisada.'], ['sent-v2', 'Mensagem Components V2 enviada.'], ['sent-classic', 'Embed clássico enviado.'], ['invalid', 'Revise os campos e tente novamente.'],
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
    fields + (['elenco', 'resultado'].includes(command.name) ? '' : channelField) + '<button>Executar comando</button></form></details>';
}

export function dashboard(trainings, roster, matches, commands = [], noticeCode, choices = null, signedIn = false, premier = null, drafts = null) {
  const tools = commands.flatMap(command => {
    const subcommands = command.options?.filter(option => option.type === 1) || [];
    return subcommands.length ? subcommands.map(sub => webCommand(command, sub)) : [webCommand(command)];
  }).join('');
  const notice = statuses.get(noticeCode);
  const selectedDraft = drafts?.selected;
  const draftOptions = (drafts?.entries || []).map(draft =>
    '<option value="' + escape(draft.id) + '"' + (draft.id === selectedDraft?.id ? ' selected' : '') + '>' +
    escape(draft.name) + '</option>'
  ).join('');
  const openDraft = '<form class="draft-select" method="get" action="/#staff"><label>Embeds salvos<select name="draft" required>' +
    '<option value="">Selecione um rascunho</option>' + draftOptions +
    '</select></label><button type="submit">Abrir</button><a href="/#staff">Novo embed</a></form>';
  const roleOptions = (choices?.roles || []).map(role =>
    '<option value="' + escape(role.id) + '" data-markup="' + escape('<@&' + role.id + '>') + '">@' + escape(role.name) + '</option>'
  ).join('');
  const emojiOptions = (choices?.emojis || []).map(emoji =>
    '<option value="' + escape(emoji.id) + '" data-markup="' + escape('<' + (emoji.animated ? 'a' : '') + ':' + emoji.name + ':' + emoji.id + '>') + '">:' + escape(emoji.name) + ':</option>'
  ).join('');
  const buttons = [1, 2, 3, 4, 5].map(index =>
    '<div class="editor-row"><label>Texto do botão ' + index + '<input name="button_label_' + index + '" maxlength="80"></label>' +
    '<label>URL do botão ' + index + '<input name="button_url_' + index + '" type="url" maxlength="512" placeholder="https://"></label><label>Emoji do botão ' + index + '<select name="button_emoji_' + index + '"><option value="">Sem emoji</option>' + emojiOptions + '</select></label></div>'
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
    return '<tr><td>' + escape(match.opponent) + (match.id?.startsWith('premier:') ? '<small>Premier</small>' : '') + '</td><td>' + escape(match.map) +
      '</td><td><strong>' + match.ours + ' × ' + match.theirs + '</strong></td><td>' +
      status + '</td><td>' + time.format(match.date) + '</td></tr>';
  }).join('');
  const extraFields = [1, 2, 3].map(index =>
    '<div class="editor-group"><label>Título da seção ' + index + '<input name="field_title_' + index + '" maxlength="100"></label>' +
    '<label>Texto da seção ' + index + '<textarea name="field_body_' + index + '" maxlength="1024" rows="3"></textarea></label></div>'
  ).join('');
  const syncStatus = {
    disabled: 'Aguardando credenciais oficiais da Riot e uma conta autorizada.',
    waiting: 'Consultando o histórico Premier.',
    ready: 'Importação Premier ativa.',
    error: 'A Riot não respondeu à última consulta. O bot vai tentar novamente automaticamente.'
  };
  const premierPanel = premier ? '<div class="command-list"><h3>Resultados Premier para revisar</h3><p>' +
    syncStatus[premier.state] + '</p>' + (premier.pending.map(match =>
      '<article><h3>' + escape(match.map) + ' · ' + escape(match.ours) + ' × ' + escape(match.theirs) +
      '</h3><p>' + time.format(match.date) + '</p><form method="post" action="/staff">' +
      '<input type="hidden" name="match" value="' + escape(match.id) + '">' +
      '<div class="editor-row"><label>Adversário<input name="opponent" maxlength="80" required></label>' +
      '<label>Mapa<input name="map" maxlength="80" value="' + escape(match.map) + '" required></label></div>' +
      '<div class="editor-row"><button name="action" value="premier/approve">Publicar resultado</button>' +
      '<button name="action" value="premier/reject" formnovalidate>Descartar</button></div></form></article>'
    ).join('') || empty('Nenhuma partida aguardando revisão.')) + '</div>' : '';
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
.studio{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:22px}.studio>div,.studio>aside{min-width:0}.studio aside{position:sticky;top:16px;align-self:start;padding:16px;background:#100f12;border:1px solid var(--line);border-radius:5px}.studio aside h4{margin:0 0 8px}.studio .preview{background:#211f25;min-height:110px}.studio .preview[data-format=v2]{max-width:100%;padding:18px}.studio .preview[data-format=classic]{max-width:420px}.studio form details{border:1px solid var(--line);border-radius:5px}.studio form details[open]>*+*{margin-top:10px}.studio .editor-group{display:grid;gap:8px;padding:10px;background:#221a20;border-radius:4px}.studio .preview-banner{display:block;max-width:100%;border-radius:4px;margin-top:12px}.studio .preview-thumb{float:right;width:62px;height:62px;object-fit:cover;border-radius:4px;margin:0 0 8px 10px}.studio .preview strong{font-size:1.25rem}.studio .preview small{margin-top:6px}.studio .preview hr{border:0;border-top:1px solid #514852;margin:10px 0}.studio .preview h4{margin:10px 0 4px}.studio .preview h4+p{margin-top:0}.studio .preview img[hidden]{display:none}.command-list{border-top:1px solid var(--line);padding-top:16px}@media(max-width:760px){.studio{grid-template-columns:1fr}.studio aside{position:static}}
.draft-select{display:flex;gap:10px;align-items:end;margin:0 0 16px;flex-wrap:wrap}.draft-select label{min-width:min(100%,270px)}.draft-select a{padding:10px}.draft-actions{display:flex;flex-wrap:wrap;gap:8px}.draft-actions button+button,.draft-select button{background:#39272e;color:#fff}
</style>
</head>
<body><header><nav aria-label="Painel"><strong>EMBER VEIL</strong><a href="#treinos">Treinos</a><a href="#elenco">Elenco</a><a href="#historico">Histórico</a>${tools ? '<a href="#staff">Staff</a>' : ''}${signedIn ? '<a href="/sair">Sair</a>' : '<a href="/auth/discord">Entrar com Discord</a>'}</nav></header>
<main><div class="hero"><h1>Painel do time</h1><p>Agenda, escalação e partidas da Ember Veil.</p></div>
<div class="stats"><div><strong>${trainings.length}</strong><small>Próximos treinos</small></div><div><strong>${roster.filter(player => player.slot === "Titular").length}/5</strong><small>Titulares</small></div><div><strong>${matches.length}</strong><small>Resultados recentes</small></div></div><div class="grid"><section id="treinos"><h2>Próximos treinos</h2>${visits || empty('Nenhum treino agendado. Use /treino marcar no Discord.')}</section>
<section id="elenco"><h2>Escalação</h2>${players ? '<ul>' + players + '</ul>' : empty('Nenhum jogador cadastrado. Use /elenco definir no Discord.')}</section></div>
<section id="historico"><h2>Últimas partidas</h2>${results ? '<div class="scroll"><table><thead><tr><th>Adversário</th><th>Mapa</th><th>Placar</th><th>Resultado</th><th>Data</th></tr></thead><tbody>' + results + '</tbody></table></div>' : empty('Nenhuma partida registrada. Use /resultado no Discord.')}</section>
${tools ? `<section id="staff"><h2>Ferramentas da staff</h2>${notice ? '<p class="notice" role="status">' + notice + '</p>' : ''}
${openDraft}<div class="studio"><div><h3>${selectedDraft ? 'Editar mensagem' : 'Criar mensagem'}</h3>
<form id="embed-form" method="post" action="/staff" data-draft="${escape(JSON.stringify(selectedDraft?.data || {}))}">
<input type="hidden" name="draft_id" value="${escape(selectedDraft?.id || '')}"><input type="hidden" name="draft_revision" value="${escape(selectedDraft?.revision || '')}">
<label>Nome do rascunho<input name="draft_name" maxlength="100" value="${escape(selectedDraft?.name || '')}" placeholder="Ex. Anúncio da próxima scrim"></label>
<label>Título<input name="title" maxlength="256"></label><label>Descrição<textarea name="description" maxlength="4096" rows="5"></textarea></label>
<div class="editor-row"><label>Formato<select name="format"><option value="v2" selected>Components V2 · Layout largo</option><option value="classic">Embed clássico</option></select></label><label>Cor <input name="color" type="color" value="#ff8069"></label></div>
<div class="editor-row"><div><label>Cargo<select name="role"><option value="">Selecione</option>${roleOptions}</select></label><button type="button" data-insert="role">Inserir cargo</button></div>
<div><label>Emoji personalizado<select name="emoji"><option value="">Selecione</option>${emojiOptions}</select></label><button type="button" data-insert="emoji">Inserir emoji</button></div></div>
<label class="check"><input name="ping" type="checkbox"> Notificar o cargo selecionado</label>
<details><summary>Autor, imagem e rodapé</summary>
<label>Autor<input name="author" maxlength="256"></label><div class="editor-row"><label>URL da imagem<input name="banner" type="url" maxlength="2000" placeholder="https://"></label><label>URL da miniatura<input name="thumbnail" type="url" maxlength="2000" placeholder="https://"></label></div><label>Rodapé<input name="footer" maxlength="500"></label></details>
<details><summary>Seções adicionais</summary>${extraFields}</details>
<details><summary>Botões de link</summary>${buttons}</details>
<label class="check"><input name="dividers" type="checkbox" checked> Divisórias entre blocos no V2</label>
${channelField}<div class="draft-actions"><button id="send-format" name="action" value="embed">Enviar Components V2</button>
<button name="action" value="draft/save" formnovalidate>Salvar rascunho</button>
${selectedDraft ? '<button name="action" value="draft/copy" formnovalidate>Salvar cópia</button>' : ''}</div></form></div>
<aside><h4>Prévia no Discord</h4><small id="preview-format">Components V2 · Layout largo</small>
<div class="preview" id="embed-preview" data-format="v2" aria-label="Prévia da mensagem"><img class="preview-thumb" alt="Miniatura" hidden><small class="preview-author"></small><strong>Título da mensagem</strong><div class="preview-blocks"></div><img class="preview-banner" alt="Imagem da mensagem" hidden><small class="preview-footer"></small><div id="preview-buttons"></div></div></aside></div>
${premierPanel}<div class="command-list"><h3>Comandos do Discord</h3>${tools}</div></section>
<script>
const form = document.querySelector('#embed-form');
const preview = document.querySelector('#embed-preview');
const saved = JSON.parse(form.dataset.draft);
if (form.elements.draft_id.value) {
  form.elements.ping.checked = false;
  form.elements.dividers.checked = false;
}
for (const [name, value] of Object.entries(saved)) {
  const field = form.elements.namedItem(name);
  if (!field) continue;
  if (field.type === 'checkbox') field.checked = value === 'on';
  else if (field.type !== 'select-one' || [...field.options].some(option => option.value === value)) field.value = value;
}
let insertTarget = form.elements.description;
form.addEventListener('focusin', event => {
  if (event.target.tagName === 'TEXTAREA') insertTarget = event.target;
});
const roleOptions = new Map([...form.elements.role.options].map(option => [option.value, option.textContent]));
const emojiOptions = new Map([...form.elements.emoji.options].map(option => [option.value, option.textContent]));
function renderText(body, value) {
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
}
function updatePreview() {
  const wide = form.elements.format.value === 'v2';
  const separator = wide && form.elements.dividers.checked;
  document.querySelector('#send-format').textContent = wide ? 'Enviar Components V2' : 'Enviar embed clássico';
  document.querySelector('#preview-format').textContent = wide ? 'Components V2 · Layout largo' : 'Embed clássico';
  form.elements.dividers.disabled = !wide;
  preview.querySelector('strong').textContent = form.elements.title.value || 'Título da mensagem';
  preview.querySelector('.preview-author').textContent = form.elements.author.value;
  preview.querySelector('.preview-footer').textContent = form.elements.footer.value;
  const blocks = preview.querySelector('.preview-blocks');
  blocks.replaceChildren();
  const body = document.createElement('p');
  if (separator && form.elements.description.value) blocks.append(document.createElement('hr'));
  renderText(body, form.elements.description.value || 'A descrição aparece aqui.');
  blocks.append(body);
  for (let index = 1; index <= 3; index++) {
    const heading = form.elements['field_title_' + index].value.trim();
    const value = form.elements['field_body_' + index].value.trim();
    if (!heading && !value) continue;
    if (separator) blocks.append(document.createElement('hr'));
    const title = document.createElement('h4');
    title.textContent = heading;
    const field = document.createElement('p');
    renderText(field, value);
    blocks.append(title, field);
  }
  for (const [field, selector] of [['banner', '.preview-banner'], ['thumbnail', '.preview-thumb']]) {
    const image = preview.querySelector(selector);
    const url = form.elements[field].value.trim();
    let address;
    try { address = new URL(url); } catch {}
    image.hidden = address?.protocol !== 'https:' || Boolean(address.username || address.password);
    if (image.hidden) image.removeAttribute('src');
    else if (image.getAttribute('src') !== address.href) image.src = address.href;
  }
  preview.style.borderLeftColor = form.elements.color.value;
  preview.dataset.format = form.elements.format.value;
  const buttons = document.querySelector('#preview-buttons');
  buttons.replaceChildren();
  for (let index = 1; index <= 5; index++) {
    const label = form.elements['button_label_' + index].value.trim();
    if (!label) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = true;
    const emoji = form.elements['button_emoji_' + index].selectedOptions[0]?.dataset.markup;
    renderText(button, emoji ? emoji + ' ' + label : label);
    buttons.append(button);
  }
}
form.addEventListener('input', updatePreview);
form.addEventListener('click', event => {
  const name = event.target.dataset.insert;
  if (!name) return;
  const markup = form.elements[name].selectedOptions[0]?.dataset.markup;
  if (!markup) return;
  const start = insertTarget.selectionStart;
  const end = insertTarget.selectionEnd;
  if (insertTarget.value.length - (end - start) + markup.length + 1 > insertTarget.maxLength) return;
  insertTarget.setRangeText(markup + ' ', start, end, 'end');
  insertTarget.focus();
  updatePreview();
});
updatePreview();
</script>` : ''}
</main></body></html>`;
}
