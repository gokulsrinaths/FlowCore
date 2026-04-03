import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ContinueWorkspaceButton } from "./continue-workspace-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signOutAction } from "@/app/actions/auth";

export function LoggedInPanel({ continueHref }: { continueHref: string }) {
  return (
    <Card className="w-full max-w-md shadow-md">
      <CardHeader className="space-y-1">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight hover:text-primary transition-colors"
        >
          FlowCore
        </Link>
        <CardTitle className="text-lg">You&apos;re signed in</CardTitle>
        <CardDescription className="text-pretty">
          Your session stays active when you refresh or come back later. Use your workspace
          below, or sign out to use a different account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ContinueWorkspaceButton href={continueHref} />
        <form action={signOutAction}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center">
          <Link href="/" className="underline-offset-4 hover:underline">
            ← Back to home
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
