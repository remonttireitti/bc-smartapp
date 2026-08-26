import type { ReactNode } from 'react';
import QuoteDocumentSectionView from './QuoteDocumentSectionView';
import QuoteInstallationSuppliesSection from './QuoteInstallationSuppliesSection';
import QuoteIilpDevicesSection from './QuoteIilpDevicesSection';
import QuoteRepairMaterialsSection from './QuoteRepairMaterialsSection';
import QuoteRepairWorkItemsSection from './QuoteRepairWorkItemsSection';
import QuoteWorkMaterialsSection from './QuoteWorkMaterialsSection';
import type { BrandDeliveryFeeByCategoryMap } from '../../data/devicePricingShared';
import { buildQuoteTyotTiles, type QuoteTyotTileId } from '../../lib/quoteRequest/quoteTyotEntries';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';
import type { Equipment } from '../../types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  equipment: Equipment[];
  customerSelected: boolean;
  deliveryFeeMap: BrandDeliveryFeeByCategoryMap | null;
  companyName?: string;
};

export default function QuoteTyotDocumentView({
  form,
  canEdit,
  onChange,
  equipment,
  customerSelected,
  deliveryFeeMap,
  companyName,
}: Props) {
  const tiles = buildQuoteTyotTiles(form);

  function renderTileContent(tileId: QuoteTyotTileId): ReactNode {
    switch (tileId) {
      case 'huolto-tyot':
        return (
          <QuoteRepairWorkItemsSection
            form={form}
            canEdit={canEdit}
            equipment={equipment}
            customerSelected={customerSelected}
            onChange={onChange}
            hideHeader
          />
        );
      case 'huolto-tarvikkeet':
        return <QuoteRepairMaterialsSection form={form} canEdit={canEdit} onChange={onChange} />;
      case 'iilp-laitteet':
        return (
          <QuoteIilpDevicesSection
            form={form}
            canEdit={canEdit}
            feeMap={deliveryFeeMap}
            onChange={onChange}
          />
        );
      case 'tyorivit':
        return <QuoteWorkMaterialsSection form={form} canEdit={canEdit} onChange={onChange} variant="work" />;
      case 'tarvikkeet':
        return (
          <QuoteWorkMaterialsSection form={form} canEdit={canEdit} onChange={onChange} variant="materials" />
        );
      case 'asennus-tarvikkeet':
        return (
          <QuoteInstallationSuppliesSection
            form={form}
            canEdit={canEdit}
            onChange={onChange}
            companyName={companyName}
          />
        );
      default:
        return null;
    }
  }

  if (tiles.length === 0) {
    return null;
  }

  return (
    <QuoteDocumentSectionView
      sectionTitle="Työt & tarvikkeet"
      hint="Työrivit, tarvikkeet ja laitevalinta — avaa ruudusta."
      tiles={tiles}
      renderTileContent={renderTileContent}
    />
  );
}
