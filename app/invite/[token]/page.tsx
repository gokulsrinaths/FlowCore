import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { AcceptInviteButton } from "@/components/accept-invite-button";
import { getSessionUser } from "@/lib/auth";
import { fetchInvitationPreview } from "@/lib/invite-preview";

type PageProps = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;
  const preview = await fetchInvitationPreview(token);
  const user = await getSessionUser();
  const nextParam = encodeURIComponent(`/invite/${token}`);
  const loginHref = `/login?next=${nextParam}`;
  const signupHref = `/login?signup=1&next=${nextParam}`;

  if (!preview.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation unavailable</CardTitle>
            <CardDescription>
              {preview.accepted
                ? "This invitation has already been accepted."
                : preview.error}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline" }), "inline-flex w-full justify-center")}
            >
              Go to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Invitation</CardTitle>
          <CardDescription>
            Sign in with the invited email, then accept or decline from{" "}
            <Link href="/invitations" className="text-primary underline-offset-4 hover:underline">
              Invitations
            </Link>{" "}
            or tap Accept below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Workspace</dt>
              <dd className="font-medium">{preview.organizationName}</dd>
            </div>
            {preview.hasCase && (
              <div>
                <dt className="text-muted-foreground">Case</dt>
                <dd className="font-medium">{preview.caseTitle ?? "—"}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Invited email</dt>
              <dd className="font-mono text-xs break-all">{preview.email}</dd>
            </div>
          </dl>

          {user ? (
            <AcceptInviteButton token={token} />
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Sign in or create an account with <strong>{preview.email}</strong>, then accept
                here or on the Invitations page.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href={loginHref}
                  className={cn(buttonVariants(), "flex-1 inline-flex justify-center")}
                >
                  Sign in
                </Link>
                <Link
                  href={signupHref}
                  className={cn(
                    buttonVariants({ variant: "secondary" }),
                    "flex-1 inline-flex justify-center"
                  )}
                >
                  Create account
                </Link>
              </div>
            </div>
          )}

          {user && (
            <p className="text-xs text-muted-foreground text-center">
              Wrong account?{" "}
              <Link href="/login" className="text-primary underline-offset-4 hover:underline">
                Sign out and switch
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
