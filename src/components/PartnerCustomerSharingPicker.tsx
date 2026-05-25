import { useMemo, useState } from 'react';
import Tooltip from './Tooltip';
import ToggleSwitch from './ToggleSwitch';
import type { Customer } from '../types';

type Props = {
  customers: Customer[];
  selectedIds: string[];
  reportLinkedIds?: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

function customerSearchText(customer: Customer): string {
  return [customer.name, customer.city, customer.address].filter(Boolean).join(' ').toLowerCase();
}

export default function PartnerCustomerSharingPicker({
  customers,
  selectedIds,
  reportLinkedIds = [],
  onChange,
  disabled = false,
}: Props) {
  const [search, setSearch] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const reportLinkedSet = useMemo(() => new Set(reportLinkedIds), [reportLinkedIds]);

  const visibleCount = useMemo(() => {
    const visible = new Set([...selectedIds, ...reportLinkedIds]);
    return visible.size;
  }, [reportLinkedIds, selectedIds]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((customer) => {
      const isVisible = selectedSet.has(customer.id) || reportLinkedSet.has(customer.id);
      if (onlySelected && !isVisible) return false;
      if (!q) return true;
      return customerSearchText(customer).includes(q);
    });
  }, [customers, onlySelected, reportLinkedIds, reportLinkedSet, search, selectedSet]);

  function toggleCustomer(customerId: string) {
    if (reportLinkedSet.has(customerId)) return;
    onChange(
      selectedSet.has(customerId)
        ? selectedIds.filter((id) => id !== customerId)
        : [...selectedIds, customerId],
    );
  }

  function selectVisibleManual() {
    const visibleIds = filteredCustomers
      .map((customer) => customer.id)
      .filter((customerId) => !reportLinkedSet.has(customerId));
    onChange([...new Set([...selectedIds, ...visibleIds])]);
  }

  return (
    <div className="partner-customer-picker">
      <div className="partner-customer-picker-summary">
        <Tooltip label="Näkyvät asiakkaat = manuaalisesti jaetut + kumppanin raportoimat. Muut ovat piilossa.">
          <span>
            <strong>{visibleCount}</strong> / {customers.length} näkyy kumppanille
          </span>
        </Tooltip>
        <span className="partner-customer-picker-badge restricted">Oletus: ei jaettu</span>
        {reportLinkedIds.length > 0 && (
          <span className="partner-customer-picker-badge open">{reportLinkedIds.length} raportin kautta</span>
        )}
      </div>

      <div className="partner-customer-picker-toolbar">
        <input
          type="search"
          placeholder="Hae nimellä, kaupungilla tai osoitteella…"
          value={search}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="partner-customer-picker-actions">
          <Tooltip label="Lisää kaikki haetut asiakkaat manuaalisesti jaettuihin (ei poista raportin kautta näkyviä).">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={disabled || filteredCustomers.length === 0}
              onClick={selectVisibleManual}
            >
              Valitse näkyvät
            </button>
          </Tooltip>
          <Tooltip label="Poista kaikki manuaaliset jaot. Raportin kautta näkyvät pysyvät.">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={disabled || selectedIds.length === 0}
              onClick={() => onChange([])}
            >
              Tyhjennä jaot
            </button>
          </Tooltip>
          <Tooltip label="Näytä vain manuaalisesti jaetut tai raportin kautta näkyvät asiakkaat.">
            <label className="compact-option partner-customer-picker-filter">
              <input
                type="checkbox"
                checked={onlySelected}
                disabled={disabled}
                onChange={(e) => setOnlySelected(e.target.checked)}
              />
              Vain näkyvät
            </label>
          </Tooltip>
        </div>
      </div>

      <div className="partner-customer-picker-list" role="listbox" aria-multiselectable="true">
        {filteredCustomers.length === 0 ? (
          <p className="muted partner-customer-picker-empty">
            {customers.length === 0
              ? 'Rekisterissäsi ei ole vielä asiakkaita.'
              : 'Hakuun ei osunut yhtään asiakasta.'}
          </p>
        ) : (
          filteredCustomers.map((customer) => {
            const reportLinked = reportLinkedSet.has(customer.id);
            const manuallyShared = selectedSet.has(customer.id);
            const checked = reportLinked || manuallyShared;
            const subtitle = [customer.city, customer.address].filter(Boolean).join(' • ');
            return (
              <div
                key={customer.id}
                className={checked ? 'partner-customer-picker-row selected' : 'partner-customer-picker-row'}
              >
                <div className="partner-customer-picker-row-body">
                  <span className="partner-customer-picker-name">{customer.name}</span>
                  {subtitle ? <span className="muted partner-customer-picker-meta">{subtitle}</span> : null}
                </div>
                {reportLinked ? (
                  <Tooltip label="Kumppani on laatinut raportin tälle asiakkaalle — näkyy automaattisesti.">
                    <span className="partner-customer-picker-badge open">Raportti</span>
                  </Tooltip>
                ) : (
                  <Tooltip label="Avaa asiakas kumppanille ennen raporttia (esim. raportin luontia varten).">
                    <ToggleSwitch
                      checked={manuallyShared}
                      disabled={disabled}
                      label="Jaettu"
                      onChange={() => toggleCustomer(customer.id)}
                    />
                  </Tooltip>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
