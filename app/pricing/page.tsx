import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANS } from "@/lib/billing";

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/80 bg-card/50">
        <div className="mx-auto max-w-6xl flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center font-semibold tracking-tight touch-manipulation"
          >
            FlowCore
          </Link>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Link
              href="/login"
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "w-full justify-center sm:w-auto"
              )}
            >
              Sign in
            </Link>
            <Link
              href="/login?signup=1"
              className={cn(buttonVariants({ size: "sm" }), "w-full justify-center sm:w-auto")}
            >
              Create account
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto max-w-6xl px-4 py-12 pb-[max(3rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-16">
        <div className="text-center max-w-2xl mx-auto mb-10 space-y-2 sm:mb-12">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pricing</h1>
          <p className="text-muted-foreground">
            Start free. Upgrade when volume and team size grow — billing integration is prepared
            in the product.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((p) => (
            <Card key={p.id} className={p.id === "pro" ? "border-primary/30 shadow-md" : ""}>
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription className="text-lg font-medium text-foreground">
                  {p.priceLabel}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{p.description}</p>
                <ul className="text-sm space-y-2">
                  {p.highlights.map((h) => (
                    <li key={h}>· {h}</li>
                  ))}
                </ul>
                <Link
                  href={p.id === "enterprise" ? "/login" : "/login?signup=1"}
                  className={cn(buttonVariants(), "w-full inline-flex justify-center")}
                >
                  {p.id === "enterprise" ? "Sign in to discuss" : "Get started"}
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
