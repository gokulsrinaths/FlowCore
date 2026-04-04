import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsSubnav } from "@/components/settings-subnav";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { PLANS, planDisplayName } from "@/lib/billing";
import { fetchSubscription, getOrgMembershipBySlug } from "@/lib/organizations";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ orgSlug: string }> };

export default async function BillingSettingsPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const membership = await getOrgMembershipBySlug(orgSlug);
  if (!membership) notFound();

  const sub = await fetchSubscription(membership.organization.id);
  const plan = (sub?.plan as "free" | "pro" | "enterprise") ?? "free";

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Workspace name, team, and billing.
          </p>
        </div>
        <SettingsSubnav orgSlug={orgSlug} current="billing" />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Billing</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Plan and usage — Stripe checkout will plug in here.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current plan</CardTitle>
          <CardDescription>
            You are on <strong>{planDisplayName(plan)}</strong>
            {sub?.status && (
              <>
                {" "}
                · status: {sub.status}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link
            href="/pricing"
            className={cn(buttonVariants(), "inline-flex w-full justify-center sm:w-auto")}
          >
            View plans & upgrade
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {PLANS.map((p) => (
          <Card key={p.id} className={p.id === plan ? "border-primary/40" : ""}>
            <CardHeader>
              <CardTitle className="text-base">{p.name}</CardTitle>
              <CardDescription>{p.priceLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-xs text-muted-foreground space-y-1">
                {p.highlights.map((h) => (
                  <li key={h}>· {h}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
