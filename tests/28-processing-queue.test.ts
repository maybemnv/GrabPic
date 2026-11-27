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

import { api } from '../apps/api/convex/_generated/api'

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

  it('keeps dead letters recoverable instead of failing ambiguous accepted jobs', async () => {
    const { ack, retry, batch, env } = setup('grabpic-processing-dead')
    await dispatch(batch, env)
    expect(ack).toHaveBeenCalledOnce()
    expect(retry).not.toHaveBeenCalled()
    expect(client.mutation).not.toHaveBeenCalled()
  })

  it('does not acknowledge HTTP acceptance until delivery is durable', async () => {
    client.query.mockResolvedValue({ state: 'accepted', photos })
    client.mutation.mockRejectedValueOnce(new Error('database down'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ job_id: 'job_1' }, { status: 202 })),
    )
    const { ack, retry, batch, env } = setup()
    await dispatch(batch, env)
    expect(ack).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 30 })
    client.mutation.mockResolvedValueOnce(null)
    await dispatch(batch, env)
    expect(ack).toHaveBeenCalledOnce()
  })

  it('replays an expired message from persisted job state without a DLQ message', async () => {
    client.mutation.mockResolvedValueOnce([body])
    client.query.mockResolvedValueOnce([])
    const { env } = setup()
    const send = vi.fn(async () => undefined)
    const pending: Promise<unknown>[] = []
    await worker.scheduled!(
      { cron: '0 * * * *' } as ScheduledController,
      { ...env, PROCESSING_QUEUE: { send } } as unknown as Env,
      {
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      } as unknown as ExecutionContext,
    )
    await Promise.all(pending)
    expect(send).toHaveBeenCalledWith(body)
    expect(client.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventPublicId: 'evt_1',
        jobPublicId: 'job_1',
        attempt: 2,
        modalJobId: 'job_1',
      }),
    )
  })

  it('leaves a failed replay send eligible and still runs deletion cleanup', async () => {
    client.mutation.mockResolvedValueOnce([body])
    client.query.mockResolvedValueOnce([])
    const { env } = setup()
    const pending: Promise<unknown>[] = []
    await worker.scheduled!(
      { cron: '0 * * * *' } as ScheduledController,
      {
        ...env,
        PROCESSING_QUEUE: {
          send: vi.fn(async () => {
            throw new Error('queue down')
          }),
        },
      } as unknown as Env,
      {
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      } as unknown as ExecutionContext,
    )
    await Promise.all(pending)
    expect(client.mutation).toHaveBeenCalledTimes(1)
    expect(client.query).toHaveBeenCalledWith(
      api.deletion.listCandidates,
      expect.objectContaining({ serviceSecret: 'secret' }),
    )
  })
})

it('still cleans expired events when reconciliation cannot read Convex jobs', async () => {
  client.query.mockReset()
  client.mutation.mockReset()
  client.mutation.mockRejectedValueOnce(new Error('read failed'))
  client.query.mockResolvedValueOnce([])
  const { env } = setup()
  const pending: Promise<unknown>[] = []
  await worker.scheduled!({ cron: '0 * * * *' } as ScheduledController, env, {
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
  } as unknown as ExecutionContext)
  await Promise.all(pending)
  expect(client.query).toHaveBeenCalledWith(
    api.deletion.listCandidates,
    expect.objectContaining({ serviceSecret: 'secret' }),
  )
})

it('runs orphan cleanup even when expiry cleanup fails', async () => {
  client.query.mockReset()
  client.mutation.mockReset()
  client.mutation.mockResolvedValueOnce([])
  client.query
    .mockRejectedValueOnce(new Error('expiry read failed'))
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce([])
  const { env } = setup()
  const list = vi.fn(async () => ({ objects: [], truncated: false }))
  const pending: Promise<unknown>[] = []
  await worker.scheduled!(
    { cron: '0 * * * *' } as ScheduledController,
    { ...env, PHOTOS: { list } } as unknown as Env,
    {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    } as unknown as ExecutionContext,
  )
  await Promise.all(pending)
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'events/', limit: 100 }))
  expect(client.mutation).toHaveBeenCalledWith(
    api.deletion.advanceOrphanScan,
    expect.objectContaining({ cursor: null }),
  )
})
