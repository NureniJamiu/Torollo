import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Database, Table, Columns, Play, Copy, Check, Search, BookOpen, Terminal, RefreshCw, AlertCircle, Eye, Loader2, Settings, Activity, Server } from 'lucide-react';
import { API_BASE } from '../../../shared/types';
import mongoCheatSheet from './data/mongoCheatSheet.json';

interface NoSqlModalProps {
  containerId: string;
  nodeName: string;
  projectId: string;
  onClose: () => void;
}

interface DBColumn {
  name: string;
  type: string;
}

interface DBTable {
  name: string;
  columns: DBColumn[];
}

interface DBNode {
  database: string;
  tables: DBTable[];
  error?: boolean;
}

const CHEAT_SHEET_DATA = mongoCheatSheet;

export default function NoSqlModal({ containerId, nodeName, projectId, onClose }: NoSqlModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'simulation' | 'explorer' | 'shell' | 'cheatsheet'>('details');
  const [explorerData, setExplorerData] = useState<DBNode[]>([]);
  const [loadingExplorer, setLoadingExplorer] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);

  // Shell states
  const [mongoQuery, setMongoQuery] = useState("db.users.insertOne({ name: 'Bob', age: 25, status: 'active' })");
  const [queryOutput, setQueryOutput] = useState('');
  const [executing, setExecuting] = useState(false);

  // Cheat Sheet Search
  const [cheatQuery, setCheatQuery] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // DB tree expand state
  const [expandedDBs, setExpandedDBs] = useState<Record<string, boolean>>({ test: true });
  const [expandedCollections, setExpandedCollections] = useState<Record<string, boolean>>({});

  // Details & Config vertical limits & sharding
  const [cpuLimit, setCpuLimit] = useState(1);
  const [memoryLimit, setMemoryLimit] = useState(512);
  const [shards, setShards] = useState(2);
  const [scalingLoading, setScalingLoading] = useState(false);

  // Simulation tab states
  const [trafficActive, setTrafficActive] = useState(false);
  const [simLogs, setSimLogs] = useState<Array<{ id: string; type: 'route' | 'warn' | 'sys'; msg: string; time: string }>>([
    { id: '1', type: 'sys', msg: 'MongoDB Router (mongos) online. Shard servers active.', time: new Date().toLocaleTimeString() }
  ]);
  const [simMetrics, setSimMetrics] = useState({ routed: 0, staleReads: 0 });
  const [lastHashedKey, setLastHashedKey] = useState<string>('');
  const [lastShardIndex, setLastShardIndex] = useState<number>(-1);

  const fetchExplorerDataRef = useRef<() => Promise<void>>(undefined);

  const fetchExplorerData = useCallback(async () => {
    try {
      setLoadingExplorer(true);
      setExplorerError(null);
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/nosql/explorer`);
      if (res.ok) {
        const data = await res.json();
        setExplorerData(data);
      } else {
        const errData = await res.json();
        if (errData.error && errData.error.includes('starting up')) {
          setExplorerError('starting_up');
          setTimeout(() => {
            fetchExplorerDataRef.current?.();
          }, 2500);
        } else {
          setExplorerError(errData.error || 'Failed to inspect schema');
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to connect to container';
      setExplorerError(errMsg);
    } finally {
      setLoadingExplorer(false);
    }
  }, [projectId, containerId]);

  useEffect(() => {
    fetchExplorerDataRef.current = fetchExplorerData;
  }, [fetchExplorerData]);

  useEffect(() => {
    fetchExplorerData();
  }, [fetchExplorerData]);

  // Traffic simulation (sharding hash routing + eventual consistency)
  useEffect(() => {
    if (!trafficActive || activeTab !== 'simulation') return;

    const interval = setInterval(() => {
      const isWrite = Math.random() > 0.4;
      const timeStr = new Date().toLocaleTimeString();
      const logId = Math.random().toString(36).substr(2, 9);
      const randomDocId = Math.random().toString(36).substring(3, 11);

      // Simple hash helper
      let hash = 0;
      for (let i = 0; i < randomDocId.length; i++) {
        hash = randomDocId.charCodeAt(i) + ((hash << 5) - hash);
      }
      const targetShard = Math.abs(hash) % shards;

      if (isWrite) {
        setLastHashedKey(randomDocId);
        setLastShardIndex(targetShard);
        setSimLogs(prev => [
          { id: logId, type: 'route', msg: `WRITE: Document ID [${randomDocId}] -> md5Hash(${randomDocId}) -> Routed to Shard #${targetShard + 1} (Partition ${targetShard})`, time: timeStr },
          ...prev.slice(0, 19)
        ]);
        setSimMetrics(prev => ({ ...prev, routed: prev.routed + 1 }));
      } else {
        // Read: demonstrate eventual consistency stale reads occasionally
        const isStale = Math.random() > 0.8;
        if (isStale) {
          setSimLogs(prev => [
            { id: logId, type: 'warn', msg: `READ WARNING: Read request for [${randomDocId}] returned stale secondary replica state (Eventual Consistency lag).`, time: timeStr },
            ...prev.slice(0, 19)
          ]);
          setSimMetrics(prev => ({ ...prev, staleReads: prev.staleReads + 1 }));
        } else {
          setSimLogs(prev => [
            { id: logId, type: 'sys', msg: `READ: Query for ID [${randomDocId}] -> Query Router directed directly to Shard #${targetShard + 1}`, time: timeStr },
            ...prev.slice(0, 19)
          ]);
          setSimMetrics(prev => ({ ...prev, routed: prev.routed + 1 }));
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [trafficActive, shards, activeTab]);

  const handleUpdateLimits = async () => {
    try {
      setScalingLoading(true);
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpus: cpuLimit, memory: memoryLimit })
      });
      if (res.ok) {
        setSimLogs(prev => [
          { id: Math.random().toString(), type: 'sys', msg: `Resource limits scaled: CPU ${cpuLimit} Cores, Memory ${memoryLimit}MB. docker update applied.`, time: new Date().toLocaleTimeString() },
          ...prev
        ]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setScalingLoading(false);
    }
  };

  const handleExecuteQuery = async () => {
    try {
      setExecuting(true);
      setQueryOutput('Evaluating mongosh expression...');
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/nosql/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: mongoQuery })
      });
      const data = await res.json();
      if (res.ok) {
        setQueryOutput(data.result || 'Executed successfully.');
        fetchExplorerData();
      } else {
        setQueryOutput(`ERROR: ${data.error}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setQueryOutput(`Execution failed: ${errMsg}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleViewCollectionData = async (database: string, collName: string) => {
    const query = `JSON.stringify(db.getSiblingDB('${database}').getCollection('${collName}').find().limit(10).toArray(), null, 2)`;
    setMongoQuery(query);
    setActiveTab('shell');

    try {
      setExecuting(true);
      setQueryOutput('Retrieving collection documents...');
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/nosql/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      if (res.ok) {
        setQueryOutput(data.result || 'No documents.');
      } else {
        setQueryOutput(`ERROR: ${data.error}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setQueryOutput(`Error: ${errMsg}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleCopyCheat = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const filteredCheatSheet = CHEAT_SHEET_DATA.filter(item => {
    const query = cheatQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    );
  });

  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        {/* Header Tabs */}
        <div style={styles.header}>
          <div style={styles.tabs}>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'details' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('details')}
            >
              <Settings size={15} style={{ marginRight: 6 }} />
              Details & Config
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'simulation' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('simulation')}
            >
              <Activity size={15} style={{ marginRight: 6 }} />
              Simulation
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'explorer' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('explorer')}
            >
              <Database size={15} style={{ marginRight: 6 }} />
              NoSQL Explorer
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'shell' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('shell')}
            >
              <Terminal size={15} style={{ marginRight: 6 }} />
              Mongo Shell
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'cheatsheet' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('cheatsheet')}
            >
              <BookOpen size={15} style={{ marginRight: 6 }} />
              Mongo Cheat Sheet
            </button>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={styles.body}>
          {/* TAB: Details & Config */}
          {activeTab === 'details' && (
            <div style={styles.tabContent}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#1E293B' }}>NoSQL Database Configuration</h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748B' }}>
                Manage vertical resources and partition horizontal database shards.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#334155' }}>Vertical Limits</h4>
                  
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>CPU Core Limit</span>
                      <span style={{ fontSize: '12px', color: '#2563EB', fontWeight: 'bold' }}>{cpuLimit} vCPU</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="4"
                      step="0.2"
                      value={cpuLimit}
                      onChange={(e) => setCpuLimit(parseFloat(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>Memory Limit</span>
                      <span style={{ fontSize: '12px', color: '#2563EB', fontWeight: 'bold' }}>{memoryLimit} MB</span>
                    </div>
                    <input
                      type="range"
                      min="128"
                      max="2048"
                      step="128"
                      value={memoryLimit}
                      onChange={(e) => setMemoryLimit(parseInt(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <button
                    onClick={handleUpdateLimits}
                    disabled={scalingLoading}
                    style={{
                      width: '100%',
                      backgroundColor: '#2563EB',
                      color: 'white',
                      border: 'none',
                      padding: '8px',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {scalingLoading ? 'Applying Resource Changes...' : 'Apply Resource Changes'}
                  </button>
                </div>

                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#334155' }}>Horizontal Scaling (Sharding)</h4>
                  
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                      Shard Partitions Count
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        onClick={() => setShards(prev => Math.max(1, prev - 1))}
                        style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        -
                      </button>
                      <span style={{ fontSize: '16px', fontWeight: 'bold', width: '20px', textAlign: 'center' }}>{shards}</span>
                      <button
                        onClick={() => setShards(prev => Math.min(5, prev + 1))}
                        style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        +
                      </button>
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginTop: '6px' }}>
                      Partition data across {shards} shards using hash keys. Increases write throughput and distributes document storage.
                    </span>
                  </div>

                  <div style={{ backgroundColor: '#F8FAFC', borderRadius: '6px', padding: '12px', borderLeft: '3px solid #2563EB' }}>
                    <h5 style={{ margin: '0 0 4px 0', fontSize: '11px', textTransform: 'uppercase', color: '#475569' }}>Sharding Concept</h5>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                      NoSQL databases scale horizontally by splitting collections. A query router (mongos) computes the hash of the shard key to locate the target partition.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Simulation */}
          {activeTab === 'simulation' && (
            <div style={{ ...styles.tabContent, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#1E293B' }}>MongoDB Sharding Router Simulation</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                    Observe request hashing and eventual consistency secondary replication lag.
                  </p>
                </div>
                <button
                  onClick={() => setTrafficActive(p => !p)}
                  style={{
                    backgroundColor: trafficActive ? '#EF4444' : '#10B981',
                    color: 'white',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  {trafficActive ? 'Pause Traffic' : 'Start Simulation'}
                </button>
              </div>

              {/* Simulation metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 }}>Routed Queries</span>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563EB', marginTop: '4px' }}>{simMetrics.routed}</div>
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', textAlign: 'center', backgroundColor: '#FEF3C7' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#B45309', fontWeight: 600 }}>Stale Reads Logged</span>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#D97706', marginTop: '4px' }}>{simMetrics.staleReads}</div>
                </div>
              </div>

              {/* Topology sharding visual map */}
              <div style={{ flex: 1, minHeight: '180px', border: '1px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#0F172A', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                {/* Client / App router */}
                <div style={{ position: 'absolute', left: '8%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Server size={28} color="#94A3B8" />
                  <span style={{ color: '#E2E8F0', fontSize: '10px', marginTop: '4px' }}>mongos Router</span>
                </div>

                {/* Arrow */}
                <div style={{ position: 'absolute', left: '26%', color: '#475569' }}>
                  <span style={{ fontSize: '16px' }}>➔</span>
                </div>

                {/* Hashing status display */}
                {lastHashedKey && (
                  <div style={{ position: 'absolute', top: '10px', left: '30%', backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '6px', padding: '4px 10px', fontSize: '10px', color: '#93C5FD', fontFamily: 'monospace' }}>
                    key: "{lastHashedKey}" ➔ md5_hash ➔ Shard {lastShardIndex + 1}
                  </div>
                )}

                {/* Shards wrapper */}
                <div style={{ position: 'absolute', right: '10%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Array.from({ length: shards }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        border: lastShardIndex === i ? '1px solid #10B981' : '1px solid transparent',
                        borderRadius: '6px',
                        padding: '4px',
                        transition: 'all 0.2s',
                        backgroundColor: lastShardIndex === i ? 'rgba(16, 185, 129, 0.05)' : undefined
                      }}
                    >
                      <span style={{ color: lastShardIndex === i ? '#10B981' : '#475569' }}>➔</span>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Database size={24} color={lastShardIndex === i ? '#10B981' : '#475569'} />
                        <span style={{ color: '#E2E8F0', fontSize: '9px' }}>Shard Partition #{i + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Logs output */}
              <div style={{ height: '140px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Simulated Event Log
                </div>
                <div style={{ flex: 1, backgroundColor: '#0F172A', color: '#94A3B8', borderRadius: '8px', padding: '10px', fontFamily: 'monospace', fontSize: '11px', overflowY: 'auto' }}>
                  {simLogs.map(log => (
                    <div key={log.id} style={{ marginBottom: '4px', color: log.type === 'warn' ? '#F59E0B' : log.type === 'route' ? '#6EE7B7' : '#93C5FD' }}>
                      [{log.time}] {log.msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: Database Explorer */}
          {activeTab === 'explorer' && (
            <div style={styles.tabContent}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>Inspect collections and fields: {nodeName}</span>
                <button onClick={fetchExplorerData} disabled={loadingExplorer} style={styles.iconActionBtn}>
                  <RefreshCw size={14} className={loadingExplorer ? 'spin' : ''} />
                </button>
              </div>

              <div style={styles.explorerTree}>
                {explorerError ? (
                  explorerError === 'starting_up' ? (
                    <div style={styles.errorContainer}>
                      <Loader2 size={24} className="spin" color="#3B82F6" style={{ marginBottom: 12 }} />
                      <span style={styles.errorMessage}>NoSQL database container is initializing...</span>
                    </div>
                  ) : (
                    <div style={styles.errorContainer}>
                      <AlertCircle size={24} color="#EF4444" style={{ marginBottom: 12 }} />
                      <span style={styles.errorMessage}>{explorerError}</span>
                    </div>
                  )
                ) : explorerData.map(node => (
                  <div key={node.database} style={styles.treeNode}>
                    <div style={styles.treeRow} onClick={() => setExpandedDBs(prev => ({ ...prev, [node.database]: !prev[node.database] }))}>
                      <Database size={16} color="#3B82F6" style={{ marginRight: 8 }} />
                      <span style={styles.dbName}>{node.database}</span>
                    </div>

                    {expandedDBs[node.database] && (
                      <div style={styles.treeChildren}>
                        {node.tables.length > 0 ? (
                          node.tables.map(table => {
                            const tblKey = `${node.database}:${table.name}`;
                            return (
                              <div key={table.name} style={styles.treeNode}>
                                <div style={styles.treeRow} onClick={() => setExpandedCollections(prev => ({ ...prev, [tblKey]: !prev[tblKey] }))}>
                                  <Table size={14} color="#10B981" style={{ marginRight: 8 }} />
                                  <span style={styles.tableName}>{table.name} (Collection)</span>
                                  
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewCollectionData(node.database, table.name);
                                    }}
                                    style={styles.inlineViewBtn}
                                    title="View Documents (Mongo Shell)"
                                    className="glass"
                                  >
                                    <Eye size={12} style={{ marginRight: 4 }} />
                                    Find Documents
                                  </button>
                                </div>

                                {expandedCollections[tblKey] && (
                                  <div style={styles.treeChildren}>
                                    {table.columns.map(col => (
                                      <div key={col.name} style={styles.columnRow}>
                                        <Columns size={12} color="var(--color-text-muted)" style={{ marginRight: 8 }} />
                                        <span style={styles.columnName}>{col.name}</span>
                                        <span style={styles.columnType}>{col.type}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div style={styles.treeRowEmpty}>No collections found.</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: Mongo Shell */}
          {activeTab === 'shell' && (
            <div style={{ ...styles.tabContent, display: 'flex', flexDirection: 'column' }}>
              <div style={styles.shellHeader}>
                <span style={styles.label}>Interactive mongosh execution console</span>
                <button
                  onClick={handleExecuteQuery}
                  disabled={executing || !mongoQuery.trim()}
                  style={styles.runBtn}
                >
                  <Play size={14} style={{ marginRight: 6 }} fill="#FFF" />
                  {executing ? 'Evaluating...' : 'Run mongosh Expression'}
                </button>
              </div>

              <textarea
                value={mongoQuery}
                onChange={(e) => setMongoQuery(e.target.value)}
                placeholder="Write your MongoDB JS commands here..."
                style={styles.sqlTextarea}
              />

              <div style={styles.terminalHeader}>Result JSON Console</div>
              <pre style={styles.terminalOutput}>
                <code>{queryOutput || 'No output. Execute an expression to see results.'}</code>
              </pre>
            </div>
          )}

          {/* TAB: Cheat Sheet */}
          {activeTab === 'cheatsheet' && (
            <div style={{ ...styles.tabContent, display: 'flex', flexDirection: 'column' }}>
              <div style={styles.searchBar}>
                <div style={styles.searchWrapper}>
                  <Search size={15} color="var(--color-text-muted)" style={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Search MongoDB helper commands..."
                    value={cheatQuery}
                    onChange={(e) => setCheatQuery(e.target.value)}
                    style={styles.searchInput}
                  />
                </div>
              </div>

              <div style={styles.cheatSheetList}>
                {filteredCheatSheet.map((item, idx) => (
                  <div key={item.name} style={styles.cheatCard}>
                    <div style={styles.cheatHeader}>
                      <span style={styles.cheatName}>{item.name}</span>
                      <span style={styles.cheatCategory}>{item.category}</span>
                    </div>
                    <p style={styles.cheatDesc}>{item.description}</p>
                    <div style={styles.codeContainer}>
                      <pre style={styles.code}>
                        <code>{item.example}</code>
                      </pre>
                      <button
                        onClick={() => handleCopyCheat(item.example, idx)}
                        style={styles.copyBtn}
                      >
                        {copiedIndex === idx ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    boxSizing: 'border-box',
  },
  container: {
    width: '900px',
    maxWidth: '100%',
    height: '600px',
    maxHeight: '100%',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-surface-solid)',
    borderTopLeftRadius: '12px',
    borderTopRightRadius: '12px',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
  },
  tabBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  activeTabBtn: {
    backgroundColor: 'var(--color-accent-glow)',
    color: 'var(--color-accent)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s, color 0.2s',
  },
  body: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  tabContent: {
    height: '100%',
    overflowY: 'auto',
    padding: '20px',
    boxSizing: 'border-box',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  iconActionBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
  },
  explorerTree: {
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '12px',
    backgroundColor: 'var(--bg-main)',
    minHeight: '240px',
  },
  treeNode: {
    marginBottom: '6px',
  },
  treeRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px',
    cursor: 'pointer',
    borderRadius: '6px',
    transition: 'background-color 0.2s',
    userSelect: 'none',
  },
  treeRowEmpty: {
    padding: '6px 8px 6px 32px',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },
  treeChildren: {
    paddingLeft: '24px',
    borderLeft: '1px dashed var(--border-color)',
    marginTop: '2px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  dbName: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  tableName: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  columnRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    fontSize: '12px',
  },
  columnName: {
    color: 'var(--color-text-primary)',
    fontWeight: 500,
    marginRight: '8px',
  },
  columnType: {
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
    fontSize: '11px',
  },
  shellHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    flexShrink: 0,
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  select: {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    fontSize: '13px',
    backgroundColor: '#FFF',
    outline: 'none',
  },
  runBtn: {
    backgroundColor: '#10B981',
    color: '#FFF',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 1px 3px rgba(16, 185, 129, 0.3)',
  },
  sqlTextarea: {
    width: '100%',
    height: '140px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    resize: 'none',
    boxSizing: 'border-box',
    outline: 'none',
    marginBottom: '16px',
    backgroundColor: 'var(--bg-main)',
    color: 'var(--color-text-primary)',
  },
  terminalHeader: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    marginBottom: '8px',
  },
  terminalOutput: {
    flex: 1,
    margin: 0,
    padding: '12px',
    backgroundColor: '#0F172A',
    color: '#E2E8F0',
    borderRadius: '8px',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    overflow: 'auto',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  searchBar: {
    marginBottom: '16px',
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px 10px 36px',
    backgroundColor: 'var(--bg-main)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
  },
  cheatSheetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  cheatCard: {
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '16px',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  cheatHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  cheatName: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-accent)',
  },
  cheatCategory: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    border: '1px solid var(--border-color)',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  cheatDesc: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    margin: '0 0 12px 0',
  },
  codeContainer: {
    position: 'relative',
  },
  code: {
    margin: 0,
    padding: '10px 14px',
    backgroundColor: 'var(--bg-main)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    borderRadius: '6px',
    overflowX: 'auto',
    border: '1px solid var(--border-color)',
  },
  copyBtn: {
    position: 'absolute',
    right: '8px',
    top: '8px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
    padding: '4px',
    borderRadius: '4px',
  },
  inlineViewBtn: {
    marginLeft: 'auto',
    backgroundColor: 'var(--color-accent-glow)',
    border: '1px solid rgba(37, 99, 235, 0.2)',
    borderRadius: '4px',
    color: 'var(--color-accent)',
    fontSize: '11px',
    padding: '2px 8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '30px 20px',
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    marginBottom: '16px',
    maxWidth: '400px',
  }
};
