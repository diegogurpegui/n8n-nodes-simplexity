import { SimpleXityTrigger } from './nodes/Simplexity/SimplexityTrigger.node';
import { Simplexity } from './nodes/Simplexity/Simplexity.node';
import { SimplexityApi } from './credentials/SimplexityApi.credentials';

export const nodes = [SimpleXityTrigger, Simplexity];
export const credentials = [SimplexityApi];
