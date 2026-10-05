import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { client, createConvexClientMock } = vi.hoisted(() => ({
  client: { query: vi.fn(), mutation: vi.fn() },
  createConvexClientMock: vi.fn(),
}))
createConvexClientMock.mockImplementation(() => client)
vi.mock('../apps/api/src/lib/convex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../apps/api/src/lib/convex')>()),
  createConvexClient: createConvexClientMock,
}))

import worker, { type Env } from '../apps/api/src/index'

const body = {
  job_id: 'job_1',
  event_id: 'evt_1',
  attempt: 2,
}
const photos = [{ photo_id: 'photo_1', r2_key: 'events/evt_1/photo_1.jpg' }]
function setup(queue = 'grabpic-processing') {
  const ack = vi.fn()
  const retry = vi.fn()
  const batch = { queue, messages: [{ body, ack, retry }] } as unknown as MessageBatch<typeof body>
  const env = {
    CONVEX_URL: 'https://convex.test',
    CONVEX_SERVICE_SECRET: 'secret',
    PROCESSOR_WEBHOOK_URL: 'https://processor.test/process',
    PROCESSOR_TOKEN: 'token',
  } as Env
  return { ack, retry, batch, env }
}

async function dispatch(batch: MessageBatch<typeof body>, env: Env) {
  await worker.queue!(batch, env, { waitUntil: vi.fn() } as unknown as ExecutionContext)
}

describe('processing queue consumer', () => {
  beforeEach(() => {
    client.query.mockReset()
    client.mutation.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not send deleted jobs to OCI', async () => {
    client.query.mockResolvedValueOnce({ state: 'gone', photos: [] })
    const { ack, retry, batch, env } = setup()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await dispatch(batch, env)
    expect(ack).toHaveBeenCalledOnce()
    expect(retry).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('retries until Convex records acceptance', async () => {
    client.query.mockResolvedValueOnce({ state: 'pending', photos: [] })
    const { ack, retry, batch, env } = setup()
    await dispatch(batch, env)
    expect(ack).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 10 })
  })

  it('acknowledges only the same durably accepted job identifier', async () => {
    client.query.mockResolvedValue({ state: 'accepted', photos })
    const { ack, retry, batch, env } = setup()
    const fetcher = vi.fn(async () => Response.json({ job_id: 'job_1' }, { status: 202 }))
    vi.stubGlobal('fetch', fetcher)
    await dispatch(batch, env)
    expect(fetcher).toHaveBeenCalledWith(
      'https://processor.test/process',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ...body, photos }),
      }),
    )
    expect(ack).toHaveBeenCalledOnce()
    expect(retry).not.toHaveBeenCalled()
  })

  it('retries a processor rejection or mismatched identifier', async () => {
    client.query.mockResolvedValue({ state: 'accepted', photos })
    const { ack, retry, batch, env } = setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ job_id: 'other' }, { status: 202 })),
    )
    await dispatch(batch, env)
    expect(ack).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 30 })
  })

  it('marks a job failed once it lands in the dead-letter queue', async () => {
    client.mutation.mockResolvedValue({ recorded: true })
    const { ack, retry, batch, env } = setup('grabpic-processing-dead')
    await dispatch(batch, env)
    expect(client.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventPublicId: 'evt_1', jobPublicId: 'job_1', attempt: 2 }),
    )
    expect(client.query).not.toHaveBeenCalled()
    expect(ack).toHaveBeenCalledOnce()
    expect(retry).not.toHaveBeenCalled()
  })

  it('acknowledges dead-lettered jobs that are already gone and retries real failures', async () => {
    client.mutation.mockRejectedValueOnce(new Error('STALE_JOB'))
    let { ack, retry, batch, env } = setup('grabpic-processing-dead')
    await dispatch(batch, env)
    expect(ack).toHaveBeenCalledOnce()

    client.mutation.mockRejectedValueOnce(new Error('network down'))
    ;({ ack, retry, batch, env } = setup('grabpic-processing-dead'))
    await dispatch(batch, env)
    expect(ack).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 60 })
  })
})
