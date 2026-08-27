type RandomSource = () => Uint32Array
type InsertEvent = (passcode: string) => Promise<unknown>

export function generatePasscode(
  randomSource: RandomSource = () => {
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)
    return values
  },
): string {
  return String(100000 + (randomSource()[0] % 900000))
}

function isPasscodeConflict(error: unknown): boolean {
  return /unique constraint failed:\s*events\.passcode/i.test(String(error))
}

export async function insertEventWithUniquePasscode(
  insertEvent: InsertEvent,
  randomSource?: RandomSource,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const passcode = generatePasscode(randomSource)
    try {
      await insertEvent(passcode)
      return passcode
    } catch (error) {
      if (!isPasscodeConflict(error) || attempt === 9) throw error
    }
  }
  throw new Error('Unable to allocate a unique event passcode')
}
