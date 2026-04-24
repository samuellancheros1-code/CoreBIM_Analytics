import React, { useState, useCallback, useRef } from 'react';
import { buildPresupuesto, PresupuestoGeneral } from './lib/apuEngine';
import { parseIFCFile, ParsedIFCData } from './lib/ifcParser';
import { exportToExcel } from './lib/excelExporter';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import {
  AlertCircle, FileUp, TrendingUp, AlertTriangle, Box, DollarSign,
  MapPin, Download, FileSpreadsheet, Package, Layers, ChevronRight,
  CheckCircle, Loader2, Info, BarChart2, ClipboardList,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Utilidades ────────────────────────────────────────────────────────────────
function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

const COP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

const PCT = (v: number) => `${(v * 100).toFixed(0)}%`;

// ─── Colores de Gráficos ──────────────────────────────────────────────────────
const CHART_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
];

// ─── Tipos de Vista ────────────────────────────────────────────────────────────
type View = 'upload' | 'dashboard' | 'budget' | 'apu' | 'map' | 'json';

// ─── Componente Principal ──────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<View>('upload');
  const [parsedData, setParsedData] = useState<ParsedIFCData | null>(null);
  const [presupuesto, setPresupuesto] = useState<PresupuestoGeneral | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedApuIndex, setSelectedApuIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Manejador de Archivo IFC ──────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.ifc')) {
      setParseError('El archivo debe tener extensión .ifc');
      return;
    }
    setParseError(null);
    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingStep('Iniciando...');

    try {
      const data = await parseIFCFile(file, (step, pct) => {
        setLoadingStep(step);
        setLoadingProgress(pct);
      });
      const budget = buildPresupuesto(data.materialQuantities);
      setParsedData(data);
      setPresupuesto(budget);
      setView('dashboard');
    } catch (err) {
      setParseError('Error al procesar el IFC: ' + String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleExportExcel = () => {
    if (!parsedData || !presupuesto) return;
    exportToExcel(parsedData.projectName, parsedData.location, presupuesto);
  };

  // ─── Pantalla de Carga ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-10 shadow-2xl w-full max-w-md mx-4 text-center"
        >
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <Box className="absolute inset-0 m-auto w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-100 mb-2">Analizando Modelo IFC</h2>
          <p className="text-sm text-slate-400 mb-6">{loadingStep}</p>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
              animate={{ width: `${loadingProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-3">{loadingProgress}%</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 sticky top-0 z-50 shadow-lg">
        <div className="max-w-screen-xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between gap-4">
          <button
            onClick={() => { setView('upload'); setParsedData(null); setPresupuesto(null); }}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-center group-hover:border-emerald-500/60 transition-colors">
              <Box className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-100 leading-none tracking-tight">CoreBIM Analytics</h1>
              <p className="text-[10px] text-slate-500 leading-none mt-0.5">4D/5D · APU · IFC 4.3</p>
            </div>
          </button>

          {parsedData && (
            <nav className="flex items-center gap-1 overflow-x-auto">
              {([
                { id: 'dashboard', icon: BarChart2, label: 'Dashboard' },
                { id: 'budget', icon: ClipboardList, label: 'Presupuesto' },
                { id: 'apu', icon: Layers, label: 'APUs' },
                { id: 'map', icon: MapPin, label: 'Ubicación' },
                { id: 'json', icon: Package, label: 'Dataset' },
              ] as { id: View; icon: React.ElementType; label: string }[]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setView(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                    view === tab.id
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors ml-2"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Exportar Excel
              </button>
            </nav>
          )}

          {parsedData && (
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 shrink-0">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-slate-400">{parsedData.projectName}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 lg:px-8 py-8">
        <AnimatePresence mode="wait">

          {/* ─── Vista: Upload ─────────────────────────────────────────────── */}
          {view === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center justify-center min-h-[75vh] pb-16"
            >
              <div className="text-center mb-10 max-w-xl">
                <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium px-3 py-1.5 rounded-full mb-4">
                  <Box className="w-3.5 h-3.5" />
                  CoreBIM Analytics · IFC 4.3 buildingSMART
                </div>
                <h2 className="text-4xl font-bold text-slate-100 mb-3 tracking-tight">
                  Analiza tu Modelo BIM
                </h2>
                <p className="text-slate-400 text-lg">
                  Carga tu archivo IFC y obtén automáticamente: presupuesto completo con APUs,
                  ubicación geográfica del proyecto y exportación a Excel profesional.
                </p>
              </div>

              {/* Zona Drag & Drop */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'w-full max-w-2xl border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-200',
                  isDragging
                    ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
                    : 'border-slate-700 hover:border-slate-600 bg-slate-900/50 hover:bg-slate-900'
                )}
              >
                <input ref={fileInputRef} type="file" accept=".ifc" className="hidden" onChange={onFileChange} />
                <div className="flex flex-col items-center gap-4">
                  <div className={cn(
                    'w-16 h-16 rounded-2xl flex items-center justify-center transition-colors',
                    isDragging ? 'bg-emerald-500/20' : 'bg-slate-800'
                  )}>
                    <FileUp className={cn('w-8 h-8', isDragging ? 'text-emerald-400' : 'text-slate-500')} />
                  </div>
                  <div>
                    <p className="text-slate-200 font-semibold text-lg">
                      {isDragging ? 'Suelta el archivo aquí' : 'Arrastra tu archivo .IFC'}
                    </p>
                    <p className="text-slate-500 text-sm mt-1">o haz clic para explorar archivos</p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {['Extrae materiales IFC', 'Genera APUs completos', 'Exporta a Excel', 'Geolocaliza el proyecto'].map(f => (
                      <span key={f} className="bg-slate-800 text-slate-400 text-xs px-2.5 py-1 rounded-full border border-slate-700">{f}</span>
                    ))}
                  </div>
                </div>
              </div>

              {parseError && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm max-w-2xl w-full"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {parseError}
                </motion.div>
              )}

              {/* Capacidades */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10 max-w-2xl w-full">
                {[
                  { icon: Layers, title: 'Motor APU Experto', desc: 'Desglose completo: Materiales, MO, Equipos y Transporte según estándar IFC' },
                  { icon: MapPin, title: 'Geolocalización IFC', desc: 'Extrae RefLatitude/RefLongitude del IfcSite para ubicar tu proyecto en el mapa' },
                  { icon: FileSpreadsheet, title: 'Excel Profesional', desc: 'Genera presupuesto multipestaña: portada, cantidades, partidas y APUs detallados' },
                ].map(card => (
                  <div key={card.title} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <card.icon className="w-5 h-5 text-emerald-400 mb-2" />
                    <h3 className="text-slate-200 font-medium text-sm mb-1">{card.title}</h3>
                    <p className="text-slate-500 text-xs leading-relaxed">{card.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── Vista: Dashboard ──────────────────────────────────────────── */}
          {view === 'dashboard' && parsedData && presupuesto && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {/* Alertas de parseo */}
              {parsedData.parsingWarnings.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-300 text-sm font-medium mb-1">Avisos del análisis IFC:</p>
                    {parsedData.parsingWarnings.map((w, i) => <p key={i} className="text-amber-400/80 text-xs">{w}</p>)}
                  </div>
                </div>
              )}

              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard icon={DollarSign} color="emerald" label="Presupuesto Total" value={COP(presupuesto.totalGeneral)} sub={`Costo Directo: ${COP(presupuesto.costoDirectoTotal)}`} />
                <KpiCard icon={Package} color="blue" label="Materiales IFC" value={`${parsedData.materialQuantities.length}`} sub={`${parsedData.rawElementCount} elementos totales`} />
                <KpiCard icon={Layers} color="purple" label="Partidas APU" value={`${presupuesto.items.length}`} sub="Análisis de precios unitarios" />
                <KpiCard icon={MapPin} color="rose" label="Ubicación" value={parsedData.location.latitude !== null ? '✓ Geolocalizado' : 'Sin coords GPS'} sub={parsedData.location.name} />
              </div>

              {/* Distribución costos + Materiales */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow">
                  <h3 className="font-semibold text-slate-100 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Distribución del Costo Directo
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Materiales', value: presupuesto.subtotalMateriales },
                          { name: 'Mano de Obra', value: presupuesto.subtotalManoDeObra },
                          { name: 'Equipos', value: presupuesto.subtotalEquipos },
                          { name: 'Transporte', value: presupuesto.subtotalTransporte },
                        ]}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                      >
                        {CHART_COLORS.slice(0, 4).map((color, i) => <Cell key={i} fill={color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => COP(v)} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow">
                  <h3 className="font-semibold text-slate-100 mb-4 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-blue-400" />
                    Top Partidas por Costo Total
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={presupuesto.items.slice(0, 8).map(i => ({ name: i.materialRef.substring(0, 18), total: i.precioTotal }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={v => `$${(v / 1000000).toFixed(0)}M`} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number) => COP(v)} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }} />
                      <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Resumen financiero */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="font-semibold text-slate-100 mb-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  Resumen Financiero
                </h3>
                <div className="space-y-2">
                  {[
                    { label: 'Costo Directo - Materiales', value: presupuesto.subtotalMateriales, color: 'text-emerald-400' },
                    { label: 'Costo Directo - Mano de Obra', value: presupuesto.subtotalManoDeObra, color: 'text-blue-400' },
                    { label: 'Costo Directo - Equipos', value: presupuesto.subtotalEquipos, color: 'text-purple-400' },
                    { label: 'Costo Directo - Transporte', value: presupuesto.subtotalTransporte, color: 'text-amber-400' },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-800">
                      <span className="text-slate-400 text-sm">{row.label}</span>
                      <span className={cn('font-mono text-sm font-medium', row.color)}>{COP(row.value)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-300 font-medium text-sm">Costo Directo Total</span>
                    <span className="font-mono text-sm font-semibold text-slate-100">{COP(presupuesto.costoDirectoTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400 text-sm">AIU ({PCT(presupuesto.aiu.porcentaje)})</span>
                    <span className="font-mono text-sm text-slate-400">{COP(presupuesto.aiu.valor)}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 bg-emerald-500/5 rounded-lg px-3 mt-2">
                    <span className="text-emerald-300 font-bold">VALOR TOTAL DEL PRESUPUESTO</span>
                    <span className="font-mono text-emerald-300 font-bold text-lg">{COP(presupuesto.totalGeneral)}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Vista: Presupuesto General ────────────────────────────────── */}
          {view === 'budget' && presupuesto && (
            <motion.div key="budget" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-100">Presupuesto General de Obra</h2>
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Descargar Excel
                </button>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-800/50">
                        <th className="text-left text-xs text-slate-400 font-medium px-4 py-3 w-10">#</th>
                        <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Descripción de la Partida</th>
                        <th className="text-center text-xs text-slate-400 font-medium px-4 py-3 w-16">Und</th>
                        <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 w-24">Cantidad</th>
                        <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 w-36">Precio Unit.</th>
                        <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 w-36">Total</th>
                        <th className="text-center text-xs text-slate-400 font-medium px-4 py-3 w-24">APU</th>
                      </tr>
                    </thead>
                    <tbody>
                      {presupuesto.items.map((item, i) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 text-slate-500 text-xs">{item.item}</td>
                          <td className="px-4 py-3">
                            <div className="text-slate-200 font-medium leading-tight">{item.descripcion}</div>
                            <div className="text-slate-500 text-xs mt-0.5">{item.apu.descripcion}</div>
                          </td>
                          <td className="px-4 py-3 text-center text-slate-400 text-xs">{item.unidad}</td>
                          <td className="px-4 py-3 text-right text-slate-300 font-mono font-medium">{item.cantidad.toLocaleString('es-CO')}</td>
                          <td className="px-4 py-3 text-right text-slate-300 font-mono text-xs">{COP(item.precioUnitario)}</td>
                          <td className="px-4 py-3 text-right text-emerald-400 font-mono font-semibold text-xs">{COP(item.precioTotal)}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => { setSelectedApuIndex(i); setView('apu'); }}
                              className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded flex items-center gap-1 mx-auto transition-colors"
                            >
                              {item.apu.codigo} <ChevronRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-700 bg-slate-800/30">
                        <td colSpan={5} className="px-4 py-3 text-slate-300 font-semibold text-right">Costo Directo Total</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-100 text-sm">{COP(presupuesto.costoDirectoTotal)}</td>
                        <td />
                      </tr>
                      <tr className="bg-slate-800/20">
                        <td colSpan={5} className="px-4 py-3 text-slate-400 text-right text-sm">AIU ({PCT(presupuesto.aiu.porcentaje)})</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-400 text-sm">{COP(presupuesto.aiu.valor)}</td>
                        <td />
                      </tr>
                      <tr className="bg-emerald-900/20">
                        <td colSpan={5} className="px-4 py-4 text-emerald-300 font-bold text-right text-base">VALOR TOTAL DEL PRESUPUESTO</td>
                        <td className="px-4 py-4 text-right font-mono font-bold text-emerald-300 text-base">{COP(presupuesto.totalGeneral)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Vista: APU Detallado ──────────────────────────────────────── */}
          {view === 'apu' && presupuesto && (
            <motion.div key="apu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-xl font-bold text-slate-100">Análisis de Precios Unitarios (APU)</h2>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {presupuesto.items.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedApuIndex(i)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
                        selectedApuIndex === i
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      )}
                    >
                      {item.apu.codigo}
                    </button>
                  ))}
                </div>
              </div>

              {presupuesto.items[selectedApuIndex] && (() => {
                const item = presupuesto.items[selectedApuIndex];
                const apu = item.apu;
                return (
                  <div className="space-y-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                      <div className="flex flex-wrap gap-4 items-start justify-between">
                        <div>
                          <div className="text-xs text-emerald-400 font-mono mb-1">{apu.codigo}</div>
                          <h3 className="text-lg font-semibold text-slate-100">{apu.descripcion}</h3>
                          <p className="text-slate-400 text-sm mt-1">Material IFC: <span className="text-slate-300">{item.materialRef}</span></p>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-500 mb-1">Precio Unitario Total (con AIU)</div>
                          <div className="text-2xl font-bold text-emerald-400 font-mono">{COP(apu.precioUnitarioConAIU)}</div>
                          <div className="text-xs text-slate-500 mt-1">por {apu.unidad}</div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { label: 'Materiales', val: apu.totalMateriales, color: 'emerald' },
                        { label: 'Mano de Obra', val: apu.totalManoDeObra, color: 'blue' },
                        { label: 'Equipos', val: apu.totalEquipos, color: 'purple' },
                        { label: 'Transporte', val: apu.totalTransporte, color: 'amber' },
                      ].map(s => (
                        <div key={s.label} className={`bg-${s.color}-500/5 border border-${s.color}-500/20 rounded-xl p-4`}>
                          <div className="text-xs text-slate-400 mb-1">{s.label}</div>
                          <div className={`text-lg font-bold font-mono text-${s.color}-400`}>{COP(s.val)}</div>
                          <div className="text-xs text-slate-500">{PCT(s.val / apu.precioUnitarioTotal)} del CD</div>
                        </div>
                      ))}
                    </div>

                    {([
                      { title: 'A. Materiales', items: apu.materiales, total: apu.totalMateriales },
                      { title: 'B. Mano de Obra', items: apu.manoDeObra, total: apu.totalManoDeObra },
                      { title: 'C. Equipos y Herramienta', items: apu.equipos, total: apu.totalEquipos },
                      { title: 'D. Transporte', items: apu.transporte, total: apu.totalTransporte },
                    ] as const).map(section => (
                      <div key={section.title} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="bg-slate-800/60 px-4 py-2.5 border-b border-slate-700/50">
                          <h4 className="text-slate-200 font-semibold text-sm">{section.title}</h4>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-800/50">
                              <th className="text-left text-xs text-slate-500 font-medium px-4 py-2">Insumo</th>
                              <th className="text-center text-xs text-slate-500 font-medium px-4 py-2 w-16">Und</th>
                              <th className="text-right text-xs text-slate-500 font-medium px-4 py-2 w-24">Rendim.</th>
                              <th className="text-right text-xs text-slate-500 font-medium px-4 py-2 w-32">Precio Unit.</th>
                              <th className="text-right text-xs text-slate-500 font-medium px-4 py-2 w-32">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.items.map((ins, j) => (
                              <tr key={j} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                                <td className="px-4 py-2.5 text-slate-300">{ins.descripcion}</td>
                                <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{ins.unidad}</td>
                                <td className="px-4 py-2.5 text-right font-mono text-slate-400 text-xs">{ins.rendimiento}</td>
                                <td className="px-4 py-2.5 text-right font-mono text-slate-400 text-xs">{COP(ins.precioUnitario)}</td>
                                <td className="px-4 py-2.5 text-right font-mono font-medium text-slate-200 text-xs">{COP(ins.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-800/30">
                              <td colSpan={4} className="px-4 py-2 text-right text-slate-300 font-semibold text-xs">Total {section.title.split('.')[1]?.trim()}</td>
                              <td className="px-4 py-2 text-right font-mono font-bold text-emerald-400 text-xs">{COP(section.total)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ))}

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Costo Directo (A+B+C+D)</span>
                        <span className="font-mono text-slate-200">{COP(apu.precioUnitarioTotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">AIU ({PCT(apu.aiuPorcentaje)}) — Adm. 12% + Imprevistos 6% + Utilidad 10%</span>
                        <span className="font-mono text-slate-400">{COP(apu.precioUnitarioTotal * apu.aiuPorcentaje)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-700 pt-2">
                        <span className="text-emerald-300 font-bold">PRECIO UNITARIO TOTAL</span>
                        <span className="font-mono font-bold text-emerald-300 text-lg">{COP(apu.precioUnitarioConAIU)} / {apu.unidad}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )}

          {/* ─── Vista: Mapa de Ubicación ──────────────────────────────────── */}
          {view === 'map' && parsedData && (
            <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <h2 className="text-xl font-bold text-slate-100">Ubicación del Proyecto</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                  <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400" /> Datos del IfcSite
                  </h3>
                  {[
                    { label: 'Nombre del Sitio', value: parsedData.location.name },
                    { label: 'Descripción', value: parsedData.location.description || '—' },
                    { label: 'Dirección', value: parsedData.location.address || 'No especificada en IFC' },
                    { label: 'Latitud', value: parsedData.location.latitude !== null ? `${parsedData.location.latitude.toFixed(6)}°` : 'No especificada' },
                    { label: 'Longitud', value: parsedData.location.longitude !== null ? `${parsedData.location.longitude.toFixed(6)}°` : 'No especificada' },
                    { label: 'Elevación', value: parsedData.location.elevation !== null ? `${parsedData.location.elevation.toFixed(1)} msnm` : 'No especificada' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <span className="text-xs text-slate-500">{label}</span>
                      <span className="text-sm text-slate-200 font-medium">{value}</span>
                    </div>
                  ))}
                  {parsedData.location.latitude !== null && parsedData.location.longitude !== null && (
                    <a
                      href={`https://www.google.com/maps?q=${parsedData.location.latitude},${parsedData.location.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-3 py-2 rounded-lg transition-colors w-full justify-center mt-2"
                    >
                      <MapPin className="w-4 h-4" /> Abrir en Google Maps
                    </a>
                  )}
                </div>

                <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[420px] flex items-center justify-center relative">
                  {parsedData.location.latitude !== null && parsedData.location.longitude !== null ? (
                    <iframe
                      title="Mapa de ubicación del proyecto"
                      className="w-full h-full min-h-[420px] border-0"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${parsedData.location.longitude - 0.02},${parsedData.location.latitude - 0.02},${parsedData.location.longitude + 0.02},${parsedData.location.latitude + 0.02}&layer=mapnik&marker=${parsedData.location.latitude},${parsedData.location.longitude}`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-center p-8">
                      <MapPin className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-400 font-medium mb-2">Coordenadas no disponibles</p>
                      <p className="text-slate-500 text-sm max-w-sm">
                        El archivo IFC no contiene coordenadas geográficas en el atributo <code className="bg-slate-800 px-1 rounded text-xs">IfcSite.RefLatitude/RefLongitude</code>.
                        Esto es opcional en el estándar IFC 4.3.
                      </p>
                      <p className="text-slate-500 text-sm mt-3">
                        Para habilitarlo, define estas propiedades en Revit/Archicad antes de exportar el IFC.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Vista: Dataset JSON ───────────────────────────────────────── */}
          {view === 'json' && parsedData && presupuesto && (
            <motion.div key="json" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700/50 flex justify-between items-center">
                  <span className="font-mono text-xs text-slate-400">CoreBIM Output JSON</span>
                  <span className="bg-emerald-500/20 text-emerald-400 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded">IFC → APU → JSON</span>
                </div>
                <div className="p-4 overflow-x-auto max-h-[75vh] overflow-y-auto">
                  <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
                    {JSON.stringify({ projectName: parsedData.projectName, location: parsedData.location, materialQuantities: parsedData.materialQuantities, presupuesto }, null, 2)}
                  </pre>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, color, label, value, sub }: {
  icon: React.ElementType; color: string; label: string; value: string; sub: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow">
      <div className={cn('w-8 h-8 rounded-lg border flex items-center justify-center mb-3', colorMap[color])}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-slate-100 leading-tight">{value}</div>
      <div className="text-xs text-slate-500 mt-1 truncate">{sub}</div>
    </div>
  );
}
