import React, { useEffect, useState, useRef } from 'react';
import {
  Play, Square, RotateCcw, Terminal, Users, Sliders, Cpu, HardDrive,
  Heart, Zap, Gift, LogOut, Skull, Sparkles, Save, Search, Activity,
  ChevronRight, FileCode, DownloadCloud, CheckCircle2, Loader2
} from 'lucide-react';

interface PlayerState {
  username: string;
  dimension: string;
  x: number;
  y: number;
  z: number;
}

interface Metrics {
  cpu: number;
  ramMb: number;
  maxRamMb: number;
  uptime: number;
}

interface PropertyItem {
  key: string;
  value: string | number | boolean;
  type: 'boolean' | 'number' | 'string';
}

const DIMENSION_META: Record<string, { label: string; dot: string }> = {
  overworld: { label: 'overworld', dot: 'bg-[#0070f3]' },
  the_nether: { label: 'the_nether', dot: 'bg-[#ee0000]' },
  the_end: { label: 'the_end', dot: 'bg-[#7928ca]' }
};

const QUICK_COMMANDS = [
  { label: 'weather clear', cmd: 'weather clear' },
  { label: 'time set day', cmd: 'time set day' },
  { label: 'save-all', cmd: 'save-all' },
  { label: 'list', cmd: 'list' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'properties' | 'mods' | 'provisioning'>('overview');
  const [status, setStatus] = useState<string>('OFFLINE');
  const [metrics, setMetrics] = useState<Metrics>({ cpu: 0, ramMb: 0, maxRamMb: 4096, uptime: 0 });
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [commandInput, setCommandInput] = useState('');

  // Server Properties State
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [propFilter, setPropFilter] = useState('');

  // Mod Configs State
  const [modFiles, setModFiles] = useState<string[]>([]);
  const [selectedModFile, setSelectedModFile] = useState<string>('');
  const [modEntries, setModEntries] = useState<PropertyItem[]>([]);
  const [modFilter, setModFilter] = useState('');

  // Provisioning State
  const [selectedLoader, setSelectedLoader] = useState<'paper' | 'fabric' | 'vanilla'>('fabric');
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [provisionLogs, setProvisionLogs] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:4000');
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data);
      if (type === 'STATUS') setStatus(payload);
      if (type === 'METRICS') setMetrics(payload);
      if (type === 'PLAYERS') setPlayers(payload);
      if (type === 'CONSOLE') {
        setLogs((prev) => [...prev.slice(-250), payload]);
      }
      if (type === 'PROVISION_LOG') {
        setProvisionLogs((prev) => [...prev, payload]);
      }
    };

    fetchProperties();
    fetchModFiles();
    return () => ws.close();
  }, []);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    fetchLoaderVersions(selectedLoader);
  }, [selectedLoader]);

  const fetchProperties = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/properties');
      const data = await res.json();
      setProperties(data);
    } catch {
      // Daemon offline
    }
  };

  const fetchModFiles = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/mods/configs');
      const files: string[] = await res.json();
      setModFiles(files);
      if (files.length > 0) {
        loadModConfig(files[0]);
      }
    } catch {
      // Daemon offline
    }
  };

  const loadModConfig = async (filename: string) => {
    setSelectedModFile(filename);
    const res = await fetch(`http://localhost:4000/api/mods/configs/${filename}`);
    const data = await res.json();
    setModEntries(data);
  };

  const saveModConfig = async () => {
    if (!selectedModFile) return;
    const payload: Record<string, string | number | boolean> = {};
    modEntries.forEach((entry) => (payload[entry.key] = entry.value));
    await fetch(`http://localhost:4000/api/mods/configs/${selectedModFile}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  };

  const fetchLoaderVersions = async (loader: 'paper' | 'fabric' | 'vanilla') => {
    try {
      const res = await fetch(`http://localhost:4000/api/provisioning/versions/${loader}`);
      const versions: string[] = await res.json();
      setAvailableVersions(versions);
      if (versions.length > 0) setSelectedVersion(versions[0]);
    } catch {
      setAvailableVersions([]);
    }
  };

  const handleProvisionInstall = async () => {
    if (!selectedVersion) return;
    setIsInstalling(true);
    setProvisionLogs([`[Task] Starting automated provisioning for ${selectedLoader} (${selectedVersion})...`]);
    try {
      await fetch('http://localhost:4000/api/provisioning/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loader: selectedLoader, version: selectedVersion })
      });
    } finally {
      setIsInstalling(false);
    }
  };

  const sendAction = (action: string, data?: string) => {
    wsRef.current?.send(JSON.stringify({ action, data }));
  };

  const executePlayerAction = (username: string, type: string) => {
    const commands: Record<string, string> = {
      HEAL: `effect give ${username} minecraft:instant_health 1 10`,
      DAMAGE: `damage ${username} 4 minecraft:magic`,
      KILL: `kill ${username}`,
      GIFT: `give ${username} minecraft:diamond 5`,
      KICK: `kick ${username} Disconnected by Operator`
    };
    if (commands[type]) sendAction('COMMAND', commands[type]);
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    sendAction('COMMAND', commandInput.trim());
    setCommandInput('');
  };

  const updateProperty = (key: string, newValue: string | number | boolean) => {
    setProperties((prev) =>
      prev.map((item) => (item.key === key ? { ...item, value: newValue } : item))
    );
  };

  const updateModEntry = (key: string, newValue: string | number | boolean) => {
    setModEntries((prev) =>
      prev.map((item) => (item.key === key ? { ...item, value: newValue } : item))
    );
  };

  const saveProperties = async () => {
    const payload: Record<string, string | number | boolean> = {};
    properties.forEach((p) => (payload[p.key] = p.value));
    await fetch('http://localhost:4000/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  };

  const ramPercent = Math.min(100, Math.round((metrics.ramMb / metrics.maxRamMb) * 100));

  return (
    <div className="flex flex-col h-screen w-screen bg-[#fafafa] text-[#171717] select-none">
      {/* Top Navbar */}
      <header className="bg-white border-b border-[#ebebeb] px-6">
        <div className="max-w-[1400px] mx-auto h-14 flex items-center justify-between">
          {/* Left Breadcrumb */}
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-[6px] bg-[#171717] text-white flex items-center justify-center font-mono text-xs font-medium">
              ▲
            </div>
            <span className="text-[#ebebeb] text-lg font-light">/</span>
            <span className="text-[14px] font-medium tracking-[-0.28px] text-[#171717]">
              mc-nexus
            </span>
            <span className="text-[#ebebeb] text-lg font-light">/</span>
            <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-[#fafafa] border border-[#ebebeb]">
              <span
                className={`w-2 h-2 rounded-full ${
                  status === 'ONLINE'
                    ? 'bg-[#0070f3]'
                    : status === 'STARTING'
                    ? 'bg-[#f5a623]'
                    : 'bg-[#888888]'
                }`}
              />
              <span className="font-mono text-[11px] text-[#4d4d4d]">{status}</span>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => sendAction('MOCK')}
              className="h-8 px-3 rounded-[6px] bg-white hover:bg-[#fafafa] text-[#4d4d4d] border border-[#ebebeb] text-[13px] font-medium tracking-[-0.28px] flex items-center gap-1.5 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#888888]" />
              Simulate Telemetry
            </button>

            <div className="h-4 w-[1px] bg-[#ebebeb] mx-1" />

            <button
              onClick={() => sendAction('START')}
              disabled={status === 'ONLINE' || status === 'STARTING'}
              className="h-8 px-3.5 rounded-[6px] bg-[#171717] hover:bg-[#333333] disabled:opacity-40 text-white text-[13px] font-medium tracking-[-0.28px] flex items-center gap-1.5 transition cursor-pointer"
            >
              <Play className="w-3 h-3 fill-current" />
              Start Instance
            </button>

            <button
              onClick={() => sendAction('STOP')}
              disabled={status === 'OFFLINE'}
              className="h-8 px-3 rounded-[6px] bg-white hover:bg-[#f5f5f5] disabled:opacity-40 text-[#171717] border border-[#ebebeb] text-[13px] font-medium tracking-[-0.28px] flex items-center gap-1.5 transition cursor-pointer"
            >
              <Square className="w-3 h-3 fill-current" />
              Stop
            </button>

            <button
              onClick={() => sendAction('KILL')}
              disabled={status === 'OFFLINE'}
              className="h-8 px-2.5 rounded-[6px] bg-white hover:bg-[#f7d4d6]/40 disabled:opacity-40 text-[#ee0000] border border-[#ebebeb] text-[13px] font-medium transition cursor-pointer"
              title="Force Kill Process"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="max-w-[1400px] mx-auto flex items-center gap-6 -mb-[1px]">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2.5 text-[14px] tracking-[-0.28px] border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'border-[#171717] text-[#171717] font-medium'
                : 'border-transparent text-[#888888] hover:text-[#171717]'
            }`}
          >
            <Activity className="w-4 h-4" />
            Overview & Runtime
          </button>

          <button
            onClick={() => setActiveTab('properties')}
            className={`py-2.5 text-[14px] tracking-[-0.28px] border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'properties'
                ? 'border-[#171717] text-[#171717] font-medium'
                : 'border-transparent text-[#888888] hover:text-[#171717]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Server Properties
          </button>

          <button
            onClick={() => setActiveTab('mods')}
            className={`py-2.5 text-[14px] tracking-[-0.28px] border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'mods'
                ? 'border-[#171717] text-[#171717] font-medium'
                : 'border-transparent text-[#888888] hover:text-[#171717]'
            }`}
          >
            <FileCode className="w-4 h-4" />
            Mod Configs
          </button>

          <button
            onClick={() => setActiveTab('provisioning')}
            className={`py-2.5 text-[14px] tracking-[-0.28px] border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'provisioning'
                ? 'border-[#171717] text-[#171717] font-medium'
                : 'border-transparent text-[#888888] hover:text-[#171717]'
            }`}
          >
            <DownloadCloud className="w-4 h-4" />
            Provisioning
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-[1400px] mx-auto h-full p-6 flex flex-col gap-6">
          {activeTab === 'overview' && (
            <>
              {/* Top 3-Up Metric Strip */}
              <div className="grid grid-cols-3 gap-4 shrink-0">
                <div className="geist-card p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] uppercase text-[#888888]">
                      CPU Compute
                    </span>
                    <Cpu className="w-4 h-4 text-[#888888]" />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-[24px] font-semibold tracking-[-0.96px] text-[#171717]">
                      {metrics.cpu}%
                    </span>
                    <span className="font-mono text-[12px] text-[#888888]">java.exe</span>
                  </div>
                  <div className="mt-3 h-1.5 w-full bg-[#f5f5f5] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#171717] transition-all duration-300"
                      style={{ width: `${Math.min(100, metrics.cpu)}%` }}
                    />
                  </div>
                </div>

                <div className="geist-card p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] uppercase text-[#888888]">
                      Memory Allocation
                    </span>
                    <HardDrive className="w-4 h-4 text-[#888888]" />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-[24px] font-semibold tracking-[-0.96px] text-[#171717]">
                      {metrics.ramMb} MB
                    </span>
                    <span className="font-mono text-[12px] text-[#888888]">
                      / {metrics.maxRamMb} MB ({ramPercent}%)
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 w-full bg-[#f5f5f5] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#171717] transition-all duration-300"
                      style={{ width: `${ramPercent}%` }}
                    />
                  </div>
                </div>

                <div className="geist-card p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] uppercase text-[#888888]">
                      Connected Players
                    </span>
                    <Users className="w-4 h-4 text-[#888888]" />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-[24px] font-semibold tracking-[-0.96px] text-[#171717]">
                      {players.length}
                    </span>
                    <span className="font-mono text-[12px] text-[#0070f3]">
                      Active Sessions
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-[12px] text-[#4d4d4d]">
                    <span>Port:</span>
                    <span className="font-mono text-[#171717]">localhost:25565</span>
                  </div>
                </div>
              </div>

              {/* Lower Split Workspace */}
              <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
                {/* Left Column: Connected Players Table/Cards */}
                <div className="col-span-5 geist-card flex flex-col overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#ebebeb] flex items-center justify-between bg-[#fafafa]/50">
                    <div>
                      <h2 className="text-[14px] font-medium tracking-[-0.28px] text-[#171717]">
                        Active Players
                      </h2>
                    </div>
                    <span className="font-mono text-[12px] text-[#888888]">
                      {players.length} online
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-[#ebebeb]">
                    {players.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                        <p className="text-[14px] font-medium text-[#171717]">No players online.</p>
                        <p className="text-[13px] text-[#888888] mt-1 max-w-xs">
                          Use &ldquo;Simulate Telemetry&rdquo; in the top bar to preview player states and quick actions.
                        </p>
                      </div>
                    ) : (
                      players.map((p) => {
                        const dim = DIMENSION_META[p.dimension] || {
                          label: p.dimension,
                          dot: 'bg-[#888888]'
                        };

                        return (
                          <div
                            key={p.username}
                            className="p-4 hover:bg-[#fafafa] transition space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <img
                                  src={`https://mc-heads.net/avatar/${p.username}/40`}
                                  alt={p.username}
                                  className="w-9 h-9 rounded-[6px] border border-[#ebebeb]"
                                />
                                <div>
                                  <div className="text-[14px] font-medium tracking-[-0.28px] text-[#171717]">
                                    {p.username}
                                  </div>
                                  <div className="font-mono text-[12px] text-[#888888]">
                                    XYZ: {p.x}, {p.y}, {p.z}
                                  </div>
                                </div>
                              </div>

                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#fafafa] border border-[#ebebeb] font-mono text-[11px] text-[#4d4d4d]">
                                <span className={`w-1.5 h-1.5 rounded-full ${dim.dot}`} />
                                {dim.label}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 pt-1">
                              <button
                                onClick={() => executePlayerAction(p.username, 'HEAL')}
                                className="flex-1 h-7 rounded-[6px] bg-white hover:bg-[#f5f5f5] border border-[#ebebeb] text-[12px] font-medium text-[#171717] flex items-center justify-center gap-1 transition cursor-pointer"
                              >
                                <Heart className="w-3 h-3 text-[#4d4d4d]" />
                                Heal
                              </button>
                              <button
                                onClick={() => executePlayerAction(p.username, 'GIFT')}
                                className="flex-1 h-7 rounded-[6px] bg-white hover:bg-[#f5f5f5] border border-[#ebebeb] text-[12px] font-medium text-[#171717] flex items-center justify-center gap-1 transition cursor-pointer"
                              >
                                <Gift className="w-3 h-3 text-[#4d4d4d]" />
                                Gift
                              </button>
                              <button
                                onClick={() => executePlayerAction(p.username, 'DAMAGE')}
                                className="flex-1 h-7 rounded-[6px] bg-white hover:bg-[#f5f5f5] border border-[#ebebeb] text-[12px] font-medium text-[#171717] flex items-center justify-center gap-1 transition cursor-pointer"
                              >
                                <Zap className="w-3 h-3 text-[#4d4d4d]" />
                                Hurt
                              </button>
                              <button
                                onClick={() => executePlayerAction(p.username, 'KILL')}
                                className="flex-1 h-7 rounded-[6px] bg-white hover:bg-[#f7d4d6]/40 border border-[#ebebeb] text-[12px] font-medium text-[#ee0000] flex items-center justify-center gap-1 transition cursor-pointer"
                              >
                                <Skull className="w-3 h-3" />
                                Kill
                              </button>
                              <button
                                onClick={() => executePlayerAction(p.username, 'KICK')}
                                className="flex-1 h-7 rounded-[6px] bg-white hover:bg-[#f5f5f5] border border-[#ebebeb] text-[12px] font-medium text-[#4d4d4d] flex items-center justify-center gap-1 transition cursor-pointer"
                              >
                                <LogOut className="w-3 h-3" />
                                Kick
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right Column: Polarity-Flipped Console */}
                <div className="col-span-7 rounded-[8px] bg-[#171717] text-white flex flex-col overflow-hidden shadow-sm">
                  <div className="px-4 py-3 border-b border-[#2e2e2e] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-[#888888]" />
                      <span className="font-mono text-[12px] text-[#f2f2f2]">
                        stdout — server.jar
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {QUICK_COMMANDS.map((item) => (
                        <button
                          key={item.cmd}
                          onClick={() => sendAction('COMMAND', item.cmd)}
                          className="px-2 py-0.5 rounded-[4px] bg-[#262626] hover:bg-[#333333] font-mono text-[11px] text-[#a1a1a1] hover:text-white transition cursor-pointer"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 p-4 overflow-y-auto font-mono text-[13px] leading-[20px] space-y-1">
                    {logs.length === 0 ? (
                      <div className="text-[#888888]">
                        Ready. Awaiting process output stream...
                      </div>
                    ) : (
                      logs.map((line, idx) => (
                        <div
                          key={idx}
                          className={`break-all ${
                            line.includes('WARN')
                              ? 'text-[#f5a623]'
                              : line.includes('ERROR')
                              ? 'text-[#ee0000]'
                              : line.startsWith('>')
                              ? 'text-[#50e3c2]'
                              : 'text-[#e5e5e5]'
                          }`}
                        >
                          {line}
                        </div>
                      ))
                    )}
                    <div ref={consoleEndRef} />
                  </div>

                  <form
                    onSubmit={handleCommandSubmit}
                    className="p-2.5 border-t border-[#2e2e2e] bg-[#111111] flex items-center gap-2"
                  >
                    <ChevronRight className="w-4 h-4 text-[#888888] ml-1" />
                    <input
                      type="text"
                      value={commandInput}
                      onChange={(e) => setCommandInput(e.target.value)}
                      placeholder="Enter command..."
                      className="flex-1 bg-transparent font-mono text-[13px] text-white placeholder-[#888888] focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="h-7 px-3 rounded-[6px] bg-white hover:bg-[#e5e5e5] text-[#171717] text-[12px] font-medium transition cursor-pointer"
                    >
                      Run
                    </button>
                  </form>
                </div>
              </div>
            </>
          )}

          {activeTab === 'properties' && (
            /* Visual Server Properties Editor */
            <div className="flex-1 flex flex-col overflow-hidden gap-4 max-w-[1000px] w-full mx-auto">
              <div className="flex items-center justify-between shrink-0">
                <div className="relative w-80">
                  <Search className="w-4 h-4 text-[#888888] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={propFilter}
                    onChange={(e) => setPropFilter(e.target.value)}
                    placeholder="Filter properties..."
                    className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-white border border-[#ebebeb] text-[14px] text-[#171717] placeholder-[#888888] focus:outline-none focus:border-[#171717]"
                  />
                </div>

                <button
                  onClick={saveProperties}
                  className="h-9 px-4 rounded-[6px] bg-[#171717] hover:bg-[#333333] text-white font-medium text-[14px] tracking-[-0.28px] flex items-center gap-2 transition cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>
              </div>

              <div className="geist-card flex-1 flex flex-col overflow-hidden">
                <div className="grid grid-cols-12 px-4 py-2.5 bg-[#fafafa] border-b border-[#ebebeb] font-mono text-[11px] uppercase text-[#888888] select-none shrink-0">
                  <div className="col-span-1">#</div>
                  <div className="col-span-6">Property Key</div>
                  <div className="col-span-2">Type</div>
                  <div className="col-span-3 text-right">Value</div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-[#ebebeb]">
                  {properties
                    .filter((p) => p.key.toLowerCase().includes(propFilter.toLowerCase()))
                    .map((prop, index) => (
                      <div
                        key={prop.key}
                        className="grid grid-cols-12 items-center px-4 py-2.5 hover:bg-[#fafafa] transition"
                      >
                        <div className="col-span-1 font-mono text-[12px] text-[#a1a1a1]">
                          {String(index + 1).padStart(2, '0')}
                        </div>

                        <div className="col-span-6 font-mono text-[13px] text-[#171717] font-medium">
                          {prop.key}
                        </div>

                        <div className="col-span-2">
                          <span className="px-2 py-0.5 rounded-[4px] bg-[#f5f5f5] border border-[#ebebeb] font-mono text-[11px] uppercase text-[#4d4d4d]">
                            {prop.type}
                          </span>
                        </div>

                        <div className="col-span-3 flex justify-end">
                          {prop.type === 'boolean' ? (
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono text-[12px] text-[#888888]">
                                {prop.value ? 'true' : 'false'}
                              </span>
                              <button
                                onClick={() => updateProperty(prop.key, !prop.value)}
                                className={`w-9 h-5 rounded-full transition p-0.5 cursor-pointer ${
                                  prop.value ? 'bg-[#171717]' : 'bg-[#ebebeb]'
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                    prop.value ? 'translate-x-4' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          ) : (
                            <input
                              type={prop.type === 'number' ? 'number' : 'text'}
                              value={String(prop.value)}
                              onChange={(e) =>
                                updateProperty(
                                  prop.key,
                                  prop.type === 'number' ? Number(e.target.value) : e.target.value
                                )
                              }
                              className="w-48 h-8 px-2.5 rounded-[6px] bg-white border border-[#ebebeb] font-mono text-[13px] text-right text-[#171717] focus:outline-none focus:border-[#171717]"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mods' && (
            /* Visual Mod Configurations Editor (/config/*.toml | *.json) */
            <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
              {/* Left File Selector (3 cols) */}
              <div className="col-span-3 geist-card flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-[#ebebeb] bg-[#fafafa]/50">
                  <span className="font-mono text-[11px] uppercase text-[#888888]">
                    /config directory
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-[#ebebeb]">
                  {modFiles.map((file) => (
                    <button
                      key={file}
                      onClick={() => loadModConfig(file)}
                      className={`w-full px-4 py-3 text-left font-mono text-[13px] flex items-center justify-between transition cursor-pointer ${
                        selectedModFile === file
                          ? 'bg-[#171717] text-white font-medium'
                          : 'text-[#171717] hover:bg-[#fafafa]'
                      }`}
                    >
                      <span className="truncate">{file}</span>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Right Data-Table Editor (9 cols) */}
              <div className="col-span-9 flex flex-col overflow-hidden gap-4">
                <div className="flex items-center justify-between shrink-0">
                  <div className="relative w-80">
                    <Search className="w-4 h-4 text-[#888888] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={modFilter}
                      onChange={(e) => setModFilter(e.target.value)}
                      placeholder={`Filter ${selectedModFile}...`}
                      className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-white border border-[#ebebeb] text-[14px] text-[#171717] placeholder-[#888888] focus:outline-none focus:border-[#171717]"
                    />
                  </div>

                  <button
                    onClick={saveModConfig}
                    className="h-9 px-4 rounded-[6px] bg-[#171717] hover:bg-[#333333] text-white font-medium text-[14px] tracking-[-0.28px] flex items-center gap-2 transition cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    Save {selectedModFile}
                  </button>
                </div>

                <div className="geist-card flex-1 flex flex-col overflow-hidden">
                  <div className="grid grid-cols-12 px-4 py-2.5 bg-[#fafafa] border-b border-[#ebebeb] font-mono text-[11px] uppercase text-[#888888] select-none shrink-0">
                    <div className="col-span-1">#</div>
                    <div className="col-span-6">Config Node Path</div>
                    <div className="col-span-2">Type</div>
                    <div className="col-span-3 text-right">Value</div>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-[#ebebeb]">
                    {modEntries
                      .filter((e) => e.key.toLowerCase().includes(modFilter.toLowerCase()))
                      .map((entry, idx) => (
                        <div
                          key={entry.key}
                          className="grid grid-cols-12 items-center px-4 py-2.5 hover:bg-[#fafafa] transition"
                        >
                          <div className="col-span-1 font-mono text-[12px] text-[#a1a1a1]">
                            {String(idx + 1).padStart(2, '0')}
                          </div>
                          <div className="col-span-6 font-mono text-[13px] text-[#171717] font-medium">
                            {entry.key}
                          </div>
                          <div className="col-span-2">
                            <span className="px-2 py-0.5 rounded-[4px] bg-[#f5f5f5] border border-[#ebebeb] font-mono text-[11px] uppercase text-[#4d4d4d]">
                              {entry.type}
                            </span>
                          </div>
                          <div className="col-span-3 flex justify-end">
                            {entry.type === 'boolean' ? (
                              <div className="flex items-center gap-2.5">
                                <span className="font-mono text-[12px] text-[#888888]">
                                  {entry.value ? 'true' : 'false'}
                                </span>
                                <button
                                  onClick={() => updateModEntry(entry.key, !entry.value)}
                                  className={`w-9 h-5 rounded-full transition p-0.5 cursor-pointer ${
                                    entry.value ? 'bg-[#171717]' : 'bg-[#ebebeb]'
                                  }`}
                                >
                                  <div
                                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                      entry.value ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            ) : (
                              <input
                                type={entry.type === 'number' ? 'number' : 'text'}
                                value={String(entry.value)}
                                onChange={(e) =>
                                  updateModEntry(
                                    entry.key,
                                    entry.type === 'number'
                                      ? Number(e.target.value)
                                      : e.target.value
                                  )
                                }
                                className="w-48 h-8 px-2.5 rounded-[6px] bg-white border border-[#ebebeb] font-mono text-[13px] text-right text-[#171717] focus:outline-none focus:border-[#171717]"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'provisioning' && (
            /* Automated Server Provisioning Engine */
            <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden max-w-[1100px] w-full mx-auto">
              <div className="col-span-6 geist-card p-6 flex flex-col justify-between">
                <div className="space-y-6">
                  <div>
                    <span className="font-mono text-[11px] uppercase text-[#888888]">
                      Automated Setup
                    </span>
                    <h2 className="text-[20px] font-semibold tracking-[-0.6px] text-[#171717] mt-1">
                      Deploy Server Runtime.
                    </h2>
                    <p className="text-[14px] text-[#4d4d4d] mt-1">
                      Select a server engine and version. MC-Nexus automatically fetches the official binary, signs the EULA, and initializes directory trees.
                    </p>
                  </div>

                  {/* Loader Selector (3-up cards) */}
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-[#888888]">
                      1. Select Loader Engine
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {(['fabric', 'paper', 'vanilla'] as const).map((loader) => (
                        <button
                          key={loader}
                          onClick={() => setSelectedLoader(loader)}
                          className={`p-3 rounded-[6px] border text-left transition cursor-pointer ${
                            selectedLoader === loader
                              ? 'bg-[#171717] text-white border-[#171717]'
                              : 'bg-white text-[#171717] border-[#ebebeb] hover:bg-[#fafafa]'
                          }`}
                        >
                          <div className="font-mono text-[13px] font-medium uppercase">
                            {loader}
                          </div>
                          <div
                            className={`text-[11px] mt-0.5 ${
                              selectedLoader === loader ? 'text-[#a1a1a1]' : 'text-[#888888]'
                            }`}
                          >
                            {loader === 'fabric'
                              ? 'Modded Loader'
                              : loader === 'paper'
                              ? 'High Perf Plugins'
                              : 'Official Mojang'}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Version Dropdown */}
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-[#888888]">
                      2. Target Minecraft Version
                    </label>
                    <select
                      value={selectedVersion}
                      onChange={(e) => setSelectedVersion(e.target.value)}
                      className="w-full h-10 px-3 rounded-[6px] bg-white border border-[#ebebeb] font-mono text-[13px] text-[#171717] focus:outline-none focus:border-[#171717]"
                    >
                      {availableVersions.map((v) => (
                        <option key={v} value={v}>
                          Minecraft {v} ({selectedLoader.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleProvisionInstall}
                  disabled={isInstalling || !selectedVersion}
                  className="w-full h-10 rounded-[6px] bg-[#171717] hover:bg-[#333333] disabled:opacity-40 text-white text-[14px] font-medium flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Downloading & Configuring...
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="w-4 h-4" />
                      Download & Initialize Server
                    </>
                  )}
                </button>
              </div>

              {/* Provisioning Output Log */}
              <div className="col-span-6 rounded-[8px] bg-[#171717] text-white p-5 flex flex-col justify-between font-mono">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-[#2e2e2e]">
                    <span className="text-[12px] text-[#888888]">PROVISIONING PIPELINE</span>
                    <CheckCircle2 className="w-4 h-4 text-[#50e3c2]" />
                  </div>
                  <div className="mt-4 space-y-2 text-[12px] leading-relaxed">
                    {provisionLogs.length === 0 ? (
                      <div className="text-[#888888]">
                        Awaiting deployment trigger. Target directory: /instances/default
                      </div>
                    ) : (
                      provisionLogs.map((msg, i) => (
                        <div key={i} className="text-[#e5e5e5]">
                          {msg}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#2e2e2e] text-[11px] text-[#888888] flex justify-between">
                  <span>Auto-EULA: Enabled</span>
                  <span>Target: server.jar</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}