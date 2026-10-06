ALTER TABLE public.invoices ADD COLUMN vat_account text NOT NULL DEFAULT '343';
ALTER TABLE public.received_invoices ADD COLUMN vat_account text NOT NULL DEFAULT '343';

CREATE OR REPLACE FUNCTION public.sync_invoice_accounting()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM public.accounting_entries WHERE invoice_id = NEW.id AND is_auto;
  INSERT INTO public.accounting_entries (user_id, invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto) VALUES
    (NEW.user_id, NEW.id, NEW.invoice_number, NEW.issue_date, 'Vystavená faktura ' || NEW.invoice_number || ' – ' || NEW.client_name, '311', 'MD', NEW.total, true),
    (NEW.user_id, NEW.id, NEW.invoice_number, NEW.issue_date, 'Tržby z faktury ' || NEW.invoice_number, '602', 'D', NEW.subtotal, true);
  IF COALESCE(NEW.vat_amount,0) <> 0 THEN
    INSERT INTO public.accounting_entries (user_id, invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto)
    VALUES (NEW.user_id, NEW.id, NEW.invoice_number, NEW.taxable_date, 'DPH na výstupu ' || NEW.invoice_number, COALESCE(NULLIF(NEW.vat_account,''),'343'), 'D', NEW.vat_amount, true);
  END IF;
  IF NEW.status = 'zaplacena' THEN
    INSERT INTO public.accounting_entries (user_id, invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto) VALUES
      (NEW.user_id, NEW.id, NEW.invoice_number, COALESCE(NEW.paid_date, CURRENT_DATE), 'Úhrada faktury ' || NEW.invoice_number, '221', 'MD', NEW.total, true),
      (NEW.user_id, NEW.id, NEW.invoice_number, COALESCE(NEW.paid_date, CURRENT_DATE), 'Úhrada faktury ' || NEW.invoice_number, '311', 'D', NEW.total, true);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS invoices_sync_accounting ON public.invoices;
CREATE TRIGGER invoices_sync_accounting
AFTER INSERT OR UPDATE OF status, total, subtotal, vat_amount, issue_date, taxable_date, paid_date, invoice_number, client_name, vat_account
ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_accounting();

CREATE OR REPLACE FUNCTION public.sync_received_invoice_accounting()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM public.accounting_entries WHERE received_invoice_id = NEW.id AND is_auto;
  INSERT INTO public.accounting_entries (user_id, received_invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto) VALUES
    (NEW.user_id, NEW.id, NEW.invoice_number, NEW.issue_date, 'Přijatá faktura ' || NEW.invoice_number || ' – ' || NEW.supplier_name, NEW.expense_account, 'MD', NEW.subtotal, true),
    (NEW.user_id, NEW.id, NEW.invoice_number, NEW.issue_date, 'Závazek z faktury ' || NEW.invoice_number, '321', 'D', NEW.total, true);
  IF COALESCE(NEW.vat_amount,0) <> 0 THEN
    INSERT INTO public.accounting_entries (user_id, received_invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto)
    VALUES (NEW.user_id, NEW.id, NEW.invoice_number, NEW.taxable_date, 'DPH na vstupu ' || NEW.invoice_number, COALESCE(NULLIF(NEW.vat_account,''),'343'), 'MD', NEW.vat_amount, true);
  END IF;
  IF NEW.paid THEN
    INSERT INTO public.accounting_entries (user_id, received_invoice_id, invoice_number, entry_date, description, account, direction, amount, is_auto) VALUES
      (NEW.user_id, NEW.id, NEW.invoice_number, COALESCE(NEW.paid_date, CURRENT_DATE), 'Úhrada přijaté faktury ' || NEW.invoice_number, '321', 'MD', NEW.total, true),
      (NEW.user_id, NEW.id, NEW.invoice_number, COALESCE(NEW.paid_date, CURRENT_DATE), 'Úhrada přijaté faktury ' || NEW.invoice_number, '221', 'D', NEW.total, true);
  END IF;
  RETURN NEW;
END $$;