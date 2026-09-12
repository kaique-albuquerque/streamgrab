/**
 * DownloadQueue — ordering helpers.
 *
 * Maintains a separate `_order` array that tracks job insertion order,
 * independent of the engine's internal Map. This allows reordering
 * without touching the engine.
 */

/**
 * Populates `_order` from the engine queue if it is still empty.
 * Called lazily on first access.
 */
export function seedOrder(_order, engine) {
  if (_order.length === 0) {
    for (const job of engine.getQueue()) _order.push(job.id);
  }
}

/**
 * Returns jobs in queue order. Jobs that exist in the engine but not
 * in `_order` (e.g. imported via restore) are appended at the end.
 */
export function orderedJobs(_order, engine) {
  seedOrder(_order, engine);
  const byId = new Map(engine.getQueue().map((j) => [j.id, j]));
  const out = [];
  for (const id of _order) {
    if (byId.has(id)) out.push(byId.get(id));
  }
  for (const [id, job] of byId) {
    if (!_order.includes(id)) out.push(job);
  }
  return out;
}
