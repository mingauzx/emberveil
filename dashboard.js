const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const time = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Cuiaba'
});
const empty = message => '<p class="empty">' + message + '</p>';

export function dashboard(trainings, roster, matches) {
  const visits = trainings.map(event => {
    const groups = ['Confirmado', 'Talvez', 'Ausente'].map(status => {
      const people = event.people.filter(person => person.answer === status);
      return '<div><strong>' + status + ' · ' + people.length + '</strong><span>' +
        (people.map(person => escape(person.name)).join(', ') || '—') + '</span></div>';
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
:root{color-scheme:dark;font:16px system-ui,sans-serif;color:#faf4f2;background:#111013;--accent:#ff795f;--muted:#c3b5b5;--line:#3a2b31}
*{box-sizing:border-box}body{margin:0}main,nav{max-width:1140px;margin:auto;padding:0 24px}
header{border-bottom:1px solid var(--line);background:#191419}nav{display:flex;flex-wrap:wrap;gap:20px;align-items:center;min-height:68px;padding-block:12px}
nav strong{margin-right:auto;color:var(--accent);letter-spacing:.13em}a{color:var(--muted);text-decoration:none}a:hover,a:focus-visible{color:white;text-decoration:underline}
.hero{padding:55px 0 37px}h1,h2,h3,p{margin:0}h1{font-size:clamp(2.5rem,7vw,5rem);line-height:.98;letter-spacing:-.065em}p,small{color:var(--muted)}.hero p{margin-top:14px}
.grid{display:grid;grid-template-columns:1.4fr 1fr;gap:18px}section{min-width:0;padding:22px;border:1px solid var(--line);border-radius:15px;background:#1b161b;margin-bottom:18px}h2{font-size:1.17rem;margin-bottom:18px}
article,.empty{padding:15px;border-radius:9px;background:#251c21;margin-top:8px}article p{margin:6px 0 13px}.attendance{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.attendance span,small{display:block;overflow-wrap:anywhere}.attendance span{margin-top:5px;color:var(--muted)}.attendance strong{font-size:.84rem;color:var(--accent)}
ul{margin:0;padding:0;list-style:none}li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}.tag{font-size:.82rem;color:var(--accent)}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}td,th{padding:12px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-size:.84rem}
@media(max-width:700px){.grid{grid-template-columns:1fr;gap:0}.attendance{grid-template-columns:1fr}.hero{padding-top:38px}}
</style>
</head>
<body><header><nav aria-label="Painel"><strong>EMBER VEIL</strong><a href="#treinos">Treinos</a><a href="#elenco">Elenco</a><a href="#historico">Histórico</a><a href="/sair">Sair</a></nav></header>
<main><div class="hero"><h1>Painel do time</h1><p>Agenda, escalação e partidas da Ember Veil.</p></div>
<div class="grid"><section id="treinos"><h2>Próximos treinos</h2>${visits || empty('Nenhum treino agendado. Use /treino marcar no Discord.')}</section>
<section id="elenco"><h2>Escalação</h2>${players ? '<ul>' + players + '</ul>' : empty('Nenhum jogador cadastrado. Use /elenco definir no Discord.')}</section></div>
<section id="historico"><h2>Últimas partidas</h2>${results ? '<div class="scroll"><table><thead><tr><th>Adversário</th><th>Mapa</th><th>Placar</th><th>Resultado</th><th>Data</th></tr></thead><tbody>' + results + '</tbody></table></div>' : empty('Nenhuma partida registrada. Use /resultado no Discord.')}</section>
</main></body></html>`;
}
