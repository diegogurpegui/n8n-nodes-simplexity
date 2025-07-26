import { SimpleXityTrigger } from './nodes/SimpleXity/SimplexityTrigger.node';
import { Simplexity } from './nodes/SimpleXity/Simplexity.node';
import { SimplexityApi } from './credentials/SimplexityApi.credentials';

export const nodes = [SimpleXityTrigger, Simplexity];
export const credentials = [SimplexityApi];
