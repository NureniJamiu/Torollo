import { NetworkProvider } from './networkProvider';
import { VirtualEndpoint } from '../mapper/virtualNetworkMapper';
import { NetworkIntent } from '../planner/enforcementPlanner';
import docker from '../../../infrastructure/docker/DockerClient';

export class DockerNetworkProvider implements NetworkProvider {
  private async runExec(containerId: string, cmd: string[]): Promise<string> {
    try {
      const container = docker.getContainer(containerId);
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        User: 'root'
      });
      const stream = await exec.start({});
      return new Promise<string>((resolve, reject) => {
        let output = '';
        container.modem.demuxStream(
          stream,
          {
            write: (chunk: Buffer) => { output += chunk.toString(); }
          },
          {
            write: (chunk: Buffer) => { output += chunk.toString(); }
          }
        );
        stream.on('end', () => resolve(output.trim()));
        stream.on('error', (err) => reject(err));
      });
    } catch (err) {
      console.error(`Exec failed for cmd [${cmd.join(' ')}]:`, err);
      return '';
    }
  }

  public async applyPlan(projectId: string, endpoints: VirtualEndpoint[], intents: NetworkIntent[]): Promise<void> {
    console.log(`[DockerNetworkProvider] Applying network plan for project: ${projectId}`);
    
    const dockerContainers = await docker.listContainers({ all: true });
    const ipMap: Record<string, string> = {};
    const idMap: Record<string, string> = {};

    for (const ep of endpoints) {
      const containerInfo = dockerContainers.find(c => 
        c.Names.some(name => name.replace(/^\//, '') === ep.containerName)
      );
      if (containerInfo && containerInfo.State === 'running') {
        const netSettings = containerInfo.NetworkSettings?.Networks?.['akal-lab-network'];
        if (netSettings && netSettings.IPAddress) {
          ipMap[ep.nodeId] = netSettings.IPAddress;
          idMap[ep.nodeId] = containerInfo.Id;
        }
      }
    }

    // Configure firewall for each active container
    for (const ep of endpoints) {
      const containerId = idMap[ep.nodeId];
      if (!containerId) continue;

      // 1. Initialize custom chains and flush rules
      await this.runExec(containerId, ['sh', '-c', 'iptables -N AKAL-INPUT 2>/dev/null || true']);
      await this.runExec(containerId, ['sh', '-c', 'iptables -N AKAL-OUTPUT 2>/dev/null || true']);
      await this.runExec(containerId, ['sh', '-c', 'iptables -C INPUT -j AKAL-INPUT 2>/dev/null || iptables -A INPUT -j AKAL-INPUT']);
      await this.runExec(containerId, ['sh', '-c', 'iptables -C OUTPUT -j AKAL-OUTPUT 2>/dev/null || iptables -A OUTPUT -j AKAL-OUTPUT']);
      await this.runExec(containerId, ['iptables', '-F', 'AKAL-INPUT']);
      await this.runExec(containerId, ['iptables', '-F', 'AKAL-OUTPUT']);

      // 2. Allow established loopback and related connections (essential for container health & pings)
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-i', 'lo', '-j', 'ACCEPT']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-o', 'lo', '-j', 'ACCEPT']);
      
      // Stateful rule tracking
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT']);

      // 3. Process intents affecting this node
      for (const intent of intents) {
        if (intent.type === 'ALLOW_CONNECTION') {
          const proto = intent.protocol === 'all' ? 'tcp' : intent.protocol || 'tcp';
          const port = intent.port || 'ALL';

          if (intent.targetNodeId === ep.nodeId) {
            // This node is receiving traffic: Allow Inbound
            const sourceIp = ipMap[intent.sourceNodeId || ''];
            if (sourceIp) {
              if (proto === 'icmp') {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sourceIp, '-p', 'icmp', '-j', 'ACCEPT']);
              } else if (port === 'ALL') {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sourceIp, '-p', proto, '-j', 'ACCEPT']);
              } else {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sourceIp, '-p', proto, '--dport', port, '-j', 'ACCEPT']);
              }
            }
          }

          if (intent.sourceNodeId === ep.nodeId) {
            // This node is sending traffic: Allow Outbound
            const targetIp = ipMap[intent.targetNodeId || ''];
            if (targetIp) {
              if (proto === 'icmp') {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', targetIp, '-p', 'icmp', '-j', 'ACCEPT']);
              } else if (port === 'ALL') {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', targetIp, '-p', proto, '-j', 'ACCEPT']);
              } else {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', targetIp, '-p', proto, '--dport', port, '-j', 'ACCEPT']);
              }
            }
          }
        } else if (intent.type === 'DENY_CONNECTION') {
          const proto = intent.protocol === 'all' ? 'tcp' : intent.protocol || 'tcp';
          const port = intent.port || 'ALL';

          if (intent.targetNodeId === ep.nodeId) {
            const sourceIp = ipMap[intent.sourceNodeId || ''];
            if (sourceIp) {
              if (proto === 'icmp') {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sourceIp, '-p', 'icmp', '-j', 'REJECT']);
              } else if (port === 'ALL') {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sourceIp, '-p', proto, '-j', 'REJECT']);
              } else {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', sourceIp, '-p', proto, '--dport', port, '-j', 'REJECT']);
              }
            }
          }

          if (intent.sourceNodeId === ep.nodeId) {
            const targetIp = ipMap[intent.targetNodeId || ''];
            if (targetIp) {
              if (proto === 'icmp') {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', targetIp, '-p', 'icmp', '-j', 'REJECT']);
              } else if (port === 'ALL') {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', targetIp, '-p', proto, '-j', 'REJECT']);
              } else {
                await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', targetIp, '-p', proto, '--dport', port, '-j', 'REJECT']);
              }
            }
          }
        }
      }

      // 4. Default Outbound: ALLOW ALL (so container has internet/updates access)
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-j', 'ACCEPT']);

      // 5. Default Inbound: REJECT ALL (Zero-trust secure baseline)
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-j', 'REJECT']);
    }
  }

  public async cleanupProjectPolicies(projectId: string, endpoints: VirtualEndpoint[]): Promise<void> {
    console.log(`[DockerNetworkProvider] Cleaning up network policies for project: ${projectId}`);
    const dockerContainers = await docker.listContainers({ all: true });

    for (const ep of endpoints) {
      const containerInfo = dockerContainers.find(c => 
        c.Names.some(name => name.replace(/^\//, '') === ep.containerName)
      );
      if (containerInfo && containerInfo.State === 'running') {
        const containerId = containerInfo.Id;
        // Flush custom chains
        await this.runExec(containerId, ['iptables', '-F', 'AKAL-INPUT']);
        await this.runExec(containerId, ['iptables', '-F', 'AKAL-OUTPUT']);
      }
    }
  }
}
