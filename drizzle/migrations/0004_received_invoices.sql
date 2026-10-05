CREATE OR REPLACE FUNCTION public.sync_invoice_accounting()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM public.accounting_entries WHERE invoice_id = NEW.id AND is_auto;
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

CREATE TABLE public.received_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  invoice_number text NOT NULL,
  supplier_name text NOT NULL,
  supplier_ico text,
  supplier_dic text,
  description text,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  taxable_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 21,
  vat_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  expense_account text NOT NULL DEFAULT '518',
  paid boolean NOT NULL DEFAULT false,
  paid_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.received_invoices TO authenticated;
GRANT ALL ON public.received_invoices TO service_role;
ALTER TABLE public.received_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own received invoices" ON public.received_invoices
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.accounting_entries
  ADD COLUMN received_invoice_id uuid REFERENCES public.received_invoices(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.sync_received_invoice_accounting()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM public.accounting_entries WHERE received_invoice_id = NEW.id AND is_auto;
  INSERT INTO public.accounting_entries (user_id, received_invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto) VALUES
    (NEW.user_id, NEW.id, NEW.invoice_number, NEW.issue_date, 'Přijatá faktura ' || NEW.invoice_number || ' – ' || NEW.supplier_name, NEW.expense_account, 'MD', NEW.subtotal, true),
    (NEW.user_id, NEW.id, NEW.invoice_number, NEW.issue_date, 'Závazek z faktury ' || NEW.invoice_number, '321', 'D', NEW.total, true);
  IF COALESCE(NEW.vat_amount,0) <> 0 THEN
    INSERT INTO public.accounting_entries (user_id, received_invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto)
    VALUES (NEW.user_id, NEW.id, NEW.invoice_number, NEW.taxable_date, 'DPH na vstupu ' || NEW.invoice_number, '343', 'MD', NEW.vat_amount, true);
  END IF;
  IF NEW.paid THEN
    INSERT INTO public.accounting_entries (user_id, received_invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto) VALUES
      (NEW.user_id, NEW.id, NEW.invoice_number, COALESCE(NEW.paid_date, CURRENT_DATE), 'Úhrada přijaté faktury ' || NEW.invoice_number, '321', 'MD', NEW.total, true),
      (NEW.user_id, NEW.id, NEW.invoice_number, COALESCE(NEW.paid_date, CURRENT_DATE), 'Úhrada přijaté faktury ' || NEW.invoice_number, '221', 'D', NEW.total, true);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER received_invoices_sync_accounting
AFTER INSERT OR UPDATE ON public.received_invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_received_invoice_accounting();