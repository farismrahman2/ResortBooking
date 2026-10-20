// Renders the Bangla road directions to public/pdf/routes-bn.png for the
// confirmation PDF (the PDF engine can't shape Bangla script; a browser can).
// Re-run after editing the text:  node scripts/render-routes-bn.mjs
import { writeFileSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const fonts = resolve('public/fonts')
const ROUTES = [
  { title: 'Tongi route', text: 'আমাদের রিসোর্ট টা পুবাইল পার হয়ে মিরের বাজার পার হয়ে কালীগঞ্জ, ঘোড়াশাল যাওয়ার পথে কাপাশিয়া মোড় হতে বামে ঢুকতে হবে। কাপাশিয়া মোড় থেকে মাত্র ২০ মিনিট লাগবে। গ্রামের নাম : বেরুয়া।' },
  { title: '300 Feet route', text: '৩০০ ফিট দিয়ে আসলে কাঞ্চন ব্রিজ এর আগে বামে যেয়ে বাণিজ্যমেলা পার হয়ে CCLUB resort পার হয়ে, বড় একটা ইউ-টার্ন নিয়ে, মাটির ঘরের রাস্তা (উলুখোলা নাগরি রোড) দিয়ে কালীগঞ্জ ঘোড়াশাল রোড এ উঠতে হবে। রোড এ উঠে কিছুদূর গেলে কাপাশিয়া মোড় এ বামে ঢুকতে হবে। ওখান থেকে ২০ মিনিট লাগবে আসতে।' },
]

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:NB;src:url(file://${fonts}/NotoSansBengali-Regular.woff2) format('woff2');font-weight:400}
@font-face{font-family:NB;src:url(file://${fonts}/NotoSansBengali-Bold.woff2) format('woff2');font-weight:700}
@font-face{font-family:NB;src:url(file://${fonts}/NotoSansBengali-Latin.woff2) format('woff2');unicode-range:U+0000-00FF}
html,body{margin:0;background:#fff}
body{width:880px;padding:4px 2px 8px;font-family:NB,sans-serif;color:#1f2937}
.r{border:1.5px solid #d1fae5;background:#f6fdf9;border-radius:14px;padding:16px 20px;margin-bottom:14px}
h3{margin:0 0 6px;font:700 19px NB,sans-serif;color:#14532d;letter-spacing:.3px}
p{margin:0;font-size:19px;line-height:1.75}
.r:last-child{margin-bottom:0}
</style></head><body>${ROUTES.map((r) => `<div class="r"><h3>${r.title}</h3><p>${r.text}</p></div>`).join('')}</body></html>`

const dir = mkdtempSync(join(tmpdir(), 'routes-'))
const file = join(dir, 'routes.html')
writeFileSync(file, html)
// headless_shell sizes the screenshot to the window exactly; measure the
// content first so nothing is cut off.
const shell = process.env.CHROME ?? execFileSync('sh', ['-c', 'ls /opt/pw-browsers/chromium_headless_shell-*/*/headless_shell | head -1']).toString().trim()
const base = ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--virtual-time-budget=3000']
writeFileSync(file, html.replace('</body>', '<script>document.title="H"+Math.ceil(document.body.getBoundingClientRect().bottom)</script></body>'))
const dom = execFileSync(shell, [...base, '--window-size=884,2000', '--dump-dom', `file://${file}`]).toString()
const height = Number(/<title>H(\d+)<\/title>/.exec(dom)?.[1] ?? 0)
if (!height) throw new Error('could not measure the routes block')
writeFileSync(file, html)
execFileSync(shell, [...base, '--force-device-scale-factor=2', `--window-size=884,${height}`,
  `--screenshot=${resolve('public/pdf/routes-bn.png')}`, `file://${file}`], { stdio: 'ignore' })
console.log(`wrote public/pdf/routes-bn.png (884x${height} @2x)`)
