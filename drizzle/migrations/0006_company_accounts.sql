CREATE TABLE public.company_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'ostatni',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_accounts TO authenticated;
GRANT ALL ON public.company_accounts TO service_role;
ALTER TABLE public.company_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own company accounts" ON public.company_accounts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);