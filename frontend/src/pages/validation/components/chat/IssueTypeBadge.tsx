import { ISSUE_TYPES, type IssueType } from '../../../../models/IssueReview';

interface IssueTypeBadgeProps {
  type: IssueType;
  /** Optional supporting value, e.g. "72%" or "5 cells". */
  detail?: string;
}

/**
 * Badge for each issue type on Arkhive
 */
export default function IssueTypeBadge({ type, detail }: IssueTypeBadgeProps) {
  const { label, Icon, borderClass, iconClass } = ISSUE_TYPES[type];

  return (
    <span
      title={detail ? `${label}, ${detail}` : label}
      className={`badge badge-lg h-auto min-w-0 max-w-full gap-2 whitespace-nowrap border-2 bg-base-100 py-1 font-medium text-base-content ${borderClass}`}
    >
      <Icon size={16} aria-hidden="true" className={`shrink-0 ${iconClass}`} />
      <span className="min-w-0 truncate">{label}</span>
      {detail && (
        <>
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-base-content opacity-20" />
          <span className="shrink-0 font-normal tabular-nums text-base-content/70">{detail}</span>
        </>
      )}
    </span>
  );
}
