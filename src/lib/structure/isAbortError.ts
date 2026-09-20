/** Whether an error is a cancelled build (see structureBuildClient.ts) — callers treat that as
 *  "superseded by a newer request", not as a failure to show the user. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
