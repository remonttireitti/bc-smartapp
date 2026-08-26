import type { ReactNode } from 'react';
import CustomerRegistryPicker, { type NewCustomerDraft } from '../CustomerRegistryPicker';
import EquipmentRegistryPicker, { type NewEquipmentDraft } from '../EquipmentRegistryPicker';
import SubscriberPicker from '../SubscriberPicker';
import SubscriberPortalVisibilityField from '../SubscriberPortalVisibilityField';
import QuoteDocumentSectionView from './QuoteDocumentSectionView';
import { BUILDING_TYPE_OPTIONS, QUOTE_REGION_LABELS } from '../../lib/quoteRequest/constants';
import {
  buildQuoteAsiakasTiles,
  type QuoteAsiakasTileId,
} from '../../lib/quoteRequest/quoteAsiakasEntries';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';
import { reportHasSubscriberLink, type SubscriberPortalVisibility } from '../../lib/subscriberPortalVisibility';
import type { Customer, Subscriber } from '../../types';

type BrandOption = { value: QuoteRequestData['brandMode']; label: string };

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  busy: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  customerId: string;
  customerName?: string;
  customersForPicker: Customer[];
  myCompanyId?: string;
  equipmentId: string;
  equipmentLabel?: string;
  equipment: import('../../types').Equipment[];
  subscriberId: string;
  subscribersForOwner: Subscriber[];
  subscriberPortalVisibility: SubscriberPortalVisibility;
  onSubscriberPortalVisibilityChange: (value: SubscriberPortalVisibility) => void;
  selectedCustomer?: Customer;
  reportOwnerCompanyId: string;
  reportOwnerName: string;
  reportOwnerTargets: Array<{ companyId: string; label: string }>;
  ownerCompanyId: string;
  brandOptions: BrandOption[];
  onCustomerSelect: (customerId: string) => void;
  onCustomerClear: () => void;
  onCreateCustomer: (draft: NewCustomerDraft) => Promise<void>;
  onEquipmentSelect: (equipmentId: string) => void;
  onEquipmentClear: () => void;
  onCreateEquipment: (draft: NewEquipmentDraft) => Promise<void>;
  onSubscriberChange: (subscriberId: string) => void;
  onReportOwnerChange: (companyId: string) => void;
};

