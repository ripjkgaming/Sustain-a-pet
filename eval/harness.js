import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))

export const loadCases = () => JSON.parse(readFileSync(join(DIR, 'cases.json'), 'utf8')).cases

const imageCache = new Map()
export function imageDataUrl(name) {
  if (!imageCache.has(name)) {
    imageCache.set(name, `data:image/png;base64,${readFileSync(join(DIR, 'fixtures', name)).toString('base64')}`)
  }
  return imageCache.get(name)
}

/** Arguments for generateQuest from a case input. */
export function questArgs(testCase) {
  const { text, image, clarification, location } = testCase.input
  const args = { clientId: `eval-${testCase.id}`.slice(0, 64).replace(/[^A-Za-z0-9_-]/g, '-') }
  if (text !== undefined) args.text = text
  if (image) args.image = imageDataUrl(image)
  if (clarification !== undefined) args.clarification = clarification
  if (location) args.constraints = { location }
  return args
}

/** fetchImpl returning the scripted model output for a case. */
export function scriptedFetch(mock) {
  return async (_url, { signal } = {}) => {
    if (mock.type === 'http') return { ok: false, status: mock.status, json: async () => ({}) }
    if (mock.type === 'hang') {
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    }
    const content = mock.type === 'json' ? JSON.stringify(mock.body) : mock.text
    return { ok: true, status: 200, json: async () => ({ model: 'scripted-mock', choices: [{ message: { content } }] }) }
  }
}
