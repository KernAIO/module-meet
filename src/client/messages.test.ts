import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ar, de, en, fa, meetMessageBundles, tr } from './messages.js'

/**
 * The bundles, structurally.
 *
 * Nothing else looks at these. A key present in English and missing in Persian type-checks, builds,
 * lints and ships, and the first person to see it is the one reading `meet.denied_title` off a
 * screen — `t()` answers an unknown key with the key itself, on purpose, so that it is visibly
 * broken rather than blank. This file is what makes that fail here instead.
 */
const BUNDLES = { en, ar, de, fa, tr } as const
type Locale = keyof typeof BUNDLES

/** The count placeholder: the runtime accepts `count` or `n`, and this module's catalogue uses `n`. */
const COUNT = 'n'
const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string))
const forms = (v: unknown): string[] => (typeof v === 'string' ? [v] : Object.values(v as object))

describe('bundles', () => {
  it('declares every locale the module claims to ship', () => {
    expect(Object.keys(meetMessageBundles).sort()).toEqual(['ar', 'de', 'en', 'fa', 'tr'])
  })

  it('has the same key set in every locale', () => {
    const keys = Object.keys(en).sort()
    for (const [locale, bundle] of Object.entries(BUNDLES)) {
      expect({ locale, keys: Object.keys(bundle).sort() }).toEqual({ locale, keys })
    }
  })

  it('namespaces every key, so two modules cannot collide in the merged map', () => {
    for (const key of Object.keys(en)) expect(key.startsWith('meet.')).toBe(true)
  })

  it('keeps every non-count placeholder in every plural form', () => {
    for (const [key, value] of Object.entries(en)) {
      const expected = placeholders(forms(value).join(' '))
      expected.delete(COUNT)
      for (const [locale, bundle] of Object.entries(BUNDLES)) {
        for (const form of forms(bundle[key as keyof typeof bundle])) {
          const got = placeholders(form)
          got.delete(COUNT)
          expect({ key, locale, got: [...got].sort() }).toEqual({ key, locale, got: [...expected].sort() })
        }
      }
    }
  })

  it('never invents a placeholder the English string does not have', () => {
    for (const [key, value] of Object.entries(en)) {
      const allowed = placeholders(forms(value).join(' '))
      for (const [locale, bundle] of Object.entries(BUNDLES))
        for (const form of forms(bundle[key as keyof typeof bundle]))
          for (const name of placeholders(form))
            expect({ key, locale, name, known: allowed.has(name) }).toEqual({
              key,
              locale,
              name,
              known: true,
            })
    }
  })

  /** Arabic inflects six ways. A bundle with only one/other picks `other` for two, and reads wrong. */
  it('gives every Arabic plural all six CLDR categories', () => {
    const wanted = new Intl.PluralRules('ar').resolvedOptions().pluralCategories.sort()
    for (const [key, value] of Object.entries(ar)) {
      if (typeof value === 'string') continue
      expect({ key, cats: Object.keys(value).sort() }).toEqual({ key, cats: wanted })
    }
  })

  it('makes a plural of a key wherever English has one', () => {
    for (const [key, value] of Object.entries(en)) {
      if (typeof value === 'string') continue
      for (const [locale, bundle] of Object.entries(BUNDLES))
        expect({ key, locale, plural: typeof bundle[key as keyof typeof bundle] }).toEqual({
          key,
          locale,
          plural: 'object',
        })
    }
  })

  /**
   * The two literals a translator must not touch.
   *
   * `LIVEKIT_API_SECRET` is the name of a setting and `docker compose --profile calls up -d` is a
   * command somebody types; translated, each becomes an instruction that does not work. They are
   * therefore in the components rather than in the catalogue, and this asserts they stayed there —
   * a well-meaning "let me put those strings through i18n" is exactly the change this stops.
   */
  it('keeps the environment variable and the command out of the catalogue', () => {
    for (const [locale, bundle] of Object.entries(BUNDLES)) {
      const body = Object.values(bundle).flatMap(forms).join(' ')
      expect({ locale, leaked: body.includes('LIVEKIT_API_SECRET') }).toEqual({ locale, leaked: false })
      expect({ locale, leaked: body.includes('--profile') }).toEqual({ locale, leaked: false })
    }
  })
})

