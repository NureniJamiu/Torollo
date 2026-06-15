import { useEffect, useState, useMemo } from 'react';
import { ReactFlow, Background, Controls, BackgroundVariant } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import UbuntuNode from '../../features/nodes/UbuntuNode/UbuntuNode';
import InputModal from '../../shared/components/InputModal';
import ConfirmModal from '../../shared/components/ConfirmModal';
import { ToastNotification, useToast } from '../../shared/components/Toast';
import { Plus, Server, RefreshCw, Save, ArrowLeft } from 'lucide-react';

interface ContainerData {
  id: string;
  name: string;
  state: string;
  status: string;
}

interface CanvasPageProps {
  projectId: string;
  projectName: string;
  onBackToProjects: () => void;
  onTerminalOpen: (id: string, name: string) => void;
}

export default function CanvasPage({ projectId, projectName, onBackToProjects, onTerminalOpen }: CanvasPageProps) {
  const [containers, setContainers] = useState<ContainerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const { toast, showToast, dismissToast } = useToast();

  // Track visual node coordinates manually, saved to localStorage
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  const fetchContainers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`http://localhost:5000/api/projects/${projectId}/containers`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setContainers(data);
      }
    } catch (err) {
      console.error('Failed to fetch containers:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load visual coordinates on mount and poll container states
  useEffect(() => {
    fetchContainers();
    const savedLayout = localStorage.getItem(`akal-lab-graph-layout-${projectId}`);
    if (savedLayout) {
      try {
        setPositions(JSON.parse(savedLayout));
      } catch (err) {
        console.error(err);
      }
    }

    const timer = setInterval(fetchContainers, 4000);
    return () => clearInterval(timer);
  }, [projectId]);

  const saveGraphLocally = () => {
    localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(positions));
    showToast('Graph layout saved successfully');
  };

  const handleCreateNode = async (nodeName: string) => {
    try {
      setCreating(true);
      setShowCreateModal(false);
      const res = await fetch(`http://localhost:5000/api/projects/${projectId}/containers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nodeName })
      });
      if (res.ok) {
        showToast(`Node "${nodeName}" created successfully`);
        fetchContainers();
      } else {
        const error = await res.json();
        showToast(`Failed: ${error.error}`);
      }
    } catch (err) {
      console.error(err);
      showToast('Error creating container node');
    } finally {
      setCreating(false);
    }
  };

  const handleStart = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:5000/api/projects/${projectId}/containers/${id}/start`, { method: 'POST' });
      if (res.ok) fetchContainers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStop = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:5000/api/projects/${projectId}/containers/${id}/stop`, { method: 'POST' });
      if (res.ok) fetchContainers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    try {
      const res = await fetch(`http://localhost:5000/api/projects/${projectId}/containers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setContainers(prev => prev.filter(c => c.id !== id));
        setPositions(prev => {
          const updated = { ...prev };
          delete updated[id];
          localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(updated));
          return updated;
        });
        showToast('Container deleted');
        fetchContainers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const refreshNodes = () => {
    fetchContainers();
  };

  const nodeTypes = useMemo(() => ({
    ubuntu: UbuntuNode,
  }), []);

  // Update nodes coordinates when user drags them on the Canvas
  const onNodeDragStop = (_event: any, node: Node) => {
    setPositions(prev => ({
      ...prev,
      [node.id]: { x: node.position.x, y: node.position.y }
    }));
  };

  // Map active containers state to React Flow Nodes
  const nodes: Node[] = containers.map((c, index) => {
    const defaultX = 150 + (index % 3) * 280;
    const defaultY = 150 + Math.floor(index / 3) * 220;
    const position = positions[c.id] || { x: defaultX, y: defaultY };

    return {
      id: c.id,
      type: 'ubuntu',
      position,
      data: {
        id: c.id,
        name: c.name,
        state: c.state,
        status: c.status,
        onStart: handleStart,
        onStop: handleStop,
        onDelete: (id: string) => setDeleteTarget(id),
        onTerminalOpen: onTerminalOpen,
      },
    };
  });

  const edges: Edge[] = [];

  return (
    <div style={styles.wrapper}>
      {/* Top Header / Control Bar */}
      <div style={styles.topbar} className="glass">
        <div style={styles.brand}>
          <button onClick={onBackToProjects} style={styles.backBtn} title="Back to Projects">
            <ArrowLeft size={16} />
          </button>
          <Server size={22} color="var(--color-accent)" style={{ marginLeft: 8 }} />
          <span style={styles.brandTitle}>{projectName}</span>
          <span style={styles.badge}>Phase 1</span>
        </div>
        
        <div style={styles.actions}>
          <button 
            onClick={refreshNodes} 
            style={styles.refreshBtn} 
            disabled={loading}
            title="Refresh Nodes"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
          
          <button 
            onClick={saveGraphLocally} 
            style={styles.saveBtn}
            title="Save Layout Locally"
          >
            <Save size={16} style={{ marginRight: 6 }} />
            Save Graph
          </button>

          <button 
            onClick={() => setShowCreateModal(true)} 
            style={styles.addBtn}
            disabled={creating}
          >
            <Plus size={16} style={{ marginRight: 6 }} />
            {creating ? 'Creating...' : 'Add Ubuntu Node'}
          </button>
        </div>
      </div>

      {/* Main React Flow Workspace */}
      <div style={styles.canvasContainer}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeDragStop={onNodeDragStop}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} color="#C0C0C0" gap={24} size={1.5} />
          <Controls />
        </ReactFlow>
      </div>
      
      {/* Footer / Status Summary */}
      <div style={styles.footer} className="glass">
        <div style={styles.statusSummary}>
          <span>Active: <strong>{containers.filter(c => c.state === 'running').length}</strong></span>
          <span style={styles.divider}>|</span>
          <span>Stopped: <strong>{containers.filter(c => c.state !== 'running').length}</strong></span>
        </div>
        <div style={styles.footerNote}>
          Local-first Docker runtime powered by Node.js & Dockerode
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <InputModal
          title="Create Ubuntu Node"
          label="Give your new container a descriptive name."
          placeholder="e.g. web-server, api-gateway"
          defaultValue={`node-${containers.length + 1}`}
          submitText="Create Node"
          onSubmit={handleCreateNode}
          onCancel={() => setShowCreateModal(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Container"
          message="This will permanently stop and remove this container. This action cannot be undone."
          confirmText="Delete"
          variant="danger"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {toast && (
        <ToastNotification message={toast} onDismiss={dismissToast} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    position: 'relative',
  },
  topbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    zIndex: 10,
    borderBottom: '1px solid var(--border-color)',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  backBtn: {
    background: 'rgba(0, 0, 0, 0.04)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  brandTitle: {
    fontWeight: 700,
    fontSize: '18px',
    letterSpacing: '-0.5px',
    color: 'var(--color-text-primary)',
  },
  badge: {
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: 'var(--color-accent-glow)',
    color: 'var(--color-accent)',
    padding: '2px 10px',
    borderRadius: '12px',
    border: '1px solid rgba(37, 99, 235, 0.2)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  refreshBtn: {
    background: 'rgba(0, 0, 0, 0.04)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    width: '38px',
    height: '38px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  saveBtn: {
    backgroundColor: 'var(--bg-surface-solid)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '0 16px',
    height: '38px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  addBtn: {
    backgroundColor: 'var(--color-accent)',
    color: '#FFF',
    border: 'none',
    borderRadius: '10px',
    padding: '0 18px',
    height: '38px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s, transform 0.1s',
    boxShadow: '0 1px 3px rgba(37, 99, 235, 0.3)',
  },
  canvasContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 24px',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    borderTop: '1px solid var(--border-color)',
  },
  statusSummary: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--color-text-secondary)',
  },
  divider: {
    margin: '0 12px',
    color: 'var(--border-color-hover)',
  },
  footerNote: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
};
