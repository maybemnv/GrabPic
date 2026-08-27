import type { Client } from '@libsql/client'

export async function claimProcessingBatch(
  db: Pick<Client, 'execute'>,
  eventId: string,
  batchId: string,
): Promise<boolean> {
  const result = await db.execute({
    sql: `UPDATE events
          SET processing_batch_id = ?, status = 'processing'
          WHERE id = ? AND status = 'processing' AND processing_batch_id IS NULL`,
    args: [batchId, eventId],
  })
  return result.rowsAffected === 1
}