// ------------------------------------------------------ keys nothing asks for any more

const HERE = dirname(fileURLToPath(import.meta.url))

/** Everything in this client that could name a key — components included, catalogue excluded. */
function clientSource(): string {
  const files = readdirSync(HERE, { recursive: true, encoding: 'utf8' }).filter(
    (file) =>
      (file.endsWith('.ts') || file.endsWith('.svelte')) &&
      !file.endsWith('.test.ts') &&
      !file.endsWith('messages.ts'),
  )
  return files.map((file) => readFileSync(join(HERE, file), 'utf8')).join('\n')
}

describe('every key is one something asks for', () => {
  /**
   * A dead key is five translations somebody maintains, reviews and re-reads for a sentence that
   * cannot appear, and nothing about it looks wrong from inside the catalogue.
   *
   * Literals rather than a runtime trace, because a `.svelte` file cannot be unit-tested here. It
   * misses a key that happens to appear as an unrelated string somewhere, which is a false *pass*;
   * it never fails a key that is really used, which is the direction that matters.
   */
  it('has nothing in the catalogue that no screen can reach', () => {
    const source = clientSource()
    const dead = Object.keys(en)
      .map((key) => key.slice('meet.'.length))
      .filter((name) => !(source.includes(`'${name}'`) || source.includes(`"${name}"`)))
    expect(dead).toEqual([])
  })

  it('is reading the client rather than passing on an empty sweep', () => {
    expect(clientSource().length).toBeGreaterThan(10_000)
  })
})

/**
 * The counted message, resolved the way the runtime resolves it.
 *
 * `t()` lives in `@kernhq/ui`, whose entry point pulls in Svelte components this package's test
 * setup cannot transform. So this drives the *data* through the same `Intl.PluralRules` selection
 * `selectPlural` performs, and `t()` itself is tested where it lives.
 */
describe('counted messages', () => {
  const pick = (locale: Locale, key: string, count: number): string => {
    const value = BUNDLES[locale][key as keyof (typeof BUNDLES)[Locale]] as
      | string
      | Partial<Record<Intl.LDMLPluralRule, string>>
    if (typeof value === 'string') return value
    const category = new Intl.PluralRules(locale).select(count)
    const form = value[category] ?? value.other
    if (form === undefined) throw new Error(`${locale} ${key} has no form for ${count}`)
    return form.replace(/\{n\}/g, new Intl.NumberFormat(locale).format(count))
  }

  it('says "1 person" and "3 people" in English', () => {
    expect(pick('en', 'meet.people_count', 1)).toBe('1 person')
    expect(pick('en', 'meet.people_count', 3)).toBe('3 people')
  })

  it('follows Arabic numeral agreement rather than one-or-many', () => {
    expect(pick('ar', 'meet.people_count', 0)).toBe('لا أحد')
    expect(pick('ar', 'meet.people_count', 1)).toBe('شخص واحد')
    expect(pick('ar', 'meet.people_count', 2)).toBe('شخصان')
    expect(pick('ar', 'meet.people_count', 3)).toContain('أشخاص')
  })

  it('does not inflect the noun after a numeral in Turkish or Persian', () => {
    expect(pick('tr', 'meet.people_count', 1).replace('1', '')).toBe(
      pick('tr', 'meet.people_count', 5).replace('5', ''),
    )
    expect(pick('fa', 'meet.people_count', 1).replace('۱', '')).toBe(
      pick('fa', 'meet.people_count', 5).replace('۵', ''),
    )
  })

  it('formats the number in the reader’s own digits', () => {
    expect(pick('fa', 'meet.people_count', 5)).toContain('۵')
    expect(pick('en', 'meet.people_count', 5)).toContain('5')
  })
})
