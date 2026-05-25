-- Poisto-oikeudet: työraportti = laatija itse; muut = oman yrityksen admin/esimies

CREATE OR REPLACE FUNCTION public.is_company_admin_or_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
      AND company_id IS NOT NULL
  );
$$;

CREATE POLICY work_reports_delete ON work_reports FOR DELETE
  USING (
    NOT public.is_customer_user()
    AND (
      public.is_global_admin()
      OR created_by_user_id = auth.uid()
    )
  );

CREATE POLICY maintenance_reports_delete ON maintenance_reports FOR DELETE
  USING (
    NOT public.is_customer_user()
    AND (
      public.is_global_admin()
      OR (
        owner_company_id = public.current_company_id()
        AND public.is_company_admin_or_manager()
      )
    )
  );

CREATE POLICY customers_delete ON customers FOR DELETE
  USING (
    NOT public.is_customer_user()
    AND (
      public.is_global_admin()
      OR (
        owner_company_id = public.current_company_id()
        AND public.is_company_admin_or_manager()
      )
    )
  );

CREATE POLICY equipment_delete ON equipment FOR DELETE
  USING (
    NOT public.is_customer_user()
    AND (
      public.is_global_admin()
      OR (
        owner_company_id = public.current_company_id()
        AND public.is_company_admin_or_manager()
      )
    )
  );
