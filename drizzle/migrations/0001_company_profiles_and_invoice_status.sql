CREATE TABLE public.company_profiles (
  user_id UUID PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT '',
  ico TEXT,
  dic TEXT,
  vat_payer BOOLEAN NOT NULL DEFAULT false,
  address TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  bank_account TEXT,
  iban TEXT,
  swift TEXT,
  logo_url TEXT,
  invoice_footer TEXT,
  invoice_header_note TEXT,
  pdf_layout TEXT NOT NULL DEFAULT 'modern',
  pdf_accent TEXT NOT NULL DEFAULT '#1d4ed8',
  pdf_show_logo BOOLEAN NOT NULL DEFAULT true,
  default_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_profiles TO authenticated;
GRANT ALL ON public.company_profiles TO service_role;

ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own company profile" ON public.company_profiles
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER company_profiles_updated_at
  BEFORE UPDATE ON public.company_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_date DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;