import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANS } from "@/lib/billing";

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/80 bg-card/50">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="font-semibold tracking-tight">
            FlowCore
          </Link>
          <span className="flex items-center gap-2">
            <Link href="/login" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
              Sign in
            </Link>
            <Link href="/login?signup=1" className={cn(buttonVariants({ size: "sm" }))}>
              Create account
            </Link>
          </span>
        </div>
      </header>
      <main className="flex-1 mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
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
