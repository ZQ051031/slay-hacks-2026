import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { makeServer } from '../server.js';

async function eventually(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await check();
    if (result) return result;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${check.name || 'browser state'}`);
}

async function startServer(t) {
  const server = makeServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function openChrome(t, origin) {
  const profile = await mkdtemp(join(tmpdir(), 'quizforge-browser-'));
  const chrome = spawn(process.env.CHROME_BIN || 'google-chrome', [
    '--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-background-networking', 'about:blank',
  ], { stdio: 'ignore' });
  let launchError;
  chrome.on('error', error => { launchError = error; });
  const closed = once(chrome, 'close').catch(() => {});
  t.after(async () => {
    chrome.kill();
    await closed;
    await rm(profile, { recursive: true, force: true });
  });

  const port = await eventually(async function debuggerPort() {
    if (launchError) throw new Error('Install Chrome or set CHROME_BIN to a Chromium executable.', { cause: launchError });
    if (chrome.exitCode !== null) throw new Error(`Headless Chrome exited with status ${chrome.exitCode}`);
    try {
      return (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  });
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  t.after(() => socket.close());
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const reply = JSON.parse(data);
    const callbacks = pending.get(reply.id);
    if (!callbacks) return;
    pending.delete(reply.id);
    if (reply.error) callbacks.reject(new Error(reply.error.message));
    else callbacks.resolve(reply.result);
  });
  socket.addEventListener('close', () => {
    for (const callbacks of pending.values()) callbacks.reject(new Error('Chrome connection closed'));
    pending.clear();
  });
  function command(method, params) {
    const nextId = ++id;
    return new Promise((resolve, reject) => {
      pending.set(nextId, { resolve, reject });
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: origin });
  return { command, evaluate };
}

test('serves the static app, style, browser modules and sample notes', async t => {
  const origin = await startServer(t);
  const paths = ['/', '/style.css', '/app.js', '/lib/quiz.js', '/lib/scheduler.js', '/lib/storage.js',
    '/examples/photosynthesis.md', '/examples/french-revolution.md', '/examples/number-systems.md'];
  const assets = await Promise.all(paths.map(path => fetch(origin + path)));
  for (const response of assets) {
    assert.equal(response.status, 200, response.url);
    assert.ok((await response.text()).length > 0);
  }
  const head = await fetch(origin, { method: 'HEAD' });
  assert.match(head.headers.get('content-type'), /text\/html/);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(origin + '/package.json')).status, 404);
});

test('Chrome renders all views and persists a complete study flow', { timeout: 20_000 }, async t => {
  const origin = await startServer(t);
  const { command, evaluate } = await openChrome(t, origin);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const visible = selector => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)})?.getClientRects().length)`);
  await eventually(async function notesVisible() { return visible('#notes .hero'); });
  assert.match(await evaluate('getComputedStyle(document.querySelector(".hero")).backgroundColor'), /234, 228, 252/);
  await click('[data-sample="photosynthesis"]');
  await eventually(async function sampleLoaded() { return evaluate('document.querySelector("#note-text").value.includes("Chlorophyll")'); });
  await click('#notes-form button[type=submit]');
  await eventually(async function quizVisible() { return visible('#quiz .choice'); });
  assert.match(await evaluate('document.querySelector("#quiz .prompt").textContent'), /absorbs light energy/);
  const questionCount = await evaluate('document.querySelector("#quiz progress").max');
  let answers = 0;
  while (answers < questionCount) {
    await evaluate(`(() => {
      const choice = document.querySelector('#quiz .choice');
      if (choice) {
        [...document.querySelectorAll('#quiz .choice')].find(button => button.textContent === 'Chlorophyll')?.click() || (!document.querySelector('#quiz .feedback') && choice.click());
      } else {
        document.querySelector('#quiz input').value = 'Carbon dioxide';
        document.querySelector('#quiz form').requestSubmit();
      }
    })()`);
    assert.equal(await visible('#quiz .feedback'), true);
    if (answers === 0) {
      assert.match(await evaluate('document.querySelector("#quiz .feedback").textContent'), /Correct!.*Chlorophyll/);
      if (process.env.QUIZFORGE_SCREENSHOT) {
        const { data } = await command('Page.captureScreenshot', { format: 'png' });
        await writeFile(process.env.QUIZFORGE_SCREENSHOT, Buffer.from(data, 'base64'));
      }
    }
    await click('#quiz-body > button.primary');
    answers++;
  }
  assert.match(await evaluate('document.querySelector("#quiz-body h2").textContent'), /Quiz complete · \d \/ 6/);
  await click('#quiz-body a[href="#review"]');
  await eventually(async function reviewVisible() { return visible('#review .prompt'); });
  assert.match(await evaluate('document.querySelector("#review .pill").textContent'), /6 due today/);
  await click('#review-body button');
  assert.equal(await visible('#review .feedback'), true);
  await click('#review .rating:nth-child(3)');
  assert.match(await evaluate('document.querySelector("#review .review-note").textContent'), /Rated good\. Next review: \d{4}-\d{2}-\d{2}\./);
  assert.match(await evaluate('document.querySelector("#review .pill").textContent'), /5 due today/);
  await click('nav a[href="#progress"]');
  await eventually(async function progressVisible() { return visible('#progress .topic-row'); });
  assert.match(await evaluate('document.querySelector("#progress .metric").textContent'), /1 day/);
  assert.match(await evaluate('document.querySelector("#progress .topic-row").textContent'), /Photosynthesis/);
  await command('Page.reload');
  await eventually(async function restored() { return evaluate('document.querySelector("#progress .metric")?.textContent.includes("1 day")'); });
  await click('nav a[href="#notes"]');
  await eventually(async function notesRestored() { return visible('#note-text'); });
  assert.match(await evaluate('document.querySelector("#note-text").value'), /Chlorophyll/);
  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth === innerWidth'), true);
});
