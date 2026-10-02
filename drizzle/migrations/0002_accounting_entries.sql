CREATE TABLE public.accounting_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  invoice_number text,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  account text NOT NULL,
  direction text NOT NULL DEFAULT 'MD' CHECK (direction IN ('MD','D')),
  amount numeric NOT NULL DEFAULT 0,
  is_auto boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_entries TO authenticated;
GRANT ALL ON public.accounting_entries TO service_role;
ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own accounting entries" ON public.accounting_entries
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX accounting_entries_user_idx ON public.accounting_entries(user_id, account);
CREATE INDEX accounting_entries_invoice_idx ON public.accounting_entries(invoice_id);

CREATE OR REPLACE FUNCTION public.sync_invoice_accounting()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM public.accounting_entries WHERE invoice_id = NEW.id AND is_auto;
  IF NEW.status IN ('navrh','storno') THEN RETURN NEW; END IF;
  INSERT INTO public.accounting_entries (user_id, invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto) VALUES
    (NEW.user_id, NEW.id, NEW.invoice_number, NEW.issue_date, 'Vystavená faktura ' || NEW.invoice_number || ' – ' || NEW.client_name, '311', 'MD', NEW.total, true),
    (NEW.user_id, NEW.id, NEW.invoice_number, NEW.issue_date, 'Tržby z faktury ' || NEW.invoice_number, '602', 'D', NEW.subtotal, true);
  IF COALESCE(NEW.vat_amount,0) <> 0 THEN
    INSERT INTO public.accounting_entries (user_id, invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto)
    VALUES (NEW.user_id, NEW.id, NEW.invoice_number, NEW.taxable_date, 'DPH na výstupu ' || NEW.invoice_number, '343', 'D', NEW.vat_amount, true);
  END IF;
  IF NEW.status = 'zaplacena' THEN
    INSERT INTO public.accounting_entries (user_id, invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto) VALUES
      (NEW.user_id, NEW.id, NEW.invoice_number, COALESCE(NEW.paid_date, CURRENT_DATE), 'Úhrada faktury ' || NEW.invoice_number, '221', 'MD', NEW.total, true),
      (NEW.user_id, NEW.id, NEW.invoice_number, COALESCE(NEW.paid_date, CURRENT_DATE), 'Úhrada faktury ' || NEW.invoice_number, '311', 'D', NEW.total, true);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER invoices_sync_accounting
AFTER INSERT OR UPDATE OF status, total, subtotal, vat_amount, issue_date, taxable_date, paid_date, invoice_number, client_name
ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_accounting();

INSERT INTO public.accounting_entries (user_id, invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto)
SELECT i.user_id, i.id, i.invoice_number, i.issue_date, 'Vystavená faktura ' || i.invoice_number || ' – ' || i.client_name, '311', 'MD', i.total, true
FROM public.invoices i WHERE i.status NOT IN ('navrh','storno');
INSERT INTO public.accounting_entries (user_id, invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto)
SELECT i.user_id, i.id, i.invoice_number, i.issue_date, 'Tržby z faktury ' || i.invoice_number, '602', 'D', i.subtotal, true
FROM public.invoices i WHERE i.status NOT IN ('navrh','storno');
INSERT INTO public.accounting_entries (user_id, invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto)
SELECT i.user_id, i.id, i.invoice_number, i.taxable_date, 'DPH na výstupu ' || i.invoice_number, '343', 'D', i.vat_amount, true
FROM public.invoices i WHERE i.status NOT IN ('navrh','storno') AND COALESCE(i.vat_amount,0) <> 0;
INSERT INTO public.accounting_entries (user_id, invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto)
SELECT i.user_id, i.id, i.invoice_number, COALESCE(i.paid_date, CURRENT_DATE), 'Úhrada faktury ' || i.invoice_number, a.account, a.dir, i.total, true
FROM public.invoices i CROSS JOIN (VALUES ('221','MD'),('311','D')) AS a(account, dir) WHERE i.status = 'zaplacena';