import { AwsClient } from 'aws4fetch'

export interface R2SigningEnv {
  R2_ENDPOINT: string
  R2_BUCKET: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
}

export async function createSignedR2Url(
  env: R2SigningEnv,
  key: string,
  method: 'GET' | 'PUT',
  expiresIn: number,
  contentType?: string,
  contentLength?: number,
): Promise<string> {
  const endpoint = env.R2_ENDPOINT.replace(/\/$/, '')
  const objectPath = key.split('/').map(encodeURIComponent).join('/')
  const url = new URL(`${endpoint}/${encodeURIComponent(env.R2_BUCKET)}/${objectPath}`)
  url.searchParams.set('X-Amz-Expires', String(expiresIn))

  const signed = await new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  }).sign(
    new Request(url, {
      method,
      headers: {
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...(contentLength == null ? {} : { 'Content-Length': String(contentLength) }),
      },
    }),
    { aws: { signQuery: true } },
  )

  return signed.url.toString()
}
