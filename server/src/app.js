import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import { pool } from './db.js'
import routes from './routes.js'

const app = express()
const isProduction = process.env.NODE_ENV === 'production'
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1)
const PgSession = connectPgSimple(session)
app.disable('x-powered-by')
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '100kb' }))
app.use(session({
  name: 'mk.sid', store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: false }),
  secret: process.env.SESSION_SECRET || '', resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
}))
app.use('/api', routes)
app.use((error, _req, res, _next) => {
  console.error(error?.stack || error)
  if (error?.code === '23505') return res.status(409).json({ error: 'A record with that value already exists.' })
  res.status(500).json({ error: 'Unexpected server error. Check the API logs.' })
})
const port = Number(process.env.PORT || 4000)
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET must be set to a random value of at least 32 characters in server/.env')
  process.exit(1)
}
app.listen(port, () => console.log(`Mana Kirana API listening on port ${port}`))
