import type { ReactNode } from 'react';
import QuoteDocumentSectionView from './QuoteDocumentSectionView';
import QuoteInstallationSuppliesProductsSection from './QuoteInstallationSuppliesProductsSection';
import QuoteIilpDevicesSection from './QuoteIilpDevicesSection';
import QuoteRepairWorkItemsSection from './QuoteRepairWorkItemsSection';
import QuoteWorkMaterialsSection from './QuoteWorkMaterialsSection';
import type { BrandDeliveryFeeByCategoryMap } from '../../data/devicePricingShared';
import { isRepairQuoteType } from '../../lib/quoteRequest/constants';
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
}: Props) {
  const tiles = buildQuoteTyotTiles(form);

  function renderTileContent(tileId: QuoteTyotTileId): ReactNode {
    switch (tileId) {
      case 'tyot':
        return (
          <>
            {isRepairQuoteType(form.type) ? (
              <QuoteRepairWorkItemsSection
                form={form}
                canEdit={canEdit}
                equipment={equipment}
                customerSelected={customerSelected}
                onChange={onChange}
                hideHeader
              />
            ) : (
              <QuoteWorkMaterialsSection form={form} canEdit={canEdit} onChange={onChange} variant="work" />
            )}
            <QuoteInstallationSuppliesProductsSection
              form={form}
              canEdit={canEdit}
              onChange={onChange}
              rowKindFilter="labor"
            />
          </>
        );
      case 'tarvikkeet':
        return (
          <QuoteInstallationSuppliesProductsSection
            form={form}
            canEdit={canEdit}
            onChange={onChange}
            rowKindFilter="supply"
          />
        );
      case 'kulut':
        return (
          <QuoteInstallationSuppliesProductsSection
            form={form}
            canEdit={canEdit}
            onChange={onChange}
            rowKindFilter="expense"
          />
        );
      case 'laite':
        return (
          <QuoteInstallationSuppliesProductsSection
            form={form}
            canEdit={canEdit}
            onChange={onChange}
            rowKindFilter="device"
          />
        );
      case 'iilp-laitteet':
        return (
          <QuoteIilpDevicesSection
            form={form}
            canEdit={canEdit}
            feeMap={deliveryFeeMap}
            onChange={onChange}
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
      hint="Työt, tarvikkeet, kulut ja laitteet — avaa ruudusta."
      tiles={tiles}
      renderTileContent={renderTileContent}
    />
  );
}
