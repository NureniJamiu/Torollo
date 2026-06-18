export interface SemanticRule {
  sourceNodeId: string;
  targetNodeId: string;
  protocol: 'tcp' | 'udp' | 'icmp' | 'all';
  port: string; // 'ALL' or numeric e.g. '5432'
  action: 'ALLOW' | 'DENY';
}

export interface NetworkPolicy {
  projectId: string;
  rules: SemanticRule[];
}
