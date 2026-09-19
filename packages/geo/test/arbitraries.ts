import fc from 'fast-check';

export const lat = fc.double({ min: -85, max: 85, noNaN: true });
export const lon = fc.double({ min: -180, max: 179.999, noNaN: true });
export const bearing = fc.double({ min: 0, max: 359.999, noNaN: true });
export const anyAngle = fc.double({ min: -10_000, max: 10_000, noNaN: true });
