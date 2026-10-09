const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.NO_SERVER = '1';
process.env.POKER_HISTORY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-handoff-'));
const nativeFetch = global.fetch;
const { TexasHoldemGame, GAMES, server, io, verifyLineUser } = require('../app');
let base;
const games = [];

function response(body, ok = true) { return { ok, json: async () => body }; }
function game() {
  const g = new TexasHoldemGame('handoff-' + games.length, 'line-user', 'Player');
  g.players['line-user'].historyKey = 'desktop-history-key';
  games.push(g); GAMES[g.gameId] = g; return g;
}
async function postJoin(g, key, token = '') {
  const result = await nativeFetch(base + '/join_game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-History-Key': key, Authorization: token ? `Bearer ${token}` : '' },
    body: JSON.stringify({ game_id: g.gameId, user_id: 'line-user', user_name: 'Player' })
  });
  return { status: result.status, ...await result.json() };
}

before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test('LINE verification requires this channel and the expected user', async () => {
  const validFetch = async url => String(url).includes('/verify')
    ? response({ client_id: '2010219463', expires_in: 1000 })
    : response({ userId: 'line-user' });
  assert.equal(await verifyLineUser('a'.repeat(24), 'line-user', validFetch), true);
  assert.equal(await verifyLineUser('a'.repeat(24), 'someone-else', validFetch), false);
  assert.equal(await verifyLineUser('a'.repeat(24), 'line-user', async url => String(url).includes('/verify')
    ? response({ client_id: 'wrong-channel', expires_in: 1000 }) : response({ userId: 'line-user' })), false);
});

test('same LINE account transfers the seat and invalidates the old browser key', async () => {
  const g = game();
  global.fetch = async url => String(url).includes('/verify')
    ? response({ client_id: '2010219463', expires_in: 1000 })
    : response({ userId: 'line-user' });
  try {
    const result = await postJoin(g, 'mobile-history-key', 'valid-line-access-token');
    assert.equal(result.status, 200);
    assert.equal(result.success, true);
    assert.equal(result.session_transferred, true);
    assert.equal(g.players['line-user'].historyKey, 'mobile-history-key');
    const denied = await nativeFetch(base + '/add_bot', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-History-Key': 'desktop-history-key' }, body: JSON.stringify({ game_id: g.gameId, user_id: 'line-user' }) });
    assert.equal(denied.status, 403);
  } finally { global.fetch = nativeFetch; }
});

test('seat transfer notifies the previous device and removes its private room access', async () => {
  const { io: connect } = require('socket.io-client');
  const g = game();
  const desktop = connect(base, { transports: ['websocket'], reconnection: false });
  global.fetch = async url => String(url).includes('/verify')
    ? response({ client_id: '2010219463', expires_in: 1000 })
    : response({ userId: 'line-user' });
  try {
    await new Promise((resolve, reject) => { desktop.once('connect', resolve); desktop.once('connect_error', reject); });
    desktop.emit('join_room', { game_id: g.gameId, user_id: 'line-user', history_key: 'desktop-history-key' });
    await new Promise(resolve => setTimeout(resolve, 20));
    const replaced = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('session_replaced was not emitted')), 1000);
      desktop.once('session_replaced', data => { clearTimeout(timer); resolve(data); });
    });
    assert.equal((await postJoin(g, 'mobile-history-key', 'valid-line-access-token')).success, true);
    assert.equal((await replaced).game_id, g.gameId);
    assert.equal((await io.in(g.gameId).fetchSockets()).some(socket => socket.id === desktop.id), false);
  } finally { desktop.disconnect(); global.fetch = nativeFetch; }
});

test('a different or missing LINE account cannot take over the seat', async () => {
  const g = game();
  global.fetch = async url => String(url).includes('/verify')
    ? response({ client_id: '2010219463', expires_in: 1000 })
    : response({ userId: 'other-user' });
  try {
    assert.equal((await postJoin(g, 'mobile-history-key', 'other-line-access-token')).status, 403);
    assert.equal((await postJoin(g, 'mobile-history-key')).status, 403);
    assert.equal(g.players['line-user'].historyKey, 'desktop-history-key');
  } finally { global.fetch = nativeFetch; }
});

after(() => {
  global.fetch = nativeFetch;
  games.forEach(g => { g.cancelScheduledAction(); clearTimeout(g.emptyTimeout); });
  io.close(); server.close();
  fs.rmSync(process.env.POKER_HISTORY_DIR, { recursive: true, force: true });
});

