import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseErrorToError } from "@/lib/supabase-errors";
import { normalizeFieldsFromJson } from "@/lib/form-template-logic";
import type { FormSubmissionRow, FormTemplateDetail, FormTemplateListRow } from "@/types";

export const fetchFormTemplates = cache(
  async (organizationId: string): Promise<FormTemplateListRow[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_list_form_templates", {
      p_organization_id: organizationId,
    });
    if (error) throw supabaseErrorToError(error);
    if (data == null || typeof data !== "object") return [];
    const o = data as Record<string, unknown>;
    if (o.ok === false) return [];
    const arr = o.forms;
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => {
      const r = x as Record<string, unknown>;
      return {
        id: String(r.id),
        title: String(r.title ?? ""),
        description: r.description != null ? String(r.description) : null,
        updated_at: String(r.updated_at ?? ""),
        response_count: Number(r.response_count ?? 0),
      };
    });
  }
);

export const fetchFormTemplateById = cache(
  async (
    organizationId: string,
    formId: string
  ): Promise<FormTemplateDetail | null> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_get_form_template", {
      p_organization_id: organizationId,
      p_form_id: formId,
    });
    if (error) throw supabaseErrorToError(error);
    if (data == null || typeof data !== "object") return null;
    const o = data as Record<string, unknown>;
    if (o.ok === false) return null;
    const f = o.form;
    if (f == null || typeof f !== "object") return null;
    const r = f as Record<string, unknown>;
    return {
      id: String(r.id),
      organization_id: String(r.organization_id),
      title: String(r.title ?? ""),
      description: r.description != null ? String(r.description) : null,
      fields: normalizeFieldsFromJson(r.fields),
      created_at: String(r.created_at ?? ""),
      updated_at: String(r.updated_at ?? ""),
    };
  }
);

export const fetchFormSubmissions = cache(
  async (
    organizationId: string,
    formId: string,
    limit = 100
  ): Promise<FormSubmissionRow[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_list_form_submissions", {
      p_organization_id: organizationId,
      p_form_id: formId,
      p_limit: limit,
    });
    if (error) throw supabaseErrorToError(error);
    if (data == null || typeof data !== "object") return [];
    const o = data as Record<string, unknown>;
    if (o.ok === false) return [];
    const arr = o.submissions;
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => {
      const r = x as Record<string, unknown>;
      const ans = r.answers;
      return {
        id: String(r.id),
        answers:
          ans != null && typeof ans === "object" && !Array.isArray(ans)
            ? (ans as Record<string, unknown>)
            : {},
        submitted_by: r.submitted_by != null ? String(r.submitted_by) : null,
        case_id: r.case_id != null ? String(r.case_id) : null,
        created_at: String(r.created_at ?? ""),
      };
    });
  }
);
