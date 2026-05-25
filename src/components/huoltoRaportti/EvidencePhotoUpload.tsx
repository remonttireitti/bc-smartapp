import {
  AddMaintenanceReportImages,
  deleteMaintenanceReportImage,
  MaintenanceReportImageGallery,
  MAX_IMAGES,
  type MaintenanceReportImageSection,
} from '../../lib/maintenanceReportImages';
interface Props {
  reportId: string;
  section: string;
  paths: string[];
  onChange: (paths: string[]) => void;
  userId: string;
}

export function EvidencePhotoUpload({ reportId, section, paths, onChange, userId }: Props) {
  async function removePath(path: string) {
    try {
      await deleteMaintenanceReportImage(path);
      onChange(paths.filter((p) => p !== path));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Kuvan poisto epäonnistui');
    }
  }

  return (
    <div className="huolto-submodule">
      <p className="muted huolto-help">
        Liitä enintään {MAX_IMAGES} kuvaa (max 800 kt / kuva).
      </p>
      <div className="btn-group">
        <AddMaintenanceReportImages
          reportId={reportId}
          section={section as MaintenanceReportImageSection}
          userId={userId}
          paths={paths}
          onChange={onChange}
        />
      </div>
      <MaintenanceReportImageGallery paths={paths} />
      {paths.length > 0 && (
        <ul className="huolto-path-list">
          {paths.map((path) => (
            <li key={path}>
              <span className="muted">{path.split('/').pop()}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void removePath(path)}>
                Poista
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
