export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">GrabPic</h1>
      <p className="text-lg text-gray-600 mb-8 text-center max-w-md">
        Upload event photos once. Attendees take a selfie and get their personalized gallery instantly.
      </p>
      <div className="flex gap-4">
        <a
          href="/organizer"
          className="rounded-lg bg-black px-6 py-3 text-white font-medium hover:bg-gray-800"
        >
          Organizer Dashboard
        </a>
        <a
          href="/attendee"
          className="rounded-lg border border-gray-300 px-6 py-3 text-gray-700 font-medium hover:bg-gray-100"
        >
          Find My Photos
        </a>
      </div>
    </main>
  )
}
