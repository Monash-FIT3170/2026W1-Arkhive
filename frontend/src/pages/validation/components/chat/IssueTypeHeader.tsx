import { Info } from 'lucide-react';

import IssueTypeBadge from './IssueTypeBadge';
import { ISSUE_TYPES, type IssueType } from '../../../../models/IssueReview';

interface IssueTypeHeaderProps {
  type: IssueType;
  /** Optional supporting value shown in the badge, e.g. "72%" or "5 cells". */
  detail?: string;
}

/**
 * Badge on the left, info tooltip pinned to the right corner.
 */
export default function IssueTypeHeader({ type, detail }: IssueTypeHeaderProps) {
  const { label, tip } = ISSUE_TYPES[type];

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-2">
      <div className="min-w-0">
        <IssueTypeBadge type={type} detail={detail} />
      </div>

      <span
        className="tooltip tooltip-left shrink-0 before:max-w-56 before:whitespace-normal before:text-left"
        data-tip={tip}
      >
        <button
          type="button"
          className="btn btn-ghost btn-circle btn-sm text-base-content/60 hover:text-base-content"
          aria-label={`${label}: ${tip}`}
        >
          <Info size={18} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
