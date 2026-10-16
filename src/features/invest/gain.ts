/** The colour and the arrow of a gain or a loss; zero counts as a gain. */
export const tone = (n: number) => (n < 0 ? 'text-danger' : 'text-success');
export const arrow = (n: number) => (n < 0 ? '▼' : '▲');
