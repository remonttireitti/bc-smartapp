import type { RefrigerantLineDraft } from '../../lib/refrigerantInventory';
import {
  cylindersForSource,
  formatCylinderPickerLabel,
  resolveRefrigerantBilling,
} from '../../lib/refrigerantInventory';
import { refrigerantTypes } from '../../lib/huoltoRaportti/constants';
import {
  REFRIGERANT_CYLINDER_DISPOSITION_LABELS,
  REFRIGERANT_SOURCE_LABELS,
  type RefrigerantCylinder,
  type RefrigerantCylinderDisposition,
  type RefrigerantSource,
  type RefrigerantSupplierPaidBy,
} from '../../types/inventory';

type CompanyUser = { id: string; display_name: string | null; email: string | null; company_id?: string };

type Props = {
  drafts: RefrigerantLineDraft[];
  setDrafts: (next: RefrigerantLineDraft[]) => void;
  cylinders: RefrigerantCylinder[];
  companyUsers: CompanyUser[];
  ownCompanyId: string | null;
  hasPartnerCompanies: boolean;
  showCustomerBillingFields?: boolean;
};

function emptyRow(): RefrigerantLineDraft {
  return {
    key: crypto.randomUUID(),
    source: 'warehouse',
    cylinder_id: '',
    warehouse_company_id: '',
    owner_user_id: '',
    supplier_name: '',
    supplier_paid_by: '',
    unit_price: '',
    customer_unit_price: '',
    refrigerant_type: 'R-410A',
    qty_kg: '',
    notes: '',
    cylinder_disposition: 'partial_in_stock',
  };
}

