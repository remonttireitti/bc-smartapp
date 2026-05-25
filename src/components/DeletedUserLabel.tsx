import Tooltip from './Tooltip';

type Props = {
  name: string;
  deleted?: boolean;
  className?: string;
};

export default function DeletedUserLabel({ name, deleted, className }: Props) {
  if (!deleted || name === '—') {
    return <span className={className}>{name}</span>;
  }

  return (
    <Tooltip label="Poistettu käyttäjä">
      <span className={className ? `deleted-user-label ${className}` : 'deleted-user-label'}>
        {name}
        <span className="deleted-user-marker" aria-hidden="true">
          *
        </span>
      </span>
    </Tooltip>
  );
}
