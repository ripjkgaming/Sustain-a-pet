import ecoQuestHandler from '../api/eco-quest.js'

const MAX_BODY_BYTES = 6 * 1024 * 1024

// Reads the raw request body, rejecting anything over MAX_BODY_BYTES.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let failed = false
    req.on('data', (chunk) => {
      if (failed) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        failed = true
        reject(Object.assign(new Error('payload too large'), { status: 413 }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', (err) => {
      if (!failed) reject(err)
    })
  })
}

// Connect-style middleware that adapts Node req/res to the Vercel-style
// (req, res) handler in api/eco-quest.js. Shared by `vite dev` and
// `vite preview` so both serve the identical route, status codes and JSON.
// `env` is passed to the handler directly, so the key never reaches the client bundle.
export function ecoQuestMiddleware(env = process.env, handler = ecoQuestHandler) {
  return async (req, res) => {
    res.status = (code) => {
      res.statusCode = code
      return res
    }
    res.json = (obj) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(obj))
    }

    if (req.method === 'POST') {
      let raw
      try {
        raw = await readBody(req)
      } catch (err) {
        const tooLarge = err.status === 413
        return res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'payload_too_large' : 'bad_body' })
      }
      try {
        req.body = raw ? JSON.parse(raw) : {}
      } catch {
        return res.status(400).json({ error: 'bad_body', message: 'body is not valid JSON' })
      }
    }

    try {
      await handler(req, res, env)
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'server_error' })
    }
  }
}
