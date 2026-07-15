import type { V2DrugResult, V2QualificationResult } from './types';

// Eligibility gating helpers.
//
// The survey engine owns the qualification verdict (per-drug `qualified`
// flags). These pure helpers let a consumer act on that verdict — most
// importantly, decide which drugs may be submitted to a prescription request.
// A drug the survey marked ineligible must never be forwarded to a prescriber,
// so the request-creation step filters the cart through `qualifiedDrugIds`.
//
// Ids are returned in the verdict's own id space — i.e. the drug ids the
// survey was composed/evaluated against (the Apex drug ids). Match them
// against whatever the consumer stored that id on (e.g. a cart item's
// `apexDrugId`), not against a display name.

type DrugResultsHolder = Pick<V2QualificationResult, 'drugResults'> | null | undefined;

/** Drug ids the verdict marked eligible. */
export function qualifiedDrugIds(result: DrugResultsHolder): string[] {
  if (!result?.drugResults) return [];
  return result.drugResults.filter((d) => d.qualified).map((d) => d.drugId);
}

/** Drug ids the verdict marked NOT eligible. */
export function disqualifiedDrugIds(result: DrugResultsHolder): string[] {
  if (!result?.drugResults) return [];
  return result.drugResults.filter((d) => !d.qualified).map((d) => d.drugId);
}

/**
 * Human-readable disqualification reason for a drug result, tolerant of the
 * wire shape: the backend sends `disqualificationReasons` (an array, sometimes
 * containing empty strings) while the type historically declared
 * `disqualificationReason` (singular). Falls back to a generic message so the
 * UI never renders an empty reason.
 */
export function disqualificationReasonText(d: V2DrugResult): string {
  const fromArray = (d.disqualificationReasons ?? []).find(
    (r) => typeof r === 'string' && r.trim().length > 0,
  );
  if (fromArray) return fromArray;
  if (d.disqualificationReason && d.disqualificationReason.trim().length > 0) {
    return d.disqualificationReason;
  }
  return 'Not eligible based on your answers';
}
