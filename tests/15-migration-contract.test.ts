import { describe, expect, it } from 'vitest'
import { getSchemaStatements } from '../packages/db/src/index'

describe('database migration contract', () => {
  it('exposes one SQL statement per migration execution', () => {
    const statements = getSchemaStatements()

    expect(statements.length).toBeGreaterThan(10)
    expect(statements.every((statement) => !statement.trim().includes(';'))).toBe(true)
  })
})
