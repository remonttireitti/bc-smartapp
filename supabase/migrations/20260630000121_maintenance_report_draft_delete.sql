-- Salli huoltoraportin luonnoksen poisto myös tekijälle / kumppanille, ei vain adminille.

DROP POLICY IF EXISTS maintenance_reports_delete ON maintenance_reports;

CREATE POLICY maintenance_reports_delete ON maintenance_reports FOR DELETE
  USING (
    NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
    AND (
      public.is_global_admin()
      OR (
        owner_company_id = public.current_company_id()
        AND public.is_company_admin_or_manager()
      )
      OR (
        status = 'draft'
        AND assigned_user_id = auth.uid()
        AND public.can_see_company_row(owner_company_id, created_by_company_id)
      )
      OR (
        status = 'draft'
        AND created_by_company_id = public.current_company_id()
        AND public.can_write_module(owner_company_id, 'maintenance_reports')
      )
    )
  );
