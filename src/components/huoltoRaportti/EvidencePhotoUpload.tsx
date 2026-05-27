import {
  AddMaintenanceReportImages,
  deleteMaintenanceReportImage,
  MaintenanceReportImageThumb,
  MAX_IMAGES,
  type MaintenanceReportImageSection,
  type MaintenanceReportPhotoItem,
} from '../../lib/maintenanceReportImages';

interface Props {
  reportId: string;
  section: string;
  items: MaintenanceReportPhotoItem[];
  onChange: (items: MaintenanceReportPhotoItem[]) => void;
  userId: string;
}

export function EvidencePhotoUpload({ reportId, section, items, onChange, userId }: Props) {
  async function removeItem(storagePath: string) {
    try {
      await deleteMaintenanceReportImage(storagePath);
      onChange(items.filter((i) => i.storagePath !== storagePath));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Kuvan poisto epäonnistui');
    }
  }

  function updateComment(storagePath: string, comment: string) {
    onChange(items.map((i) => (i.storagePath === storagePath ? { ...i, comment } : i)));
  }

  return (
    <div className="huolto-submodule">
      <p className="muted huolto-help">
        Liitä enintään {MAX_IMAGES} kuvaa. Suuret kamerakuvat tiivistetään automaattisesti ennen tallennusta.
      </p>
      <div className="btn-group">
        <AddMaintenanceReportImages
          reportId={reportId}
          section={section as MaintenanceReportImageSection}
          userId={userId}
          items={items}
          onChange={onChange}
        />
      </div>
      {items.length > 0 && (
        <ul className="huolto-evidence-photo-list">
          {items.map((item) => (
            <li key={item.storagePath} className="huolto-evidence-photo-row">
              <MaintenanceReportImageThumb path={item.storagePath} />
              <label className="huolto-evidence-photo-comment">
                Kommentti
                <input
                  type="text"
                  value={item.comment}
                  onChange={(e) => updateComment(item.storagePath, e.target.value)}
                  placeholder="Kuvaile kuvaa…"
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void removeItem(item.storagePath)}
              >
                Poista
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
