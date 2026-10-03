CREATE OR REPLACE FUNCTION public.recalc_invoices_vat(_ids uuid[], _rate numeric)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.invoice_items SET vat_rate = _rate
  WHERE user_id = auth.uid() AND (_ids IS NULL OR invoice_id = ANY(_ids));
  UPDATE public.invoices i SET
    vat_rate = _rate,
    subtotal = COALESCE(s.sub, i.subtotal),
    vat_amount = round(COALESCE(s.sub, i.subtotal) * _rate / 100, 2),
    total = COALESCE(s.sub, i.subtotal) + round(COALESCE(s.sub, i.subtotal) * _rate / 100, 2)
  FROM (SELECT inv.id, (SELECT sum(quantity * unit_price) FROM public.invoice_items it WHERE it.invoice_id = inv.id) AS sub
        FROM public.invoices inv) s
  WHERE s.id = i.id AND i.user_id = auth.uid() AND (_ids IS NULL OR i.id = ANY(_ids));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.recalc_invoices_vat(uuid[], numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_invoices_vat(uuid[], numeric) TO authenticated;