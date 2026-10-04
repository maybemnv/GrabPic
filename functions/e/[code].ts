export async function onRequestGet(context: { params: { code: string }; request: Request }) {
  const url = new URL(context.request.url)
  const code = context.params.code
  if (!/^[a-f0-9]{32}$/i.test(code)) return new Response('Invalid invite', { status: 404 })
  return Response.redirect(`${url.origin}/attendee?invite=${encodeURIComponent(code)}`, 302)
}
