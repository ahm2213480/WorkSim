import { marketFlow } from './marketflow.js';
import { novaShop } from './novashop.js';
import type { SimulationSeed } from './types.js';

/** The whole simulation catalog lives in code, not in the database seed alone.
 *
 *  Why: simulations are curriculum. They must be reviewable in pull requests,
 *  versioned with the app, and identical in every environment (local, test,
 *  demo). The database stores the same content because the product reads it
 *  relationally (attempts, submissions and evidence all reference these rows),
 *  and `npm run db:seed` is the single sync point between code and database.
 *
 *  Trade-off accepted: authoring a new simulation requires a code change plus a
 *  seed run. That is correct for an assessment (reviewable, no CMS to maintain)
 *  and the Admin catalog screen still allows editing/activating what is here. */
export const ALL_SIMULATIONS: SimulationSeed[] = [novaShop, marketFlow];

export * from './types.js';
