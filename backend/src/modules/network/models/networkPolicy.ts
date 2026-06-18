export interface SemanticRule {
  sourceNodeId: string;
  targetNodeId: string;
  protocol: 'tcp' | 'udp' | 'icmp' | 'all';
  port: string; // 'ALL' or numeric e.g. '5432'
  action: 'ALLOW' | 'DENY';
  direction: 'inbound' | 'outbound';
  ownerNodeId: string;
}

export interface NetworkPolicy {
  projectId: string;
  rules: SemanticRule[];
}
