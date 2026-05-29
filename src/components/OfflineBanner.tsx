import { useNetworkStatus } from '../hooks/useNetworkStatus';

export default function OfflineBanner() {
  const online = useNetworkStatus();
  if (online) return null;

  return (
    <div className="offline-banner" role="status">
      <strong>Ei verkkoyhteyttä.</strong> Sovellus on välimuistissa — voit avata sivuja ja jatkaa työraportin
      luonnosta. Tiedot synkronoidaan kun yhteys palaa.
    </div>
  );
}
