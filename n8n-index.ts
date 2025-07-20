import { SimpleXityTrigger } from './nodes/SimpleX/SimpleXityTrigger.node';
import { SimpleXitySendAction } from './nodes/SimpleX/SimpleXitySendAction.node';
import { SimpleXityConfig } from './credentials/SimpleXity.credentials';

export const nodes = [SimpleXityTrigger, SimpleXitySendAction];
export const credentials = [SimpleXityConfig]; 