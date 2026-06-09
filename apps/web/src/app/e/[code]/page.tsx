import { redirect } from 'next/navigation'

export default function EventRedirect({ params }: { params: { code: string } }) {
  redirect(`/attendee?code=${params.code}`)
}
