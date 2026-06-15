import { useEffect, useState } from 'react';
import { Folder, Plus, Trash2, ArrowRight } from 'lucide-react';
import InputModal from '../../shared/components/InputModal';
import ConfirmModal from '../../shared/components/ConfirmModal';

interface Project {
  id: string;
  name: string;
  createdAt: string;
}

interface ProjectsPageProps {
  onSelectProject: (id: string, name: string) => void;
}

export default function ProjectsPage({ onSelectProject }: ProjectsPageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:5000/api/projects');
      const data = await res.json();
      if (Array.isArray(data)) {
        setProjects(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (name: string) => {
    setShowCreateModal(false);
    try {
      const res = await fetch('http://localhost:5000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        fetchProjects();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    try {
      const res = await fetch(`http://localhost:5000/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        localStorage.removeItem(`akal-lab-graph-layout-${id}`);
        fetchProjects();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteClick = (project: Project, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeleteTarget(project);
  };

  return (
    <div style={styles.container}>
      {/* Page header */}
      <div style={styles.header}>
        <div style={styles.logoRow}>
          <div style={styles.iconWrap}>
            <Folder size={22} color="var(--color-accent)" />
          </div>
          <div>
            <h1 style={styles.title}>Project Stacks</h1>
            <p style={styles.subtitle}>Organize your infrastructure labs</p>
          </div>
        </div>
        <button onClick={() => setShowCreateModal(true)} style={styles.createBtn} id="create-project-btn">
          <Plus size={16} style={{ marginRight: 6 }} />
          New Project
        </button>
      </div>

      {/* Loading state */}
      {loading && <p style={styles.loading}>Loading projects...</p>}

      {/* Project grid */}
      <div style={styles.grid}>
        {projects.map((p) => (
          <div
            key={p.id}
            onClick={() => onSelectProject(p.id, p.name)}
            style={styles.card}
            id={`project-card-${p.id}`}
          >
            <div style={styles.cardHeader}>
              <div style={styles.cardIcon}>
                <Folder size={20} color="var(--color-accent)" />
              </div>
              <button
                onClick={(e) => handleDeleteClick(p, e)}
                style={styles.deleteBtn}
                title="Delete project"
                id={`delete-project-${p.id}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div style={styles.cardBody}>
              <h2 style={styles.projectName}>{p.name}</h2>
              <p style={styles.projectMeta}>
                {new Date(p.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div style={styles.cardFooter}>
              <span>Open Stack</span>
              <ArrowRight size={14} style={{ marginLeft: 6 }} />
            </div>
          </div>
        ))}

        {!loading && projects.length === 0 && (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>
              <Folder size={40} color="var(--color-text-muted)" strokeWidth={1.2} />
            </div>
            <p style={styles.emptyTitle}>No projects yet</p>
            <p style={styles.emptyDesc}>Click "New Project" to create your first infrastructure stack.</p>
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <InputModal
          title="Create Project Stack"
          label="Give your project a descriptive name to organize your containers."
          placeholder="e.g. Web App Lab, API Gateway Test"
          submitText="Create Project"
          onSubmit={handleCreateProject}
          onCancel={() => setShowCreateModal(false)}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Project"
          message={`This will permanently delete "${deleteTarget.name}" and stop/remove all associated Docker containers. This action cannot be undone.`}
          confirmText="Delete Project"
          variant="danger"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '48px 60px',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
    overflowY: 'auto',
    height: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '40px',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  iconWrap: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    background: 'var(--color-accent-glow)',
    border: '1px solid rgba(37, 99, 235, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    margin: '2px 0 0 0',
  },
  createBtn: {
    backgroundColor: 'var(--color-accent)',
    color: '#FFF',
    border: 'none',
    borderRadius: '10px',
    padding: '0 20px',
    height: '42px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
    boxShadow: '0 1px 3px rgba(37, 99, 235, 0.3)',
  },
  loading: {
    color: 'var(--color-text-secondary)',
    fontSize: '14px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '20px',
  },
  card: {
    padding: '24px',
    borderRadius: '16px',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s',
    display: 'flex',
    flexDirection: 'column',
    height: '190px',
    justifyContent: 'space-between',
    backgroundColor: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'var(--color-accent-glow)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.2s, background 0.2s',
  },
  cardBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  projectName: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    margin: '0 0 4px 0',
    letterSpacing: '-0.2px',
  },
  projectMeta: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    margin: 0,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--color-accent)',
    fontSize: '13px',
    fontWeight: 500,
  },
  empty: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '80px 0',
  },
  emptyIcon: {
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    margin: '0 0 6px 0',
  },
  emptyDesc: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    margin: 0,
  },
};
