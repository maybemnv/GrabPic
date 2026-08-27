import 'dotenv/config'
import { migrate } from './index'

async function main() {
  const url = process.env.TURSO_URL
  const token = process.env.TURSO_TOKEN
  if (!url || !token) throw new Error('TURSO_URL and TURSO_TOKEN are required')

  await migrate(url, token)
}

void main().catch((error) => {
  console.error('Database migration failed', error)
  throw error
})
