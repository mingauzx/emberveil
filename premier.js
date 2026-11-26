const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function premierCandidate(data, puuid) {
  const info = data?.matchInfo;
  if (!info || info.queueId?.toLowerCase() !== 'premier' || info.isCompleted !== true ||
      !idPattern.test(info.matchId) || !Number.isSafeInteger(info.gameStartMillis) || info.gameStartMillis <= 0) return null;

  const player = data.players?.find(row => row.puuid === puuid);
  const teams = data.teams || [];
  if (!player?.teamId || teams.length !== 2) return null;
  const ours = teams.find(team => team.teamId === player.teamId)?.roundsWon;
  const theirs = teams.find(team => team.teamId !== player.teamId)?.roundsWon;
  const map = typeof info.mapId === 'string' && info.mapId.split('/').filter(Boolean).at(-1);
  if (!map || !Number.isInteger(ours) || ours < 0 || !Number.isInteger(theirs) || theirs < 0) return null;
  return { id: info.matchId.toLowerCase(), map, ours, theirs, date: info.gameStartMillis };
}

export function premierSync(db, env, request = fetch) {
  db.exec(`CREATE TABLE IF NOT EXISTS premier_review (
    id TEXT PRIMARY KEY,
    map TEXT NOT NULL,
    ours INTEGER NOT NULL,
    theirs INTEGER NOT NULL,
    date INTEGER NOT NULL,
    status TEXT NOT NULL
  )`);
  const insert = db.prepare("INSERT OR IGNORE INTO premier_review VALUES (?, ?, ?, ?, ?, 'pending')");
  const seen = db.prepare('SELECT id FROM premier_review WHERE id = ?');
  const pending = db.prepare("SELECT * FROM premier_review WHERE status = 'pending' ORDER BY date DESC LIMIT 30");
  const status = db.prepare("UPDATE premier_review SET status = ? WHERE id = ? AND status = 'pending'");
  const getPending = db.prepare("SELECT * FROM premier_review WHERE id = ? AND status = 'pending'");
  const publish = db.prepare('INSERT INTO scores VALUES (?, ?, ?, ?, ?, ?)');
  const puuid = env.RIOT_PREMIER_PUUID?.trim();
  const region = (env.RIOT_VAL_REGION || 'br').toLowerCase();
  const regions = ['br', 'latam', 'na', 'eu', 'ap', 'kr'];
  const enabled = Boolean(env.RIOT_API_KEY && puuid && regions.includes(region));
  let busy = false;
  let state = enabled ? 'waiting' : 'disabled';
  let nextAttempt = 0;

  async function get(path) {
    const result = await request('https://' + region + '.api.riotgames.com/val/match/v1' + path, {
      headers: { 'X-Riot-Token': env.RIOT_API_KEY }, signal: AbortSignal.timeout(8000)
    });
    if (result.status === 429) {
      const retry = Number(result.headers.get('Retry-After')) || 60;
      nextAttempt = Date.now() + retry * 1000;
    }
    if (!result.ok) throw Error('HTTP ' + result.status);
    return result.json();
  }

  async function poll() {
    if (!enabled || busy || Date.now() < nextAttempt) return;
    busy = true;
    try {
      const list = await get('/matchlists/by-puuid/' + encodeURIComponent(puuid));
      for (const entry of (list.history || []).filter(row => row.queueId?.toLowerCase() === 'premier').slice(0, 20)) {
        if (!idPattern.test(entry.matchId) || seen.get(entry.matchId.toLowerCase())) continue;
        const match = await get('/matches/' + entry.matchId);
        const data = premierCandidate(match, puuid);
        if (data && data.id === entry.matchId.toLowerCase()) insert.run(data.id, data.map, data.ours, data.theirs, data.date);
      }
      state = 'ready';
    } catch (error) {
      state = 'error';
      console.error('Falha ao consultar Premier:', /^HTTP \d+$/.test(error.message) ? error.message : error.name);
    } finally {
      busy = false;
    }
  }

  if (enabled) {
    void poll();
    setInterval(() => void poll(), 15 * 60 * 1000).unref();
  }

  return {
    pending: () => pending.all(),
    state: () => state,
    decide(action, id, opponent, map) {
      if (!idPattern.test(id || '')) return 'invalid';
      if (action === 'premier/reject') return status.run('rejected', id).changes ? 'premier-rejected' : 'premier-reviewed';
      if (!opponent || opponent.length > 80 || !map || map.length > 80) return 'invalid';
      db.exec('BEGIN IMMEDIATE');
      try {
        const row = getPending.get(id);
        if (row) {
          publish.run('premier:' + id, opponent, map, row.ours, row.theirs, row.date);
          status.run('approved', id);
        }
        db.exec('COMMIT');
        return row ? 'premier-approved' : 'premier-reviewed';
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
}
