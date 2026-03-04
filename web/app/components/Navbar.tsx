import { Form, Link, useFetcher } from "react-router"

interface NavbarProps {
  user: { name: string; email: string; image?: string | null; role: string } | null
}

export default function Navbar({ user }: NavbarProps) {
  const initial = user?.name?.[0]?.toUpperCase() ?? "?"
  const logoutFetcher = useFetcher()

  return (
    <header className="fixed top-0 right-0 left-0 z-50 flex h-14 items-center gap-4 border-b border-gray-200 bg-white px-4">
      {/* Logo */}
      <Link to="/" className="flex-shrink-0">
        <img src="/logo.png" alt="GDGoC Japan Wiki" className="h-8 w-auto" />
      </Link>

      {/* Search */}
      <Form action="/search" method="get" className="flex flex-1 justify-center">
        <input
          name="q"
          type="search"
          placeholder="Search pages…"
          className="w-full max-w-[400px] rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#4285F4] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#4285F4]"
        />
      </Form>

      {/* Right actions */}
      <div className="flex flex-shrink-0 items-center gap-3">
        {user && (
          <Link
            to="/ingest"
            className="rounded-md bg-[#4285F4] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#3574e2]"
          >
            + New Page
          </Link>
        )}

        {user ? (
          <>
            <div
              className="flex h-8 w-8 select-none items-center justify-center overflow-hidden rounded-full bg-[#4285F4] text-sm font-medium text-white"
              title={user.name}
            >
              {user.image ? (
                <img src={user.image} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </div>
            <logoutFetcher.Form method="post" action="/logout">
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
                Sign out
              </button>
            </logoutFetcher.Form>
          </>
        ) : (
          <Link to="/login" className="text-sm font-medium text-[#4285F4] hover:underline">
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
