/**
 * IFCViewer3D.tsx
 * Renderizador 3D IFC usando web-ifc (ya instalado) + Three.js puro.
 * NO usa IFCLoader ni web-ifc-three.
 * Usa StreamAllMeshes de web-ifc para extraer geometría directamente.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as WebIFC from 'web-ifc';
import {
  RotateCcw, ZoomIn, ZoomOut, Eye, EyeOff,
  Loader2, AlertCircle, Box, Info, X,
} from 'lucide-react';

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

interface SelectedInfo {
  expressId: number;
  name: string;
}

interface IFCViewer3DProps {
  file: File | null;
  externalHighlightExpressId?: number;
}

// Colores por tipo de elemento IFC
const IFC_COLORS: Record<number, number> = {
  [WebIFC.IFCWALL]: 0xd4c5a9,
  [WebIFC.IFCWALLSTANDARDCASE]: 0xd4c5a9,
  [WebIFC.IFCSLAB]: 0x9eb3c2,
  [WebIFC.IFCCOLUMN]: 0x7a9e9f,
  [WebIFC.IFCBEAM]: 0x6b8f71,
  [WebIFC.IFCDOOR]: 0xb8860b,
  [WebIFC.IFCWINDOW]: 0x87ceeb,
  [WebIFC.IFCROOF]: 0xa0522d,
  [WebIFC.IFCSTAIR]: 0xbcaaa4,
  [WebIFC.IFCFOOTING]: 0x808080,
};

export default function IFCViewer3D({ file, externalHighlightExpressId }: IFCViewer3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const meshMapRef = useRef<Map<number, THREE.Mesh>>(new Map());
  const highlightRef = useRef<THREE.Mesh | null>(null);
  const rafRef = useRef<number>(0);
  const apiRef = useRef<WebIFC.IfcAPI | null>(null);
  const modelIDRef = useRef<number>(-1);

  const [loading, setLoading] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  const [loadStep, setLoadStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedInfo | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);

  // ─── Init Three.js scene ──────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 10000);
    camera.position.set(50, 50, 50);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;

    // Luces
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xfff8e7, 1.6);
    sun.position.set(80, 120, 60);
    sun.castShadow = true;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x6688cc, 0x332211, 0.5));

    // Grid
    const grid = new THREE.GridHelper(500, 80, 0x1e293b, 0x1e293b);
    scene.add(grid);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(mount);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ─── Load IFC geometry using web-ifc StreamAllMeshes ──────────────────────
  useEffect(() => {
    if (!file || !sceneRef.current) return;
    const scene = sceneRef.current;

    // Clear previous model
    if (modelGroupRef.current) {
      scene.remove(modelGroupRef.current);
      modelGroupRef.current = null;
    }
    meshMapRef.current.clear();
    if (highlightRef.current) { scene.remove(highlightRef.current); highlightRef.current = null; }
    if (apiRef.current && modelIDRef.current >= 0) {
      try { apiRef.current.CloseModel(modelIDRef.current); } catch (_) {}
    }
    setSelected(null);
    setError(null);
    setModelLoaded(false);
    setLoading(true);
    setLoadPct(5);
    setLoadStep('Inicializando motor IFC...');

    file.arrayBuffer().then(async (buffer) => {
      try {
        // Init web-ifc API
        const api = new WebIFC.IfcAPI();
        api.SetWasmPath('/');
        setLoadPct(15);
        setLoadStep('Cargando WASM...');
        await api.Init();
        apiRef.current = api;

        setLoadPct(25);
        setLoadStep('Abriendo modelo IFC...');
        const modelID = api.OpenModel(new Uint8Array(buffer));
        modelIDRef.current = modelID;

        setLoadPct(35);
        setLoadStep('Extrayendo geometría...');

        const group = new THREE.Group();
        let meshCount = 0;
        const expressIdToMesh = new Map<number, THREE.Mesh>();

        // Stream all mesh geometry from web-ifc
        api.StreamAllMeshes(modelID, (ifcMesh) => {
          const geoms = ifcMesh.geometries;
          const expressId = ifcMesh.expressID;

          for (let i = 0; i < geoms.size(); i++) {
            const pg = geoms.get(i);
            const geomData = api.GetGeometry(modelID, pg.geometryExpressID);

            const rawVerts = api.GetVertexArray(
              geomData.GetVertexData(),
              geomData.GetVertexDataSize()
            );
            const rawIdx = api.GetIndexArray(
              geomData.GetIndexData(),
              geomData.GetIndexDataSize()
            );

            // Interleaved: x,y,z, nx,ny,nz per vertex
            const posCount = rawVerts.length / 2; // 3 pos + 3 norm per vertex = 6 floats
            const positions = new Float32Array(posCount);
            const normals = new Float32Array(posCount);

            for (let j = 0; j < rawVerts.length; j += 6) {
              const k = (j / 6) * 3;
              positions[k]     = rawVerts[j];
              positions[k + 1] = rawVerts[j + 1];
              positions[k + 2] = rawVerts[j + 2];
              normals[k]       = rawVerts[j + 3];
              normals[k + 1]   = rawVerts[j + 4];
              normals[k + 2]   = rawVerts[j + 5];
            }

            const threeGeom = new THREE.BufferGeometry();
            threeGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            threeGeom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            threeGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(rawIdx), 1));

            const c = pg.color;
            const mat = new THREE.MeshLambertMaterial({
              color: new THREE.Color(c.x, c.y, c.z),
              transparent: c.w < 0.99,
              opacity: c.w,
              side: THREE.DoubleSide,
            });

            const mesh = new THREE.Mesh(threeGeom, mat);
            mesh.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            // Store expressId for picking
            (mesh as THREE.Mesh & { expressId: number }).expressId = expressId;

            group.add(mesh);
            if (!expressIdToMesh.has(expressId)) expressIdToMesh.set(expressId, mesh);

            geomData.delete();
            meshCount++;
          }
        });

        meshMapRef.current = expressIdToMesh;
        scene.add(group);
        modelGroupRef.current = group;

        setLoadPct(90);
        setLoadStep(`${meshCount} geometrías cargadas. Centrando cámara...`);

        // Center camera on model
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const d = Math.max(size.x, size.y, size.z) * 1.3;

        if (cameraRef.current && controlsRef.current) {
          cameraRef.current.position.set(center.x + d, center.y + d * 0.7, center.z + d);
          controlsRef.current.target.copy(center);
          controlsRef.current.update();
        }

        setLoadPct(100);
        setLoadStep('¡Modelo listo!');
        setLoading(false);
        setModelLoaded(true);
      } catch (err) {
        console.error(err);
        setError('Error al procesar el IFC: ' + String(err));
        setLoading(false);
      }
    }).catch((err) => {
      setError('Error al leer el archivo: ' + String(err));
      setLoading(false);
    });
  }, [file]);

  // ─── Click → pick element ──────────────────────────────────────────────────
  const handleClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    const mount = mountRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    const api = apiRef.current;
    if (!mount || !camera || !scene || !api || !modelLoaded) return;

    const rect = mount.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const children = modelGroupRef.current ? modelGroupRef.current.children : [];
    const hits = raycaster.intersectObjects(children, false);

    if (!hits.length) {
      clearHighlight(scene);
      setSelected(null);
      return;
    }

    const hitMesh = hits[0].object as THREE.Mesh & { expressId?: number };
    const expressId = hitMesh.expressId;
    if (expressId === undefined) return;

    // Highlight: clone mesh with emissive material
    clearHighlight(scene);
    const hlMat = new THREE.MeshLambertMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.85,
      emissive: new THREE.Color(0x10b981),
      emissiveIntensity: 0.3,
      depthTest: false,
    });
    const hlMesh = new THREE.Mesh(hitMesh.geometry.clone(), hlMat);
    hlMesh.applyMatrix4(hitMesh.matrixWorld);
    hlMesh.renderOrder = 999;
    scene.add(hlMesh);
    highlightRef.current = hlMesh;

    // Get element name from web-ifc
    let name = `Express ID: ${expressId}`;
    try {
      const props = api.GetLine(modelIDRef.current, expressId, false);
      if (props?.Name?.value) name = props.Name.value;
      else if (props?.LongName?.value) name = props.LongName.value;
    } catch (_) {}

    setSelected({ expressId, name });
  }, [modelLoaded]);

  const clearHighlight = (scene: THREE.Scene) => {
    if (highlightRef.current) {
      scene.remove(highlightRef.current);
      highlightRef.current.geometry.dispose();
      highlightRef.current = null;
    }
  };

  // ─── Camera helpers ────────────────────────────────────────────────────────
  const resetCamera = () => {
    if (!modelGroupRef.current || !cameraRef.current || !controlsRef.current) return;
    const box = new THREE.Box3().setFromObject(modelGroupRef.current);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const d = Math.max(size.x, size.y, size.z) * 1.3;
    cameraRef.current.position.set(center.x + d, center.y + d * 0.7, center.z + d);
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  };

  const toggleWireframe = () => {
    if (!modelGroupRef.current) return;
    const nw = !wireframe;
    setWireframe(nw);
    modelGroupRef.current.traverse((child) => {
      const m = child as THREE.Mesh;
      if (m.isMesh && m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => { (mat as THREE.MeshLambertMaterial).wireframe = nw; });
      }
    });
  };

  const zoomStep = (dir: 1 | -1) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const d = cameraRef.current.position.distanceTo(controlsRef.current.target);
    const step = d * 0.15 * dir;
    const forward = new THREE.Vector3()
      .subVectors(controlsRef.current.target, cameraRef.current.position)
      .normalize();
    cameraRef.current.position.addScaledVector(forward, step);
  };

  // ─── External Highlight (Alerta N8N) ───────────────────────────────────────
  useEffect(() => {
    if (!modelLoaded || !sceneRef.current || !apiRef.current) return;
    const scene = sceneRef.current;
    
    if (externalHighlightExpressId === undefined) {
      clearHighlight(scene);
      setSelected(null);
      return;
    }

    const mesh = meshMapRef.current.get(externalHighlightExpressId);
    if (!mesh) return;

    clearHighlight(scene);
    const hlMat = new THREE.MeshLambertMaterial({
      color: 0xef4444, // Rojo para alertas N8N
      transparent: true,
      opacity: 0.9,
      emissive: new THREE.Color(0xef4444),
      emissiveIntensity: 0.5,
      depthTest: false,
    });
    const hlMesh = new THREE.Mesh(mesh.geometry.clone(), hlMat);
    hlMesh.applyMatrix4(mesh.matrixWorld);
    hlMesh.renderOrder = 999;
    scene.add(hlMesh);
    highlightRef.current = hlMesh;

    // Obtener nombre
    let name = `Express ID: ${externalHighlightExpressId}`;
    try {
      const props = apiRef.current.GetLine(modelIDRef.current, externalHighlightExpressId, false);
      if (props?.Name?.value) name = props.Name.value;
      else if (props?.LongName?.value) name = props.LongName.value;
    } catch (_) {}

    setSelected({ expressId: externalHighlightExpressId, name: name + " (ALERTA N8N)" });

    // Focus camera
    const box = new THREE.Box3().setFromObject(hlMesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const d = Math.max(size.x, size.y, size.z) * 2.5;
    
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(center.x + d, center.y + d, center.z + d);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
  }, [externalHighlightExpressId, modelLoaded]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full bg-slate-950 rounded-xl overflow-hidden select-none">
      <div
        ref={mountRef}
        className="w-full h-full"
        style={{ touchAction: 'none' }}
        onClick={handleClick}
      />

      {/* No file */}
      {!file && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 pointer-events-none">
          <div className="w-16 h-16 bg-slate-800/60 border border-slate-700 rounded-2xl flex items-center justify-center mb-4">
            <Box className="w-8 h-8 text-slate-600" />
          </div>
          <p className="text-slate-400 font-medium mb-1">Sin modelo cargado</p>
          <p className="text-slate-600 text-sm">Carga un archivo .IFC para visualizarlo en 3D</p>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-sm z-20">
          <div className="relative w-16 h-16 mb-5">
            <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-t-emerald-400 border-emerald-500/20 rounded-full animate-spin" />
            <Loader2 className="absolute inset-0 m-auto w-6 h-6 text-emerald-400" />
          </div>
          <p className="text-slate-100 font-semibold text-sm mb-1">Renderizando modelo IFC en 3D</p>
          <p className="text-slate-500 text-xs mb-5">{loadStep}</p>
          <div className="w-56 bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${loadPct}%` }}
            />
          </div>
          <p className="text-slate-600 text-xs mt-2">{loadPct}%</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute bottom-4 left-4 right-16 flex items-start gap-2 bg-red-950/80 border border-red-500/40 rounded-xl p-3 z-20 backdrop-blur-sm">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-red-300 text-xs font-semibold mb-0.5">Error de renderizado</p>
            <p className="text-red-400/80 text-[10px] leading-relaxed break-words">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      {modelLoaded && (
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          {([
            { Icon: RotateCcw, action: resetCamera, title: 'Centrar cámara', active: false },
            { Icon: ZoomIn, action: () => zoomStep(1), title: 'Acercar', active: false },
            { Icon: ZoomOut, action: () => zoomStep(-1), title: 'Alejar', active: false },
            { Icon: wireframe ? Eye : EyeOff, action: toggleWireframe, title: wireframe ? 'Vista sólida' : 'Alámbrico', active: wireframe },
          ] as const).map(({ Icon, action, title, active }) => (
            <button
              key={title}
              onClick={action}
              title={title}
              className={cn(
                'w-8 h-8 rounded-lg border flex items-center justify-center transition-all backdrop-blur-sm shadow',
                active
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                  : 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 text-slate-300'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      )}

      {/* Navigation hint */}
      {modelLoaded && !selected && (
        <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 rounded-lg px-3 py-2 text-[10px] text-slate-400 z-10 pointer-events-none leading-5">
          <span className="text-emerald-400 font-semibold">Click</span> — seleccionar elemento<br />
          <span className="text-blue-400 font-semibold">Arrastrar</span> — orbitar &nbsp;·&nbsp;
          <span className="text-purple-400 font-semibold">Scroll</span> — zoom<br />
          <span className="text-amber-400 font-semibold">Clic derecho</span> — pan
        </div>
      )}

      {/* Selected element info panel */}
      {selected && (
        <div className="absolute top-3 right-3 bg-slate-900/95 backdrop-blur-sm border border-emerald-500/30 rounded-xl p-3 z-10 min-w-[190px] max-w-[250px] shadow-2xl">
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 bg-emerald-500/15 border border-emerald-500/30 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <Info className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-emerald-400 text-[10px] font-mono">Express ID #{selected.expressId}</p>
              <p className="text-slate-100 text-xs font-semibold leading-snug mt-0.5 break-words">{selected.name}</p>
            </div>
            <button
              onClick={() => {
                setSelected(null);
                if (sceneRef.current) clearHighlight(sceneRef.current);
              }}
              className="text-slate-600 hover:text-slate-300 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
