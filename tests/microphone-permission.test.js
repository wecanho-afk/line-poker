const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

process.env.NO_SERVER = '1';
const { app } = require('../app');

test('served pages explicitly allow same-origin microphone access', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const headers = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${server.address().port}/`, response => {
        response.resume();
        response.once('end', () => resolve(response.headers));
      }).once('error', reject);
    });
    assert.equal(headers['permissions-policy'], 'microphone=(self)');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('voice control supports iPhone recording mode and an external-browser fallback', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /play-and-record/);
  assert.match(html, /mediaDevices\?\.getUserMedia/);
  assert.match(html, /liff\.openWindow\(\{ url: url\.href, external: true \}\)/);
  assert.match(html, /voice-permission-dialog/);
  const inlineScripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach(([, source]) => assert.doesNotThrow(() => new Function(source)));
});

