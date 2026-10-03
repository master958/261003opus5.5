// solar-system.html 을 ?selftest 로 열어 assert 통과 여부와 콘솔 에러를 검사한다 (CDN 요청은 npm 설치본으로 대체).
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const threeDir = path.resolve(process.env.THREE_DIR || path.join(process.cwd(), 'node_modules/three'));
const THREE_VERSION = JSON.parse(fs.readFileSync(path.join(threeDir, 'package.json'), 'utf8')).version;
const html = fs.readFileSync(path.join(root, 'solar-system.html'), 'utf8');
if (!html.includes(`three@${THREE_VERSION}/`)) {
  console.error(`importmap 의 three 버전이 설치본(${THREE_VERSION})과 다릅니다.`);
  process.exit(1);
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const problems = [];
page.on('console', (m) => {
  console.log(`[${m.type()}] ${m.text()}`);
  if (m.type() === 'error' || m.type() === 'warning' || m.type() === 'assert') problems.push(m.text());
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.route(`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/**`, (route) => {
  const rel = route.request().url().split(`three@${THREE_VERSION}/`)[1];
  route.fulfill({
    body: fs.readFileSync(path.join(threeDir, rel)),
    contentType: 'text/javascript',
    headers: { 'access-control-allow-origin': '*' }
  });
});
await page.goto(pathToFileURL(path.join(root, 'solar-system.html')).href + '?selftest');
await page.waitForFunction(() => window.__selftest, null, { timeout: 30000 });
await page.waitForTimeout(2000);   // 렌더 루프를 몇 프레임 돌려 런타임 에러도 잡는다
const result = await page.evaluate(() => window.__selftest);
await browser.close();

if (result.passed !== result.total) problems.push(`selftest ${result.passed}/${result.total} 통과`);
if (problems.length) {
  console.error('실패:\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`selftest 통과: ${result.passed}/${result.total}, 콘솔 에러 0건`);
