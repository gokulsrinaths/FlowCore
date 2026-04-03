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
  const subject = encodeURIComponent(`Invitation to join ${orgName}`);

  const body = encodeURIComponent(
    `Hi,\n\nYou've been invited to a case in ${orgName}.\n\nCase: ${caseTitle}\n\nPlease register and accept the invitation here:\n${inviteLink}\n\nThanks`
  );

  return `mailto:${encodeURIComponent(to.trim())}?subject=${subject}&body=${body}`;
}
