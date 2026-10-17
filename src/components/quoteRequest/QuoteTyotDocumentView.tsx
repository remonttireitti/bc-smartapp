import type { ReactNode } from 'react';
import QuoteDocumentSectionView from './QuoteDocumentSectionView';
import QuoteInstallationSuppliesProductsSection from './QuoteInstallationSuppliesProductsSection';
import QuoteIilpDevicesSection from './QuoteIilpDevicesSection';
import QuoteRepairWorkItemsSection from './QuoteRepairWorkItemsSection';
import QuoteWorkMaterialsSection from './QuoteWorkMaterialsSection';
import type { BrandDeliveryFeeByCategoryMap } from '../../data/devicePricingShared';
import { isRepairQuoteType } from '../../lib/quoteRequest/constants';
import { buildQuoteTyotTiles, type QuoteTyotTileId } from '../../lib/quoteRequest/quoteTyotEntries';
import type { QuoteMaterialRowKind, QuoteRequestData } from '../../lib/quoteRequest/types';
import {
  isTradeQuoteType,
  tradeCatalogItems,
  type TradeCatalogItem,
  type TradeCatalogPrices,
} from '../../lib/quoteRequest/tradeCatalog';
import type { Equipment } from '../../types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  equipment: Equipment[];
  customerSelected: boolean;
  deliveryFeeMap: BrandDeliveryFeeByCategoryMap | null;
  companyName?: string;
  /** Yrityksen tarjousrivien hinnat (Yritystiedot → Huoltohinnasto). */
  catalogPrices?: TradeCatalogPrices;
  /** Asiakkaan oletustuntihinta alv 0. */
  hourlyRate?: number | null;
};

export default function QuoteTyotDocumentView({
  form,
  canEdit,
  onChange,
  equipment,
  customerSelected,
  deliveryFeeMap,
  catalogPrices,
  hourlyRate,
}: Props) {
  const tiles = buildQuoteTyotTiles(form);
  const trade = isTradeQuoteType(form.type) ? form.type : null;
  const catalogFor = (kind: QuoteMaterialRowKind): TradeCatalogItem[] | undefined =>
    trade ? tradeCatalogItems(trade).filter((item) => item.kind === kind) : undefined;
  const catalogProps = (kind: QuoteMaterialRowKind) => ({
    catalogItems: catalogFor(kind),
    catalogPrices,
    hourlyRate,
  });
  // LVI/IV/sähkö: työt riveinä (h, m, kpl, kohde); vanhat tehtävärivit näkyvät vain jos niitä on.
  const showTaskItems =
    !trade
    || form.workItems.some((w) => w.description.trim() || Number(w.hours) > 0 || (w.materials ?? []).length > 0);

  function renderTileContent(tileId: QuoteTyotTileId): ReactNode {
    switch (tileId) {
      case 'tyot':
        return (
          <>
            {!showTaskItems ? null : isRepairQuoteType(form.type) ? (
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
              {...catalogProps('labor')}
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
            {...catalogProps('supply')}
          />
        );
      case 'kulut':
        return (
          <QuoteInstallationSuppliesProductsSection
            form={form}
            canEdit={canEdit}
            onChange={onChange}
            rowKindFilter="expense"
            {...catalogProps('expense')}
          />
        );
      case 'laite':
        return (
          <QuoteInstallationSuppliesProductsSection
            form={form}
            canEdit={canEdit}
            onChange={onChange}
            rowKindFilter="device"
            {...catalogProps('device')}
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
      hint={trade ? 'Lisää tyyppirivit ruuduista. Hinta tulee yrityksen hinnastosta.' : 'Työt, tarvikkeet, kulut ja laitteet — avaa ruudusta.'}
      tiles={tiles}
      renderTileContent={renderTileContent}
    />
  );
}
