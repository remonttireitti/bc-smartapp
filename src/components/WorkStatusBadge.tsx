import Tooltip from './Tooltip';
import {
  IconBilled,
  IconCompleted,
  IconDelegated,
  IconDraft,
  IconInProgress,
  IconScheduled,
} from './icons';
import { WORK_STATUS_LABELS, normalizeWorkflowStatus, type WorkStatus } from '../types';

const WORK_STATUS_HINTS: Record<WorkStatus, string> = {
  draft: 'Raportti on luonnos — ei vielä työn alla.',
  delegated: 'Odottaa toimeksisaajan vastaanottoa — ota työ vastaan aloittaaksesi.',
  scheduled: 'Työ on aikataulutettu mutta ei vielä alkanut.',
  in_progress: 'Työ on käynnissä.',
  completed: 'Työ on valmis mutta ei vielä laskutettu.',
  billed_partner: 'Kumppanilaskutus tehty.',
  billed_customer: 'Asiakaslaskutus tehty.',
};

function StatusIcon({ status }: { status: WorkStatus }) {
  switch (status) {
    case 'draft':
      return <IconDraft className="ui-icon status-badge-icon" />;
    case 'delegated':
      return <IconDelegated className="ui-icon status-badge-icon" />;
    case 'scheduled':
      return <IconScheduled className="ui-icon status-badge-icon" />;
    case 'in_progress':
      return <IconInProgress className="ui-icon status-badge-icon" />;
    case 'completed':
      return <IconCompleted className="ui-icon status-badge-icon" />;
    case 'billed_partner':
    case 'billed_customer':
      return <IconBilled className="ui-icon status-badge-icon" />;
    default:
      return null;
  }
}

type Props = {
  status: WorkStatus;
};

export default function WorkStatusBadge({ status }: Props) {
  const normalizedStatus = normalizeWorkflowStatus(status);
  const label = WORK_STATUS_LABELS[normalizedStatus];
  const hint = WORK_STATUS_HINTS[normalizedStatus];

  return (
    <Tooltip label={hint}>
      <span className={`status-badge status-badge-${normalizedStatus}`}>
        <StatusIcon status={normalizedStatus} />
        {label}
      </span>
    </Tooltip>
  );
}
