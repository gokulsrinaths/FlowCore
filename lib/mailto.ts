/**
 * Client-safe `mailto:` URLs for the default mail app (no email APIs).
 */
export function generateInviteMailto({
  to,
  inviteLink,
  caseTitle,
  orgName,
}: {
  to: string;
  inviteLink: string;
  caseTitle: string;
  orgName: string;
}): string {
  const subject = encodeURIComponent(`Join ${orgName}`);

  const body = encodeURIComponent(
    `Hi,\n\nYou've been invited to a case in ${orgName}.\n\nCase: ${caseTitle}\n\nRegister here:\n${inviteLink}\n\nAfter registering, accept the invite inside the app.\n\nThanks`
  );

  return `mailto:${encodeURIComponent(to.trim())}?subject=${subject}&body=${body}`;
}
