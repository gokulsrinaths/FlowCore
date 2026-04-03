/**
 * Shared domain types for FlowCore (mirrors Supabase tables + enums).
 */

/** Legacy global role (public.users) — prefer org roles for authorization */
export type UserRole = "admin" | "manager" | "worker";

/** Organization-scoped roles */
export type OrgRole =
  | "org_owner"
  | "org_admin"
  | "org_manager"
  | "org_worker";

export type PlanTier = "free" | "pro" | "enterprise";

export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "trialing";

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  primary_use_case: string | null;
  created_at: string;
};

export type OrganizationWithRole = OrganizationRow & {
  role: OrgRole;
};

export type ItemStatus =
  | "created"
  | "in_progress"
  | "under_review"
  | "completed";

export type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  /** Legacy column; not used for workflow after SaaS migration */
  role?: UserRole;
  created_at: string;
  department?: string | null;
  description?: string | null;
  /** False until the user completes profile onboarding (new signups). */
  onboarding_completed?: boolean;
};

/** App-facing user shape (profile + onboarding). */
export type User = {
  id: string;
  name?: string | null;
  department?: string | null;
  description?: string | null;
  onboarding_completed: boolean;
};

/** Member of an org with profile fields */
export type OrgMemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  created_at: string;
  org_role: OrgRole;
  department?: string | null;
};

export type ItemRow = {
  id: string;
  title: string;
  description: string | null;
  type: string | null;
  status: ItemStatus;
  priority: string | null;
  created_by: string | null;
  assigned_to: string | null;
  /** When set, task is assigned to a case participant (external email or internal via roster) */
  assigned_participant_id?: string | null;
  organization_id: string;
  /** Optional investigation case link */
  case_id?: string | null;
  due_date?: string | null;
  due_reminder_sent_at?: string | null;
  last_activity_at?: string;
  escalation_sent_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationRow = {
  id: string;
  organization_id: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
  /** assignment | comment | reminder | escalation | status | case_activity | null (legacy) */
  type: string | null;
  entity_id: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Investigation / case management (domain layer on top of generic items) */
export type CaseStatus =
  | "open"
  | "active"
  | "under_investigation"
  | "closed";

export type CaseRow = {
  id: string;
  organization_id: string;
  title: string;
  crime_number: string | null;
  description: string | null;
  accused: unknown;
  financial_impact: number | string | null;
  status: CaseStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Case roster: internal org members and/or external emails */
export type CaseParticipantRole = "sp" | "dsp" | "officer" | "external";

export type CaseParticipant = {
  id: string;
  case_id: string;
  organization_id: string;
  user_id: string | null;
  email: string | null;
  type: "internal" | "external";
  role: CaseParticipantRole | null;
  user_name?: string | null;
  user_email?: string | null;
  /** From users.department when internal */
  department?: string | null;
  /** True when a pending case invitation exists for this participant row */
  invited?: boolean;
};

/** Item with joined assignee/creator names for UI */
export type ItemWithUsers = ItemRow & {
  assignee?: Pick<UserRow, "id" | "name" | "email"> | null;
  /** Populated when assigned_participant_id is set (name/email for display) */
  assigneeParticipant?: {
    id: string;
    displayName: string;
    email: string | null;
  } | null;
  creator?: Pick<UserRow, "id" | "name" | "email"> | null;
};

export type ActivityLogRow = {
  id: string;
  item_id: string | null;
  case_id?: string | null;
  user_id: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  organization_id: string;
  created_at: string;
};

export type ActivityLogWithUser = ActivityLogRow & {
  user?: Pick<UserRow, "id" | "name" | "email"> | null;
};

export type CommentRow = {
  id: string;
  item_id: string;
  user_id: string | null;
  text: string;
  organization_id: string;
  created_at: string;
};

export type CommentWithUser = CommentRow & {
  user?: Pick<UserRow, "id" | "name" | "email"> | null;
};

export type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: OrgRole;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  case_id?: string | null;
  participant_id?: string | null;
  status?: "pending" | "accepted" | "rejected";
};

/** Pending rows from `flowcore_list_my_pending_invitations`. */
export type PendingInvitationRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  case_id: string | null;
  case_title: string | null;
  role: OrgRole;
  invited_by_name: string;
  invited_by_email: string;
  email: string;
  created_at: string;
  expires_at: string;
  token: string;
  status: "pending";
};

export type SubscriptionRow = {
  organization_id: string;
  plan: PlanTier;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  updated_at: string;
};
