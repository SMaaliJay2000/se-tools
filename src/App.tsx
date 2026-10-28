import { Suspense } from "react";
import { ArrowRight, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Link, usePathname } from "@/lib/router";
import { tools } from "@/tools/registry";

function Home() {
  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <h1 className="max-w-[24ch] text-3xl font-bold tracking-tight md:text-4xl">Tools for software engineers</h1>
        <p className="max-w-[62ch] text-muted-foreground">Small, focused utilities for everyday security and backend work. Nothing is stored on the server.</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => (
          <li key={t.id}>
            <Link href={`/${t.id}`} className="group block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Card className="h-full gap-3 p-5 transition-shadow group-hover:ring-primary/40">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <t.icon className="size-5" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-semibold tracking-tight">{t.name}</h2>
                <p className="text-muted-foreground">{t.tagline}</p>
                <span className="mt-auto inline-flex items-center gap-1 pt-1 font-medium text-primary">
                  Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotFound() {
  return (
    <div className="grid gap-3">
      <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">
        There is no tool at this address. <Link href="/" className="text-primary underline-offset-4 hover:underline">Back to all tools</Link>.
      </p>
    </div>
  );
}

export default function App() {
  // "/hash-playground/password" -> id "hash-playground", subPath ["password"]
  const [, id = "", ...subPath] = usePathname().split("/").map((s) => decodeURIComponent(s));
  const tool = tools.find((t) => t.id === id);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-4 pb-8 sm:px-6 lg:px-10">
      <header className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b bg-background/80 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-sev-low text-primary-foreground shadow-sm">
            <Wrench className="size-5" aria-hidden="true" />
          </span>
          SE Tools
        </Link>
        <nav aria-label="Tools" className="flex flex-wrap gap-1">
          {tools.map((t) => (
            <Link
              key={t.id}
              href={`/${t.id}`}
              aria-current={t.id === id ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                t.id === id && "bg-muted text-foreground",
              )}
            >
              <t.icon className="size-4" aria-hidden="true" />
              {t.name}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1 pt-9">
        {tool ? (
          <Suspense
            fallback={
              <div className="grid gap-3" role="status">
                <span className="sr-only">Loading {tool.name}…</span>
                <Skeleton className="h-10 w-2/3 rounded-xl" />
                <Skeleton className="h-40 rounded-xl" />
              </div>
            }
          >
            <tool.component subPath={subPath} />
          </Suspense>
        ) : id ? (
          <NotFound />
        ) : (
          <Home />
        )}
      </main>
    </div>
  );
}
