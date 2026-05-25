import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  inferMaintenanceReportTrail,
  persistNavTrail,
  readNavTrail,
  readPersistedNavTrail,
  type NavigationTrailState,
  withNavTrail,
} from '../lib/navigationTrail';

export function useMaintenanceReportNavigation(input: {
  isNew: boolean;
  reportId: string | null;
  customerId: string | null;
  customerName: string | null;
  reportTitle?: string | null;
}) {
  const location = useLocation();
  const inherited =
    readNavTrail(location.state)
    ?? (input.reportId ? readPersistedNavTrail(input.reportId) : null);

  const navigation = useMemo(() => {
    const pageLabel = input.isNew
      ? 'Uusi'
      : input.reportTitle?.trim() || 'Huoltoraportti';

    const { breadcrumb, backTo, trail } = inferMaintenanceReportTrail({
      inherited,
      customerId: input.customerId,
      customerName: input.customerName,
      pageLabel,
    });

    const reportTrail: NavigationTrailState = {
      breadcrumb,
      backTo,
    };

    return {
      breadcrumb,
      backTo,
      reportTrail,
      trail,
      navState: location.state,
      linkToPrint: (reportId: string) => ({
        to: `/huoltoraportit/${reportId}/tuloste`,
        ...withNavTrail({
          breadcrumb: [...reportTrail.breadcrumb, { label: 'Tuloste' }],
          backTo: `/huoltoraportit/${reportId}`,
        }),
      }),
      linkToEdit: withNavTrail(reportTrail),
    };
  }, [
    inherited,
    input.isNew,
    input.reportId,
    input.customerId,
    input.customerName,
    input.reportTitle,
    location.state,
  ]);

  useEffect(() => {
    if (!input.reportId) return;
    persistNavTrail(input.reportId, navigation.trail);
  }, [input.reportId, navigation.trail]);

  return navigation;
}
