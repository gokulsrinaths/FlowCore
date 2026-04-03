import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ orgSlug: string }> };

export default async function SettingsIndex({ params }: PageProps) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/settings/general`);
}