export default function DailyLogRefrigerantFields({
  drafts,
  setDrafts,
  cylinders,
  companyUsers,
  ownCompanyId,
  hasPartnerCompanies,
  showCustomerBillingFields = false,
}: Props) {
  function updateRow(index: number, patch: Partial<RefrigerantLineDraft>) {
    setDrafts(drafts.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function onSourceChange(index: number, source: RefrigerantSource) {
    updateRow(index, {
      source,
      cylinder_id: '',
      warehouse_company_id: '',
      supplier_name: '',
      supplier_paid_by: '',
      cylinder_disposition: 'partial_in_stock',
    });
  }

  function onCylinderPick(index: number, cylinderId: string) {
    const cylinder = cylinders.find((c) => c.id === cylinderId);
    updateRow(index, {
      cylinder_id: cylinderId,
      warehouse_company_id: cylinder?.company_id ?? '',
      refrigerant_type: cylinder?.refrigerant_type ?? drafts[index].refrigerant_type,
      owner_user_id: cylinder?.owner_user_id ?? '',
    });
  }

  function usersForRow(row: RefrigerantLineDraft) {
    if (row.source === 'partner_warehouse' && row.warehouse_company_id) {
      return companyUsers.filter((u) => u.company_id === row.warehouse_company_id);
    }
    if (row.source === 'warehouse' && ownCompanyId) {
      return companyUsers.filter((u) => !u.company_id || u.company_id === ownCompanyId);
    }
    return companyUsers;
  }

  const sourceOptions = (Object.entries(REFRIGERANT_SOURCE_LABELS) as [RefrigerantSource, string][]).filter(
    ([value]) => value !== 'partner_warehouse' || hasPartnerCompanies,
  );

  return (
    <div className="expense-section">
      <div className="section-head">
        <h3>Kylmäaine</h3>
        <button type="button" className="btn btn-secondary" onClick={() => setDrafts([...drafts, emptyRow()])}>
          + Lisää kylmäaine
        </button>
      </div>
      {drafts.length === 0 ? (
        <p className="muted">
          Merkitse myyty kylmäaine varastopullosta tai tukkurilta. Valitse mitä pullolle tapahtuu käytön jälkeen.
        </p>
      ) : (
        drafts.map((row, index) => {
          const rowCylinders = cylindersForSource(cylinders, row.source, ownCompanyId);
          const rowUsers = usersForRow(row);
          const billing = resolveRefrigerantBilling({
            source: row.source,
            supplier_paid_by: row.supplier_paid_by,
          });

          return (
            <div key={row.key} className="expense-row refrigerant-row">
              <label>
                Lähde
                <select value={row.source} onChange={(e) => onSourceChange(index, e.target.value as RefrigerantSource)}>
                  {sourceOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {row.source === 'warehouse' || row.source === 'partner_warehouse' ? (
                <>
                  <label>
                    Varastopullo
                    <select
                      value={row.cylinder_id}
                      onChange={(e) => onCylinderPick(index, e.target.value)}
                      required
                    >
                      <option value="">Valitse pullo…</option>
                      {rowCylinders.map((c) => (
                        <option key={c.id} value={c.id}>
                          {row.source === 'partner_warehouse' && c.company_name ? `${c.company_name} · ` : ''}
                          {formatCylinderPickerLabel(c)}
                          {c.owner_user?.display_name ? ` · ${c.owner_user.display_name}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Pullo työkäytön jälkeen
                    <select
                      value={row.cylinder_disposition}
                      onChange={(e) =>
                        updateRow(index, {
                          cylinder_disposition: e.target.value as RefrigerantCylinderDisposition,
                        })
                      }
                      required
                    >
                      {(
                        Object.entries(REFRIGERANT_CYLINDER_DISPOSITION_LABELS) as [
                          RefrigerantCylinderDisposition,
                          string,
                        ][]
                      ).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Varasto (henkilö)
                    <select
                      value={row.owner_user_id}
                      onChange={(e) => updateRow(index, { owner_user_id: e.target.value })}
                    >
                      <option value="">Yhteinen / pullo</option>
                      {rowUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.display_name ?? u.email ?? u.id}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Kylmäaine
                    <select
                      value={row.refrigerant_type}
                      onChange={(e) => updateRow(index, { refrigerant_type: e.target.value })}
                    >
                      {refrigerantTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tukkuri / toimittaja
                    <input
                      value={row.supplier_name}
                      onChange={(e) => updateRow(index, { supplier_name: e.target.value })}
                      placeholder="Esim. tukkuri"
                    />
                  </label>
                  <label>
                    Kenen piikki hankinta?
                    <select
                      value={row.supplier_paid_by}
                      onChange={(e) =>
                        updateRow(index, { supplier_paid_by: e.target.value as RefrigerantSupplierPaidBy | '' })
                      }
                      required
                    >
                      <option value="">Valitse…</option>
                      <option value="own">Oman piikki · laskutetaan asiakkaalta</option>
                      <option value="partner">Kumppanin piikki · kumppani laskuttaa asiakkaalta</option>
                    </select>
                  </label>
                </>
              )}

              <label>
                Määrä (kg)
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={row.qty_kg}
                  onChange={(e) => updateRow(index, { qty_kg: e.target.value })}
                  required
                />
              </label>

              {billing.billToCustomer && showCustomerBillingFields && (
                <>
                  <label>
                    Ostohinta (€/kg)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.unit_price}
                      onChange={(e) => updateRow(index, { unit_price: e.target.value })}
                    />
                  </label>
                  <label>
                    Asiakashinta (€/kg)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.customer_unit_price}
                      onChange={(e) => updateRow(index, { customer_unit_price: e.target.value })}
                      placeholder="Tyhjä = ostohinta"
                    />
                  </label>
                  <p className="muted refrigerant-billing-note">Lisätään asiakkaalle laskutettavaan summaan.</p>
                </>
              )}

              {billing.reminder && (
                <p className="refrigerant-billing-reminder">{billing.reminder}</p>
              )}

              <label>
                Huomio
                <input
                  value={row.notes}
                  onChange={(e) => updateRow(index, { notes: e.target.value })}
                  placeholder="Valinnainen"
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setDrafts(drafts.filter((_, i) => i !== index))}
              >
                Poista
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
