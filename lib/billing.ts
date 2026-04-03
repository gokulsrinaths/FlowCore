import type { PlanTier } from "@/types";

/** Display metadata for pricing UI — not wired to Stripe yet */
export const PLANS: {
  id: PlanTier;
  name: string;
  priceLabel: string;
  description: string;
  highlights: string[];
}[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "$0",
    description: "Small teams getting started with structured workflows.",
    highlights: [
      "Up to 10 members",
      "Up to 200 items",
      "Full audit trail",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "Contact us",
    description: "Growing teams that need more volume and priority support.",
    highlights: [
      "Up to 100 members",
      "Up to 10,000 items",
      "Priority support (coming soon)",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceLabel: "Custom",
    description: "SSO, SAML, compliance, and dedicated support.",
    highlights: [
      "Unlimited scale (fair use)",
      "Security review",
      "Custom contracts",
    ],
  },
];

export function planDisplayName(plan: PlanTier): string {
  return PLANS.find((p) => p.id === plan)?.name ?? plan;
}
