/** Maximum upward ancestor walk depth for the ancestorsOf query.
 *
 * Enough to walk from a cousin's children back to the eldest forebear in a
 * normal multi-generation family without looping forever if the data ever
 * contains cycles.
 */
export const REACH_MAX = 60;
