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
  const channelOptions = (choices?.channels || []).map(channel =>
    '<option value="' + escape(channel.id) + '" data-classic="' + channel.classic + '">#' + escape(channel.name) +
    (channel.category ? ' · ' + escape(channel.category) : '') + '</option>'
  ).join('');
  const emojiTiles = (choices?.emojis || []).map(emoji =>
    '<button class="emoji-tile" type="button" data-emoji="' + escape(emoji.id) + '" data-name="' + escape(emoji.name) +
    '" title=":' + escape(emoji.name) + ':"><img loading="lazy" src="https://cdn.discordapp.com/emojis/' +
    escape(emoji.id) + (emoji.animated ? '.gif' : '.png') + '?size=48" alt=""><span>:' +
    escape(emoji.name) + ':</span></button>'
  ).join('');
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
.studio{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:18px;align-items:start}
.studio>div,.studio aside{background:#170f15;border:1px solid #50313a;border-radius:14px;padding:20px}
.studio>div{box-shadow:inset 0 1px #ffffff0a}
.studio input,.studio textarea,.studio select,.studio button{border-radius:8px}
.studio :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.studio textarea{line-height:1.55}
.studio form details{border-radius:9px;background:#1e151b}
.studio .tools-row{display:flex;gap:7px;flex-wrap:wrap}
.studio .tools-row button,.studio .member-result,.studio .emoji-tile{background:#30212a;color:#f7f1ee;font-size:.85rem;font-weight:650}
.studio .tools-row button[aria-expanded=true],.studio .member-result:hover,.studio .emoji-tile:hover{background:#56313c}
.studio .picker{background:#241820;padding:12px;border-radius:9px;border:1px solid #50313a}
.studio .picker>*+*{margin-top:8px}
.emoji-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px;max-height:236px;overflow:auto}
.studio .emoji-tile{display:grid;justify-items:center;gap:4px;width:100%;min-width:0;padding:8px 4px}
.studio .emoji-tile[hidden]{display:none}
.emoji-tile img{width:29px;height:29px;object-fit:contain}
.emoji-tile span{width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem}
.member-results{display:grid;gap:5px;max-height:210px;overflow:auto}
.studio .member-result{width:100%;text-align:left;overflow-wrap:anywhere}
.member-result small{margin-top:3px}
.studio .preview-window{background:#19191f;border-radius:10px;padding:14px;margin-top:16px}
.preview-profile{display:flex;align-items:center;gap:10px;font-size:.85rem;color:#f7f1ee}
.preview-profile .avatar{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:50%;background:#75332f;color:#ffb29d;font-weight:800}
.preview-profile small{margin-top:2px}
.studio .preview{background:#25252d;border-radius:8px;margin-top:12px}
.studio .preview button{background:#40414c;color:#fff;opacity:1}
.preview .mention{background:#3d4270;color:#dedfff;border-radius:4px;padding:0 3px}
.destination{border:1px solid #50313a;border-radius:9px;padding:12px;min-width:0;margin:0;display:grid;gap:8px}
.destination legend{padding:0 5px;font-weight:700}
@media(max-width:760px){.studio{grid-template-columns:1fr}.studio>div,.studio aside{padding:14px}}
</style>
</head>
<body><header><nav aria-label="Painel"><strong>EMBER VEIL</strong><a href="#treinos">Treinos</a><a href="#elenco">Elenco</a><a href="#historico">Histórico</a>${tools ? '<a href="#staff">Staff</a>' : ''}${signedIn ? '<a href="/sair">Sair</a>' : '<a href="/auth/discord">Entrar com Discord</a>'}</nav></header>
<main><div class="hero"><h1>Painel do time</h1><p>Agenda, escalação e partidas da Ember Veil.</p></div>
<div class="stats"><div><strong>${trainings.length}</strong><small>Próximos treinos</small></div><div><strong>${roster.filter(player => player.slot === "Titular").length}/5</strong><small>Titulares</small></div><div><strong>${matches.length}</strong><small>Resultados recentes</small></div></div><div class="grid"><section id="treinos"><h2>Próximos treinos</h2>${visits || empty('Nenhum treino agendado. Use /treino marcar no Discord.')}</section>
<section id="elenco"><h2>Escalação</h2>${players ? '<ul>' + players + '</ul>' : empty('Nenhum jogador cadastrado. Use /elenco definir no Discord.')}</section></div>
<section id="historico"><h2>Últimas partidas</h2>${results ? '<div class="scroll"><table><thead><tr><th>Adversário</th><th>Mapa</th><th>Placar</th><th>Resultado</th><th>Data</th></tr></thead><tbody>' + results + '</tbody></table></div>' : empty('Nenhuma partida registrada. Use /resultado no Discord.')}</section>
${tools ? `<section id="staff"><h2>Ferramentas da staff</h2>${notice ? '<p class="notice" role="status">' + notice + '</p>' : ''}
${openDraft}<div class="studio"><div><h3>${selectedDraft ? 'Editar mensagem' : 'Criar mensagem'}</h3>
<form id="embed-form" method="post" action="/staff" data-draft="${escape(JSON.stringify(selectedDraft?.data || {}))}" data-members="${escape(JSON.stringify(choices?.members || []))}">
<input type="hidden" name="draft_id" value="${escape(selectedDraft?.id || '')}"><input type="hidden" name="draft_revision" value="${escape(selectedDraft?.revision || '')}">
<label>Nome do rascunho<input name="draft_name" maxlength="100" value="${escape(selectedDraft?.name || '')}" placeholder="Ex. Anúncio da próxima scrim"></label>
<label>Título<input name="title" maxlength="256"></label><label>Descrição<textarea name="description" maxlength="4096" rows="5"></textarea></label>
<div class="editor-row"><label>Formato<select name="format"><option value="v2" selected>Components V2 · Layout largo</option><option value="classic">Embed clássico</option></select></label><label>Cor <input name="color" type="color" value="#ff8069"></label></div>
<div class="tools-row" aria-label="Inserir no texto"><button type="button" data-picker="members" aria-controls="embed-members" aria-expanded="false">@ Membro</button>
<button type="button" data-picker="roles" aria-controls="embed-roles" aria-expanded="false">@ Cargo</button>
<button type="button" data-picker="emojis" aria-controls="embed-emojis" aria-expanded="false">☺ Emojis do servidor</button></div>
<div class="picker" id="embed-members" hidden><label>Buscar membro<input id="member-query" type="search" maxlength="32" placeholder="Nome de usuário ou apelido" autocomplete="off"></label>
<small id="member-status" role="status"></small><div class="member-results" id="member-results"></div></div>
<div class="picker" id="embed-roles" hidden><label>Cargo<select name="role"><option value="">Selecione um cargo</option>${roleOptions}</select></label>
<button type="button" data-insert-role>Inserir cargo</button></div>
<div class="picker" id="embed-emojis" hidden><label>Buscar emoji<input id="emoji-query" type="search" placeholder="Nome do emoji" autocomplete="off"></label>
<div id="emoji-gallery" class="emoji-gallery">${emojiTiles}</div><small id="emoji-empty" role="status" hidden>Nenhum emoji encontrado.</small></div>
<label class="check"><input name="ping_members" type="checkbox"> Notificar os membros marcados</label>
<label class="check"><input name="ping" type="checkbox"> Notificar o cargo selecionado</label>
<details><summary>Autor, imagem e rodapé</summary>
<label>Autor<input name="author" maxlength="256"></label><div class="editor-row"><label>URL da imagem<input name="banner" type="url" maxlength="2000" placeholder="https://"></label><label>URL da miniatura<input name="thumbnail" type="url" maxlength="2000" placeholder="https://"></label></div><label>Rodapé<input name="footer" maxlength="500"></label></details>
<details><summary>Seções adicionais</summary>${extraFields}</details>
<details><summary>Botões de link</summary>${buttons}</details>
<label class="check"><input name="dividers" type="checkbox" checked> Divisórias entre blocos no V2</label>
<fieldset class="destination"><legend>Canal de envio</legend>
<label>Buscar canal<input id="channel-query" type="search" placeholder="Nome do canal ou categoria" autocomplete="off"></label>
<label>Canal<select name="channel" required><option value="">Selecione um canal</option>${channelOptions}</select></label>
<small id="channel-status" role="status"></small></fieldset><div class="draft-actions"><button id="send-format" name="action" value="embed">Enviar Components V2</button>
<button name="action" value="draft/save" formnovalidate>Salvar rascunho</button>
${selectedDraft ? '<button name="action" value="draft/copy" formnovalidate>Salvar cópia</button>' : ''}</div></form></div>
<aside><h4>Prévia no Discord</h4><small id="preview-format">Components V2 · Layout largo</small>
<div class="preview-window"><div class="preview-profile"><span class="avatar" aria-hidden="true">EV</span><div><b>Ember Veil</b><small id="preview-channel">Selecione um canal de envio</small></div></div>
<div class="preview" id="embed-preview" data-format="v2" aria-label="Prévia da mensagem"><img class="preview-thumb" alt="Miniatura" hidden><small class="preview-author"></small><strong>Título da mensagem</strong><div class="preview-blocks"></div><img class="preview-banner" alt="Imagem da mensagem" hidden><small class="preview-footer"></small><div id="preview-buttons"></div></div></div></aside></div>
${premierPanel}<div class="command-list"><h3>Comandos do Discord</h3>${tools}</div></section>
<script>
const form = document.querySelector('#embed-form');
const preview = document.querySelector('#embed-preview');
const saved = JSON.parse(form.dataset.draft);
const memberNames = new Map(JSON.parse(form.dataset.members).map(member => [member.id, member.name]));
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
  if (event.target.tagName === 'TEXTAREA' || event.target.name === 'title' ||
    event.target.name?.startsWith('field_title_')) insertTarget = event.target;
});
const roleOptions = new Map([...form.elements.role.options].map(option => [option.value, option.textContent]));
const channel = form.elements.channel;
const channelOptions = [...channel.options].slice(1);
const channelQuery = document.querySelector('#channel-query');
let destination = channel.value;
const normalize = value => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function updateChannels() {
  const query = normalize(channelQuery.value.trim().replace(/^#/, ''));
  const classic = form.elements.format.value === 'classic';
  const available = channelOptions.filter(option => !classic || option.dataset.classic === 'true');
  const matching = available.filter(option => normalize(option.textContent).includes(query));
  const selected = available.find(option => option.value === destination);
  channel.replaceChildren(new Option('Selecione um canal', ''), ...matching);
  if (selected && !matching.includes(selected)) channel.append(selected);
  channel.value = selected?.value || '';
  document.querySelector('#channel-status').textContent = !matching.length
    ? 'Nenhum canal disponível para essa busca e formato.' : '';
}
function renderText(body, value) {
  for (const part of value.split(/(<@(?:&|!)?[0-9]+>|<a?:[a-zA-Z0-9_]+:[0-9]+>)/g)) {
    if (/^<@(?:&|!)?[0-9]+>$/.test(part)) {
      const id = part.slice(2, -1).replace(/^[&!]/, '');
      const mention = document.createElement('span');
      mention.className = 'mention';
      mention.textContent = part.startsWith('<@&') ? roleOptions.get(id) || '@cargo' : '@' + (memberNames.get(id) || 'membro');
      body.append(mention);
    } else if (/^<a?:[a-zA-Z0-9_]+:[0-9]+>$/.test(part)) {
      const id = part.slice(part.lastIndexOf(':') + 1, -1);
      const image = document.createElement('img');
      image.alt = ':' + part.split(':')[1] + ':';
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
  document.querySelector('#preview-channel').textContent =
    channel.value ? channel.selectedOptions[0].textContent : 'Selecione um canal de envio';
  const titlePreview = preview.querySelector('strong');
  titlePreview.replaceChildren();
  renderText(titlePreview, form.elements.title.value || 'Título da mensagem');
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
    renderText(title, heading);
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
form.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.type === 'search') event.preventDefault();
});
form.elements.format.addEventListener('change', () => {
  updateChannels();
  updatePreview();
});
channelQuery.addEventListener('input', () => {
  updateChannels();
  updatePreview();
});
channel.addEventListener('change', () => {
  destination = channel.value;
  updatePreview();
});
function insert(markup) {
  if (!markup) return;
  const start = insertTarget.selectionStart;
  const end = insertTarget.selectionEnd;
  if (insertTarget.value.length - (end - start) + markup.length + 1 > insertTarget.maxLength) return;
  insertTarget.setRangeText(markup + ' ', start, end, 'end');
  insertTarget.focus();
  updatePreview();
}
const pickerButtons = [...form.querySelectorAll('[data-picker]')];
function openPicker(active) {
  for (const button of pickerButtons) {
    button.setAttribute('aria-expanded', String(button === active));
    document.getElementById(button.getAttribute('aria-controls')).hidden = button !== active;
  }
  if (active) document.getElementById(active.getAttribute('aria-controls')).querySelector('input, select').focus();
}
for (const button of pickerButtons) {
  button.addEventListener('click', () => openPicker(button.getAttribute('aria-expanded') === 'true' ? null : button));
}
form.querySelector('[data-insert-role]').addEventListener('click', () =>
  insert(form.elements.role.selectedOptions[0]?.dataset.markup));
const emojiGallery = document.querySelector('#emoji-gallery');
const emojiTiles = [...emojiGallery.children];
const emojisById = new Map([...form.elements.button_emoji_1.options].map(option => [option.value, option.dataset.markup]));
emojiGallery.addEventListener('click', event => {
  const button = event.target.closest('[data-emoji]');
  if (button) insert(emojisById.get(button.dataset.emoji));
});
function filterEmojis(query) {
  let count = 0;
  for (const tile of emojiTiles) {
    tile.hidden = !normalize(tile.dataset.name).includes(query);
    if (!tile.hidden) count++;
  }
  document.querySelector('#emoji-empty').hidden = count > 0;
}
document.querySelector('#emoji-query').addEventListener('input', event => filterEmojis(normalize(event.target.value.trim())));
const memberQuery = document.querySelector('#member-query');
const memberResults = document.querySelector('#member-results');
const memberStatus = document.querySelector('#member-status');
let memberTimer;
let memberRequest;
memberQuery.addEventListener('input', () => {
  clearTimeout(memberTimer);
  memberRequest?.abort();
  memberResults.replaceChildren();
  const query = memberQuery.value.trim();
  memberStatus.textContent = query ? 'Buscando membros…' : 'Digite o começo do nome ou apelido.';
  if (!query) return;
  memberTimer = setTimeout(async () => {
    const request = new AbortController();
    memberRequest = request;
    try {
      const response = await fetch('/staff/members?q=' + encodeURIComponent(query), { signal: request.signal });
      if (!response.ok) throw new Error();
      const members = await response.json();
      if (request.signal.aborted) return;
      memberStatus.textContent = members.length ? '' : 'Nenhum membro encontrado.';
      for (const member of members) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'member-result';
        button.textContent = member.name;
        const username = document.createElement('small');
        username.textContent = '@' + member.username;
        button.append(username);
        button.addEventListener('click', () => {
          memberNames.set(member.id, member.name);
          openPicker(null);
          insert('<@' + member.id + '>');
        });
        memberResults.append(button);
      }
    } catch {
      if (!request.signal.aborted) memberStatus.textContent = 'Não foi possível buscar membros. Tente novamente.';
    }
  }, 260);
});
memberStatus.textContent = 'Digite o começo do nome ou apelido.';
filterEmojis('');
updateChannels();
updatePreview();
</script>` : ''}
</main></body></html>`;
}
