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
  /** Present after migration 027 */
  district?: string | null;
  description: string | null;
  accused: unknown;
  financial_impact: number | string | null;
  status: CaseStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** True when every case question is answered (migration 028). */
  all_questions_answered?: boolean;
};

export type CaseQuestionStatus = "pending" | "in_progress" | "answered";

export type CaseQuestionLatestAnswer = {
  answer_text: string;
  reasoning: string | null;
  answered_by: string | null;
  created_at: string;
};

export type CaseQuestionRow = {
  id: string;
  case_id: string;
  question_text: string;
  description: string | null;
  assigned_to_participant_id: string | null;
  status: CaseQuestionStatus;
  depends_on: string[];
  order_index: number;
  created_at: string;
  deps_unlocked: boolean;
  latest_answer: CaseQuestionLatestAnswer | null;
};

/** Unlocked questions assigned to the current user (dashboard). */
export type MyCaseQuestionRow = {
  id: string;
  case_id: string;
  case_title: string;
  org_slug: string;
  question_text: string;
  description: string | null;
  status: CaseQuestionStatus;
  depends_on: string[];
  order_index: number;
  assigned_to_participant_id: string | null;
  deps_unlocked: boolean;
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
  /** Latest invitation status for this participant row (case invites), if any */
  invite_status?: "invited" | "registered" | "accepted" | "rejected" | string | null;
  /** Token for open case invitation (invited/registered), for share/mailto links */
  invite_token?: string | null;
};

/** Per-item questionnaire assigned to a workspace member (migration 031). */
export type ItemQuestionnaireStatus =
  | "pending_accept"
  | "in_progress"
  | "under_review"
  | "completed";

export type ItemQuestionnairePreview = {
  id: string;
  item_id: string;
  question_text: string;
  status: ItemQuestionnaireStatus;
};

export type ItemQuestionnaireRow = ItemQuestionnairePreview & {
  description: string | null;
  assigned_to_user_id: string;
  sort_order: number;
  answer_text: string | null;
  accepted_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MyItemQuestionnaireRow = {
  id: string;
  item_id: string;
  item_title: string;
  case_id: string | null;
  question_text: string;
  description: string | null;
  status: ItemQuestionnaireStatus;
  answer_text: string | null;
  accepted_at: string | null;
  submitted_at: string | null;
  updated_at: string;
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
  /** Questionnaires on this item (batch-loaded for board + detail). */
  itemQuestionnaires?: ItemQuestionnairePreview[];
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
  status?: "invited" | "registered" | "accepted" | "rejected";
};

/** Rows from `flowcore_list_my_invitations`. */
export type InvitationListRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  /** Workspace URL segment from organizations.slug (list RPC). */
  organization_slug?: string;
  case_id: string | null;
  case_title: string | null;
  role: OrgRole;
  invited_by_name: string;
  invited_by_email: string;
  email: string;
  created_at: string;
  expires_at: string;
  token: string;
  status: "invited" | "registered" | "accepted" | "rejected";
};

export type UserInvitationsGrouped = {
  pending: InvitationListRow[];
  accepted: InvitationListRow[];
  rejected: InvitationListRow[];
};

/** Inbox view (RPC-backed; same rows as list, trimmed for UI). */
export type InvitationInboxItem = {
  id: string;
  status: "invited" | "registered" | "accepted" | "rejected";
  case_title: string | null;
  org_name: string;
  /** Present when list RPC includes organization_slug (migration 026+). */
  org_slug?: string;
  created_at: string;
  token?: string;
};

export type UserInvitationsInbox = {
  pending: InvitationInboxItem[];
  accepted: InvitationInboxItem[];
  rejected: InvitationInboxItem[];
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

/** Google Forms–style org templates (migration 030). */
export type FormFieldType = "short_text" | "long_text" | "mcq_single" | "mcq_multi";

export type FormShowWhenOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "is_empty"
  | "is_not_empty";

export type FormFieldShowWhen = {
  fieldId: string;
  operator: FormShowWhenOperator;
  /** Compared to parent answer (MCQ option value or text). Omit for is_empty / is_not_empty. */
  value?: string;
};

export type FormTemplateField = {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  showWhen?: FormFieldShowWhen | null;
  orderIndex: number;
};

export type FormTemplateListRow = {
  id: string;
  title: string;
  description: string | null;
  updated_at: string;
  response_count: number;
};

export type FormTemplateDetail = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  fields: FormTemplateField[];
  created_at: string;
  updated_at: string;
};

export type FormSubmissionRow = {
  id: string;
  answers: Record<string, unknown>;
  submitted_by: string | null;
  case_id: string | null;
  created_at: string;
};
