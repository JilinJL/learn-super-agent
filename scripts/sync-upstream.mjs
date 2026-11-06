// Copies the upstream documents into docs/upstream/ as English originals.
// Usage: node scripts/sync-upstream.mjs [path-to-upstream-checkout]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const upstream = JSON.parse(readFileSync(join(root, 'upstream.json'), 'utf8'))
const source = resolve(process.argv[2] ?? join(root, '..', 'dsh-superagent-prototype'))
const out = join(root, 'docs', 'upstream')
const blob = `https://github.com/${upstream.repository}/blob/${upstream.commit}`

if (!existsSync(join(source, 'docs', '000-philosophy.md'))) {
  console.error(`Not an upstream checkout: ${source}`)
  process.exit(1)
}
const head = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (head !== upstream.commit) {
  console.error(`Upstream checkout is at ${head}, upstream.json pins ${upstream.commit}.`)
  console.error('Check out the pinned commit, or update upstream.json and review the translations.')
  process.exit(1)
}

// Upstream path -> page path under docs/upstream/ (without .md).
const pages = new Map([
  ['README.md', 'readme'],
  ['SETUP.md', 'setup'],
])
for (const file of readdirSync(join(source, 'docs')).filter((f) => f.endsWith('.md')).sort()) {
  pages.set(`docs/${file}`, file.slice(0, -3))
}
for (const file of readdirSync(join(source, 'prompts')).filter((f) => f.endsWith('.md')).sort()) {
  pages.set(`prompts/${file}`, `prompts/${file.slice(0, -3)}`)
}
for (const file of readdirSync(join(source, 'prompts', 'team')).sort()) {
  pages.set(`prompts/team/${file}`, `prompts/team-${file.slice(0, -3)}`)
}
for (const dir of readdirSync(join(source, 'skills')).sort()) {
  pages.set(`skills/${dir}/SKILL.md`, `skills/${dir}`)
}

// Rewrites a relative link found in `from` to a page here, or to a GitHub permalink.
function rewriteLink(from, target) {
  if (/^[a-z]+:|^#/.test(target)) return target
  const [path, hash] = target.split('#')
  const resolved = posix.normalize(posix.join(posix.dirname(from), path))
  const page = pages.get(resolved)
  const fromPage = pages.get(from)
  if (page) {
    const rel = posix.relative(posix.dirname(fromPage), page) || basename(page)
    return (rel.startsWith('.') ? rel : `./${rel}`) + (hash ? `#${hash}` : '')
  }
  return `${blob}/${resolved}` + (hash ? `#${hash}` : '')
}

// Escapes text that Vue would compile, outside code spans and fences.
function escapeText(line) {
  return line
    .split(/(`+[^`]*`+)/)
    .map((part, i) => (i % 2 ? part : part.replace(/</g, '&lt;').replace(/\{\{/g, '&#123;&#123;')))
    .join('')
}

function convert(from, text) {
  let frontmatter = ''
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (fm) {
    frontmatter = '```yaml\n' + fm[1] + '\n```\n\n'
    text = text.slice(fm[0].length)
  }
  let fence = false
  const body = text
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence
      if (fence || /^\s*(```|~~~)/.test(line)) return line
      // A `|` inside a code span would split a table cell.
      if (line.startsWith('|')) line = line.replace(/`[^`]*`/g, (code) => code.replace(/(?<!\\)\|/g, '\\|'))
      return escapeText(line.replace(/\]\(([^)\s]+)\)/g, (_, t) => `](${rewriteLink(from, t)})`))
    })
    .join('\n')
  const title = body.match(/^# (.+)$/m)?.[1] ?? from
  const header = ['---', `title: ${JSON.stringify(title)}`, `upstream: ${JSON.stringify(from)}`, '---', ''].join('\n')
  const banner = '<UpstreamBanner kind="original" />\n\n'
  // The banner goes under the H1; pages without one (prompts) get the file path as the heading.
  const withBanner = /^# .+\n/m.test(body)
    ? body.replace(/^(# .+\n)\n?/m, `$1\n${banner}`)
    : `# ${from}\n\n${banner}${body}`
  return header + (frontmatter ? withBanner.replace(banner, banner + frontmatter) : withBanner).trimEnd() + '\n'
}

rmSync(out, { recursive: true, force: true })
for (const [from, page] of pages) {
  const target = join(out, `${page}.md`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, convert(from, readFileSync(join(source, from), 'utf8')))
}
console.log(`Synced ${pages.size} pages from ${upstream.repository}@${upstream.commit.slice(0, 7)} into docs/upstream/`)
