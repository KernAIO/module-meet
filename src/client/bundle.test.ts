import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * The WebRTC SDK must not be reachable from this module's client barrel.
 *
 * `repos/shell/src/lib/modules/registry.ts` imports every module's `./client` entry at build time,
 * so anything on that graph is in the app's **entry** chunk — downloaded, parsed and executed on
 * the first paint of every Kern page, in every workspace, including the ones that have never
 * switched meetings on. `livekit-client` is a few hundred kilobytes of WebRTC machinery that
 * fewer than one page in a thousand needs.
 *
 * Nothing else notices if that changes. A stray `import { Room } from 'livekit-client'` in a file
 * the barrel already reaches type-checks, lints, builds, passes every other test in this package
 * and ships; the symptom is a number in a bundle report nobody reads. So this walks the import
 * graph the way a bundler does and fails on the file and the specifier.
 *
 * It is a **static** walk, deliberately: a dynamic `import()` is exactly where a bundler splits, so
 * following one would report a chunk boundary as a violation. The assertion is still made over
 * *every* specifier in each reachable file — a reachable file that names the SDK at all is a file
 * one refactor away from importing it for real.
 *
 * This is the cheap half of the proof. The other half is measured in `shell`: build it and read
 * which emitted chunk carries the SDK.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SDK = 'livekit-client'

type Kind = 'static' | 'dynamic' | 'type'
interface Specifier {
  text: string
  kind: Kind
}

/**
 * Svelte is not TypeScript, so the compiler cannot parse a component — but the imports all live in
 * its `<script>` block, and that is plain TypeScript. Concatenating the blocks is enough for an
 * import walk and avoids depending on the Svelte compiler in a unit test.
 */
function scriptOf(file: string, text: string): string {
  if (!file.endsWith('.svelte')) return text
  return [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '').join('\n')
}

function specifiersOf(file: string): Specifier[] {
  const source = ts.createSourceFile(
    `${file}.ts`,
    scriptOf(file, readFileSync(file, 'utf8')),
    ts.ScriptTarget.ESNext,
    true,
  )
  const found: Specifier[] = []
  const text = (node: ts.Expression | undefined) => (node && ts.isStringLiteral(node) ? node.text : null)

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const spec = text(node.moduleSpecifier)
      // `verbatimModuleSyntax` is on, so a type-only import is erased and creates no bundle edge.
      if (spec) found.push({ text: spec, kind: node.importClause?.isTypeOnly ? 'type' : 'static' })
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const spec = text(node.moduleSpecifier)
      if (spec) found.push({ text: spec, kind: node.isTypeOnly ? 'type' : 'static' })
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const spec = text(node.arguments[0])
      if (spec) found.push({ text: spec, kind: 'dynamic' })
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      const literal = node.argument.literal
      if (ts.isStringLiteral(literal)) found.push({ text: literal.text, kind: 'type' })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/**
 * A `.js` specifier against a `.ts` on disk, and a `.svelte.js` against `.svelte.ts` — NodeNext
 * imports are written the way the *output* resolves, which is not the way the source is named.
 */
function resolveLocal(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/, ''))
  for (const candidate of [`${base}.ts`, `${base}.svelte`, base, join(base, 'index.ts')]) {
    if (existsSync(candidate) && !candidate.endsWith('/')) return candidate
  }
  return null
}

/** Every file the shell's registry would pull in by importing this package's client entry. */
function reachableFromBarrel(): Map<string, Specifier[]> {
  const seen = new Map<string, Specifier[]>()
  const queue = [join(HERE, 'index.ts')]
  while (queue.length > 0) {
    const file = queue.pop()
    if (!file || seen.has(file)) continue
    const specs = specifiersOf(file)
    seen.set(file, specs)
    for (const spec of specs) {
      if (spec.kind !== 'static') continue
      const next = resolveLocal(file, spec.text)
      if (next) queue.push(next)
    }
  }
  return seen
}

const shortName = (file: string) => relative(join(HERE, '..', '..'), file)

describe('the client barrel', () => {
  const graph = reachableFromBarrel()

  it('is reading a real graph rather than passing on an empty one', () => {
    // A walk that resolved nothing would report no violations for the best possible reason and the
    // worst possible cause. The barrel reaches the manifest, the strings and the permissions.
    expect(graph.size).toBeGreaterThan(4)
    expect([...graph.keys()].map(shortName)).toContain('src/client/module.ts')
  })

  it('never reaches livekit-client, in any kind of import', () => {
    const offenders = [...graph.entries()]
      .flatMap(([file, specs]) => specs.map((spec) => ({ file: shortName(file), ...spec })))
      .filter((entry) => entry.text === SDK || entry.text.startsWith(`${SDK}/`))
    expect(offenders).toEqual([])
  })

  it('never reaches a meeting component either, so the route stays a chunk of its own', () => {
    const meeting = [...graph.keys()].map(shortName).filter((file) => file.includes('/meeting/'))
    expect(meeting).toEqual([])
  })
})

describe('the meeting session', () => {
  const room = join(HERE, 'meeting', 'room.svelte.ts')
  const specs = specifiersOf(room)

  /**
   * The other half of the check, and the reason the one above cannot pass by accident: deleting the
   * SDK would satisfy "nothing reaches livekit-client" perfectly.
   */
  it('is the file that loads the SDK', () => {
    const kinds = new Set(specs.filter((s) => s.text === SDK).map((s) => s.kind))
    expect([...kinds].sort()).toEqual(['dynamic', 'type'])
  })

  it('loads it dynamically, so pressing Join is what downloads it', () => {
    expect(specs.some((s) => s.text === SDK && s.kind === 'static')).toBe(false)
  })
})
