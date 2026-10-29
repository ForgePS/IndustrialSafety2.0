/**
 * Decide whether a form submission belongs on a personnel profile.
 *
 * Only the subject of the form should connect — not supervisors, witnesses,
 * signatories, or "submitted by" names that happen to appear in answers.
 */

const SUBJECT_PERSONNEL_ID_KEYS = [
  "personnelId",
  "personnel_id",
  "employeeId",
  "employee_id",
  "workerId",
  "worker_id",
] as const;

const SUBJECT_EMPLOYEE_NUMBER_KEYS = [
  "employeeNumber",
  "employee_number",
  "empNumber",
  "emp_number",
  "employeeNo",
  "employee_no",
] as const;

const SUBJECT_NAME_KEYS = [
  "employeeName",
  "employee_name",
  "workerName",
  "worker_name",
  "personnelName",
  "personnel_name",
  "associateName",
  "associate_name",
  "employeeFullName",
  "fullName",
  "full_name",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** Bags that may hold subject identity (not the full JSON dump). */
export function collectFormSubjectBags(submission: {
  answers?: unknown;
  sourcePayload?: unknown;
}): Record<string, unknown>[] {
  const bags: Record<string, unknown>[] = [];
  const answers = asRecord(submission.answers);
  if (answers) bags.push(answers);

  const payload = asRecord(submission.sourcePayload);
  if (!payload) return bags;

  bags.push(payload);
  for (const nestedKey of ["answers", "responses", "fields", "data"] as const) {
    const nested = asRecord(payload[nestedKey]);
    if (nested) bags.push(nested);
  }
  return bags;
}

function readFirst(bags: Record<string, unknown>[], keys: readonly string[]): string {
  for (const bag of bags) {
    for (const key of keys) {
      const value = text(bag[key]);
      if (value) return value;
    }
  }
  return "";
}

export type FormSubjectPerson = {
  id: string;
  employeeNumber?: string | null;
  displayName?: string | null;
};

/**
 * True only when this submission is the person's form (explicit subject id,
 * or subject employee # / name fields). Signatures and other roles never count.
 */
export function formSubmissionBelongsToPerson(
  submission: { answers?: unknown; sourcePayload?: unknown },
  person: FormSubjectPerson,
): boolean {
  const personId = text(person.id);
  if (!personId) return false;

  const bags = collectFormSubjectBags(submission);
  const subjectId = readFirst(bags, SUBJECT_PERSONNEL_ID_KEYS);
  if (subjectId === personId) return true;

  const employeeNumber = text(person.employeeNumber);
  if (employeeNumber) {
    const subjectNumber = readFirst(bags, SUBJECT_EMPLOYEE_NUMBER_KEYS);
    if (subjectNumber !== "" && subjectNumber.toLowerCase() === employeeNumber.toLowerCase()) {
      return true;
    }
  }

  const displayName = text(person.displayName);
  if (displayName.length >= 3) {
    const subjectName = readFirst(bags, SUBJECT_NAME_KEYS);
    if (subjectName !== "" && subjectName.toLowerCase() === displayName.toLowerCase()) {
      return true;
    }
  }

  return false;
}
