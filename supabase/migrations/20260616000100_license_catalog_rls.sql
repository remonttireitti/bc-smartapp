-- Hinnoittelukatalogi: RLS päälle, luku kaikille kirjautuneille.
-- Muutokset vain global_admin_update_license_catalog (SECURITY DEFINER).

ALTER TABLE public.license_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS license_catalog_select_authenticated ON public.license_catalog;
CREATE POLICY license_catalog_select_authenticated ON public.license_catalog
  FOR SELECT TO authenticated
  USING (true);
