import { authContract } from './auth.js';
import { healthContract } from './health.js';
import { masterDataContract } from './master-data.js';

export * from './auth.js';
export * from './errors.js';
export * from './health.js';
export * from './master-data.js';
export * from './permissions.js';

/**
 * The single source of truth for the HTTP API.
 * - apps/api implements it (see `@Implement(...)` in the Nest controllers)
 * - apps/web calls it through a fully typed client (see `src/lib/orpc.ts`)
 *
 * Add new feature contracts here, e.g. `customers: customersContract`.
 */
export const contract = {
  auth: authContract,
  health: healthContract,
  masterData: masterDataContract,
};

export type Contract = typeof contract;
