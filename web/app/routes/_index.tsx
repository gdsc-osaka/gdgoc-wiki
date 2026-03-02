import type { MetaFunction } from "react-router"

export const meta: MetaFunction = () => [
  { title: "GDGoC Japan Wiki" },
  { name: "description", content: "Bilingual AI-powered wiki for GDGoC Japan chapters" },
]

export default function Index() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">GDGoC Japan Wiki</h1>
    </main>
  )
}