export default function QuoteAsiakasDocumentView({
  form,
  canEdit,
  busy,
  onChange,
  customerId,
  customerName,
  customersForPicker,
  myCompanyId,
  equipmentId,
  equipmentLabel,
  equipment,
  subscriberId,
  subscribersForOwner,
  subscriberPortalVisibility,
  onSubscriberPortalVisibilityChange,
  selectedCustomer,
  reportOwnerCompanyId,
  reportOwnerName,
  reportOwnerTargets,
  ownerCompanyId,
  brandOptions,
  onCustomerSelect,
  onCustomerClear,
  onCreateCustomer,
  onEquipmentSelect,
  onEquipmentClear,
  onCreateEquipment,
  onSubscriberChange,
  onReportOwnerChange,
}: Props) {
  const showSubscriber = Boolean(ownerCompanyId);
  const showOwnerPicker = !customerId && reportOwnerTargets.length > 1;
  const showEquipment = form.type !== 'ilma-ilma';

  const tiles = buildQuoteAsiakasTiles({
    form,
    customerId,
    customerName,
    equipmentId,
    equipmentLabel,
    reportOwnerName,
    showSubscriber,
    showOwnerPicker,
    showEquipment,
  });

  function renderTileContent(tileId: QuoteAsiakasTileId): ReactNode {
    switch (tileId) {
      case 'tilaaja':
        return (
          <>
            <SubscriberPicker
              subscribers={subscribersForOwner}
              subscriberId={subscriberId}
              disabled={!canEdit || busy}
              onChange={onSubscriberChange}
            />
            {reportHasSubscriberLink({
              subscriber_id: subscriberId,
              customer_subscriber_id: selectedCustomer?.subscriber_id,
            }) ? (
              <SubscriberPortalVisibilityField
                value={subscriberPortalVisibility}
                reportKind="quote"
                disabled={!canEdit || busy}
                onChange={onSubscriberPortalVisibilityChange}
              />
            ) : null}
          </>
        );
      case 'omistaja':
        return (
          <label>
            Tarjous laaditaan nimissä
            <select
              value={reportOwnerCompanyId}
              onChange={(event) => onReportOwnerChange(event.target.value)}
              disabled={!canEdit || busy}
            >
              {reportOwnerTargets.map((target) => (
                <option key={target.companyId} value={target.companyId}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
        );
      case 'asiakas':
        return (
          <>
            {!customerId && form.legacyCustomerName?.trim() && (
              <p className="muted quote-legacy-customer-note">
                Tuodussa tiedossa asiakas: <strong>{form.legacyCustomerName.trim()}</strong>. Valitse tai luo
                vastaava asiakas rekisteristä.
              </p>
            )}
            {!showOwnerPicker ? (
              <p className="muted">
                Tarjous laaditaan nimissä: <strong>{reportOwnerName}</strong>
              </p>
            ) : null}
            <CustomerRegistryPicker
              customers={customersForPicker}
              customerId={customerId}
              myCompanyId={myCompanyId}
              disabled={!canEdit}
              createRegistryName={reportOwnerName}
              brandingName={reportOwnerName}
              busy={busy}
              onSelect={onCustomerSelect}
              onClear={onCustomerClear}
              onCreate={onCreateCustomer}
            />
          </>
        );
      case 'laite':
        return (
          <EquipmentRegistryPicker
            equipment={equipment}
            equipmentId={equipmentId}
            disabled={!canEdit}
            busy={busy}
            onSelect={onEquipmentSelect}
            onClear={onEquipmentClear}
            onCreate={onCreateEquipment}
          />
        );
      case 'yhteystiedot':
        return (
          <div className="quote-field-grid">
            <label>
              Puhelin
              <input
                value={form.customerPhone}
                onChange={(e) => onChange({ customerPhone: e.target.value })}
                disabled={!canEdit}
              />
            </label>
            <label>
              Sähköposti
              <input
                type="email"
                value={form.customerEmail}
                onChange={(e) => onChange({ customerEmail: e.target.value })}
                disabled={!canEdit}
              />
            </label>
            <label>
              Yhteyshenkilö
              <input
                value={form.customerContactPerson}
                onChange={(e) => onChange({ customerContactPerson: e.target.value })}
                disabled={!canEdit}
              />
            </label>
          </div>
        );
      case 'iilp-kohde':
        return (
          <div className="quote-field-grid">
            <label data-quote-field="buildingType">
              Kiinteistön tyyppi
              <select
                value={form.buildingType}
                onChange={(e) => onChange({ buildingType: e.target.value })}
                disabled={!canEdit}
              >
                {BUILDING_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label data-quote-field="region">
              Sijainti
              <select
                value={form.region}
                onChange={(e) => onChange({ region: e.target.value as QuoteRequestData['region'] })}
                disabled={!canEdit}
              >
                {(Object.keys(QUOTE_REGION_LABELS) as QuoteRequestData['region'][]).map((key) => (
                  <option key={key} value={key}>
                    {QUOTE_REGION_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        );
      case 'brandi':
        return (
          <label>
            Brändi tulosteessa
            <select
              value={form.brandMode}
              onChange={(e) => onChange({ brandMode: e.target.value as QuoteRequestData['brandMode'] })}
              disabled={!canEdit}
            >
              {brandOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        );
      default:
        return null;
    }
  }

  return (
    <QuoteDocumentSectionView
      sectionTitle="Asiakas"
      hint="Avaa osio ruudusta. Asiakas ja yhteystiedot ensin, sitten laite ja brändi."
      tiles={tiles}
      renderTileContent={renderTileContent}
    />
  );
}
