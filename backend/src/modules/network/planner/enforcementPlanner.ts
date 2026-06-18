import { SemanticRule } from '../models/networkPolicy';

export type NetworkIntentType = 
  | 'ALLOW_CONNECTION' 
  | 'DENY_CONNECTION' 
  | 'ALLOW_NODE_ACCESS' 
  | 'ALLOW_SUBNET_ACCESS' 
  | 'DENY_ALL';

export interface NetworkIntent {
  type: NetworkIntentType;
  sourceNodeId?: string;
  targetNodeId?: string;
  protocol?: 'tcp' | 'udp' | 'icmp' | 'all';
  port?: string;
  direction?: 'inbound' | 'outbound';
  ownerNodeId?: string;
}

export class EnforcementPlanner {
  public static plan(_projectId: string, rules: SemanticRule[]): NetworkIntent[] {
    const intents: NetworkIntent[] = [];
    
    for (const rule of rules) {
      if (rule.action === 'ALLOW') {
        intents.push({
          type: 'ALLOW_CONNECTION',
          sourceNodeId: rule.sourceNodeId,
          targetNodeId: rule.targetNodeId,
          protocol: rule.protocol,
          port: rule.port,
          direction: rule.direction,
          ownerNodeId: rule.ownerNodeId
        });
      } else {
        intents.push({
          type: 'DENY_CONNECTION',
          sourceNodeId: rule.sourceNodeId,
          targetNodeId: rule.targetNodeId,
          protocol: rule.protocol,
          port: rule.port,
          direction: rule.direction,
          ownerNodeId: rule.ownerNodeId
        });
      }
    }

    // Deny all other un-allowed inbound connections to enforce strict zero-trust subnets
    intents.push({
      type: 'DENY_ALL'
    });

    return intents;
  }
}
