import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { maintenanceReportListTitle } from '../lib/huoltoRaportti/defaults';
import type { HuoltoReportData } from '../lib/huoltoRaportti/types';
import {
  appendPage,
  inferMaintenanceReportTrail,
  readNavTrail,
  readPersistedNavTrail,
  withNavTrail,
  type BreadcrumbItem,
  type NavigationTrailState,
} from '../lib/navigationTrail';
import { supabase } from '../lib/supabase';

export function useMaintenancePrintNavigation(reportId: string | undefined, reportData: HuoltoReportData | null) {
  const location = useLocation();
  const inherited = readNavTrail(location.state);
  const persisted = reportId ? readPersistedNavTrail(reportId) : null;
  const [loadedCustomerName, setLoadedCustomerName] = useState<string | null>(null);

  const customerId = reportData?.customerId ?? null;

  useEffect(() => {
    if (!customerId || loadedCustomerName || inherited || persisted) return;
    void supabase
      .from('customers')
      .select('name')
      .eq('id', customerId)
      .maybeSingle()
      .then(({ data }) => {
        setLoadedCustomerName((data as { name: string } | null)?.name ?? null);
      });
  }, [customerId, inherited, loadedCustomerName, persisted]);

  return useMemo(() => {
    const pageLabel = reportData ? maintenanceReportListTitle(reportData) : 'Huoltoraportti';
    const printLabel = 'Tuloste';

    let reportTrail: NavigationTrailState | null = inherited;
    if (reportTrail?.breadcrumb.at(-1)?.label === printLabel) {
      reportTrail = {
        breadcrumb: reportTrail.breadcrumb.slice(0, -1),
        backTo: reportTrail.backTo,
      };
    } else if (persisted) {
      reportTrail = persisted;
    } else if (reportData) {
      reportTrail = inferMaintenanceReportTrail({
        inherited: null,
        customerId,
        customerName: loadedCustomerName ?? (reportData.asiakas.trim() || null),
        pageLabel,
      }).trail;
      reportTrail = {
        breadcrumb: appendPage(reportTrail, pageLabel),
        backTo: reportTrail.backTo,
      };
    }

    const breadcrumb: BreadcrumbItem[] = reportTrail
      ? [...reportTrail.breadcrumb, { label: printLabel }]
      : [{ label: 'Etusivu', to: '/' }, { label: 'Huoltoraportit', to: '/huoltoraportit' }, { label: printLabel }];

    const editTrail =
      reportTrail ??
      inferMaintenanceReportTrail({
        inherited: null,
        customerId,
        customerName: loadedCustomerName ?? (reportData?.asiakas.trim() || null),
        pageLabel,
      }).trail;

    const editTrailWithPage: NavigationTrailState = {
      breadcrumb: appendPage(editTrail, pageLabel),
      backTo: editTrail.backTo,
    };

    return {
      breadcrumb,
      backTo: reportId ? `/huoltoraportit/${reportId}` : '/huoltoraportit',
      linkToEdit: reportId
        ? {
            to: `/huoltoraportit/${reportId}`,
            ...withNavTrail(editTrailWithPage),
          }
        : null,
      listBackTo: editTrail.backTo,
    };
  }, [inherited, persisted, reportData, customerId, loadedCustomerName, reportId]);
}
