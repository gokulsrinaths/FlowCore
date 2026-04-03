-- FlowCore schema: users, items, activity_logs, comments
-- Run in Supabase SQL Editor or via `supabase db push` after linking a project.

-- ---------------------------------------------------------------------------
-- Users mirror auth.users; role is enforced in app + optional RLS helpers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  name text,
  email text,
  role text NOT NULL DEFAULT 'worker' CHECK (role IN ('admin', 'manager', 'worker')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Items (tasks / cases) with workflow status
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  type text,
  status text NOT NULL DEFAULT 'created' CHECK (
    status IN ('created', 'in_progress', 'under_review', 'completed')
  ),
  priority text,
  created_by uuid REFERENCES public.users (id),
  assigned_to uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_status ON public.items (status);
CREATE INDEX IF NOT EXISTS idx_items_assigned ON public.items (assigned_to);

-- ---------------------------------------------------------------------------
-- Audit trail for every meaningful change
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items (id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users (id),
  action text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_item ON public.activity_logs (item_id);

-- ---------------------------------------------------------------------------
-- Threaded discussion on items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items (id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users (id),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_item ON public.comments (item_id);

-- ---------------------------------------------------------------------------
-- Keep updated_at fresh on row updates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_items_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_updated_at ON public.items;
CREATE TRIGGER trg_items_updated_at
BEFORE UPDATE ON public.items
FOR EACH ROW
EXECUTE FUNCTION public.set_items_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create public.users when a Supabase Auth user registers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'worker'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper for policies (SECURITY DEFINER bypasses RLS on users lookup)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security (baseline: authenticated users; refine per deployment)
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Users: any signed-in user can read profiles (assignee pickers, admin UI)
CREATE POLICY "users_select_authenticated"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

-- Users: self-edit or admin; role escalation should still go through trusted server logic
CREATE POLICY "users_update_self_or_admin"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- Items: full CRUD for authenticated (business rules enforced in server actions)
CREATE POLICY "items_select_authenticated"
  ON public.items FOR SELECT TO authenticated USING (true);

CREATE POLICY "items_insert_authenticated"
  ON public.items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "items_update_authenticated"
  ON public.items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "items_delete_authenticated"
  ON public.items FOR DELETE TO authenticated USING (true);

-- Activity logs & comments: read/write for authenticated
CREATE POLICY "activity_select_authenticated"
  ON public.activity_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "activity_insert_authenticated"
  ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "comments_select_authenticated"
  ON public.comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "comments_insert_authenticated"
  ON public.comments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "comments_delete_own"
  ON public.comments FOR DELETE TO authenticated USING (auth.uid() = user_id);
