import { AlgorithmCatalog } from './algorithm';
import { cadenceAlgorithm } from './algorithms/cadence';
import { halfLifeAlgorithm } from './algorithms/half-life';

/** The algorithms this build ships. Adding one is adding it here. */
export const builtInCatalog = new AlgorithmCatalog([halfLifeAlgorithm, cadenceAlgorithm], halfLifeAlgorithm.id);
