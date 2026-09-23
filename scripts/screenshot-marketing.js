const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.resolve(process.cwd(), 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5174';
const TIMEOUT = 60000;
const SLEEP = 200;

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function screenshot(page, name) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, timeout: TIMEOUT });
  return file;
}

async function clickButton(page, text, opts = {}) {
  const btn = page.locator('button').filter({ hasText: new RegExp('^' + text + '$', 'u') }).first();
  if (await btn.isVisible({ timeout: TIMEOUT }).catch(() => false)) {
    await btn.click({ timeout: TIMEOUT });
    return true;
  }
  const fuzzy = page.locator('button').filter({ hasText: text }).first();
  if (await fuzzy.isVisible({ timeout: TIMEOUT }).catch(() => false)) {
    await fuzzy.click({ timeout: TIMEOUT });
    return true;
  }
  throw new Error('button not visible: ' + text);
}

async function fillInput(page, value) {
  const input = page.locator('input').first();
  await input.waitFor({ state: 'visible', timeout: TIMEOUT });
  await input.fill(value);
  await sleep(SLEEP);
  await page.keyboard.press('Enter');
  await sleep(SLEEP * 2);
  return input;
}

async function run() {
  console.log('Starting chromium for Trance marketing screenshots...');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 880 },
    colorScheme: 'dark',
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.setDefaultTimeout(TIMEOUT);

  const shots = [];
  let step = 0;

  console.log('STEP ' + (++step) + ': ready screen');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: TIMEOUT });
  await sleep(SLEEP);
  shots.push(await screenshot(page, '01_ready_screen'));

  console.log('STEP ' + (++step) + ': start session');
  await clickButton(page, 'Start Trance session');
  await sleep(SLEEP * 4);
  shots.push(await screenshot(page, '02_widget_active'));

  console.log('STEP ' + (++step) + ': compact widget shot');
  await page.setViewportSize({ width: 460, height: 280 });
  shots.push(await screenshot(page, '03_widget_active_compact'));
  await page.setViewportSize({ width: 1280, height: 880 });

  console.log('STEP ' + (++step) + ': open task tab and set Writing');
  await clickButton(page, 'Task');
  await sleep(SLEEP);
  await fillInput(page, 'Writing');
  shots.push(await screenshot(page, '04_widget_task_writing'));
  await page.setViewportSize({ width: 460, height: 280 });
  shots.push(await screenshot(page, '05_widget_task_writing_compact'));
  await page.setViewportSize({ width: 1280, height: 880 });

  console.log('STEP ' + (++step) + ': open break tab and start a 1m break');
  await clickButton(page, 'Break');
  await sleep(SLEEP);
  await clickButton(page, '1m');
  await sleep(SLEEP * 2);
  await page.setViewportSize({ width: 460, height: 280 });
  shots.push(await screenshot(page, '06_widget_break_timer'));
  await page.setViewportSize({ width: 1280, height: 880 });

  console.log('STEP ' + (++step) + ': open dashboard window');
  await browser.close();

  const browser2 = await chromium.launch({ headless: true });
  const ctx2 = await browser2.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    deviceScaleFactor: 2,
  });
  const dash = await ctx2.newPage();
  await dash.setDefaultTimeout(TIMEOUT);

  console.log('STEP ' + (++step) + ': dashboard overview');
  await dash.goto(BASE + '#/dashboard', { waitUntil: 'networkidle', timeout: TIMEOUT });
  await sleep(SLEEP * 3);
  shots.push(await screenshot(dash, '08_dashboard_overview'));
  shots.push(await screenshot(dash, '09_dashboard_overview_full'));

  console.log('STEP ' + (++step) + ': timeline tab');
  await clickButton(dash, 'Timeline');
  await sleep(SLEEP * 3);
  shots.push(await screenshot(dash, '10_dashboard_timeline'));
  shots.push(await screenshot(dash, '11_dashboard_timeline_full'));

  console.log('STEP ' + (++step) + ': insights tab');
  await clickButton(dash, 'Insights');
  await sleep(SLEEP * 3);
  shots.push(await screenshot(dash, '12_dashboard_insights'));
  shots.push(await screenshot(dash, '13_dashboard_insights_full'));

  console.log('STEP ' + (++step) + ': trends tab');
  await clickButton(dash, 'Trends');
  await sleep(SLEEP * 3);
  shots.push(await screenshot(dash, '14_dashboard_trends'));
  shots.push(await screenshot(dash, '15_dashboard_trends_full'));

  console.log('STEP ' + (++step) + ': settings panel');
  await clickButton(dash, 'Settings');
  await sleep(SLEEP * 2);
  shots.push(await screenshot(dash, '16_dashboard_settings'));
  shots.push(await screenshot(dash, '17_dashboard_settings_full'));

  await browser2.close();

  console.log('Screenshots written to: ' + OUT);
  console.log('Files:');
  for (const s of shots) console.log(' - ' + s + '.png');
}

process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
process.on('uncaughtException', (e) => {
  console.error('UNCAUGHT:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
run().catch((e) => {
  console.error('Screenshot run failed:', e && e.message ? e.message : e);
  process.exitCode = 1;
});