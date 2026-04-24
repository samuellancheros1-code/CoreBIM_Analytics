export interface OutputJson {
  metadata: {
    projectName: string;
    location: string;
    generatedAt: string;
  };
  estimation5D: {
    quantities: Record<string, number>;
    unitPrices: Record<string, number>;
    baseBudget: number;
  };
  control4D: {
    tasks: {
      id: string;
      name: string;
      pertDuration: number;
      variance: number;
    }[];
    expectedProjectDuration: number;
    alerts: {
      taskId: string;
      message: string;
      projectedImpactCost: number;
    }[];
  };
  stressSimulations: {
    baseCurveS: { day: number; cumulativeCost: number }[];
    scenarioA_CurveS: { day: number; cumulativeCost: number }[]; 
    scenarioB_CurveS: { day: number; cumulativeCost: number }[]; 
  };
}

export function generateBIMData(): OutputJson {
  const quantities = [
    { element: 'Movimiento de Tierras', quantity: 15000, unit: 'm3' },
    { element: 'Concreto Estructural', quantity: 3500, unit: 'm3' },
    { element: 'Acero de Refuerzo', quantity: 420000, unit: 'kg' },
    { element: 'Vías (Pavimento)', quantity: 8000, unit: 'm2' }
  ];

  const unitPrices = [
    { element: 'Movimiento de Tierras', price: 25000, unit: 'm3' },
    { element: 'Concreto Estructural', price: 380000, unit: 'm3' },
    { element: 'Acero de Refuerzo', price: 4500, unit: 'kg' },
    { element: 'Vías (Pavimento)', price: 120000, unit: 'm2' }
  ];

  let baseBudget = 0;
  const qMap: Record<string, number> = {};
  const pMap: Record<string, number> = {};
  
  quantities.forEach(q => {
    qMap[q.element] = q.quantity;
    const p = unitPrices.find(up => up.element === q.element)?.price || 0;
    pMap[q.element] = p;
    baseBudget += q.quantity * p;
  });

  const tasks = [
    { id: 'T1', name: 'Movimiento de Tierras', optimistic: 10, probable: 14, pessimistic: 25, currentDelay: 0, baseCost: 15000 * 25000, importedCostRatio: 0.1 },
    { id: 'T2', name: 'Cimentación y Estructura', optimistic: 30, probable: 45, pessimistic: 70, currentDelay: 3, baseCost: (3500 * 380000) + (420000 * 4500), importedCostRatio: 0.4 }, 
    { id: 'T3', name: 'Pavimentación de Vías', optimistic: 15, probable: 20, pessimistic: 35, currentDelay: 0, baseCost: 8000 * 120000, importedCostRatio: 0.2 },
  ];

  const pertTasks = tasks.map(t => {
    const pert = (t.optimistic + 4 * t.probable + t.pessimistic) / 6;
    const variance = Math.pow((t.pessimistic - t.optimistic) / 6, 2);
    return {
      id: t.id,
      name: t.name,
      pertDuration: parseFloat(pert.toFixed(2)),
      variance: parseFloat(variance.toFixed(2))
    };
  });

  const expectedProjectDuration = pertTasks.reduce((sum, t) => sum + t.pertDuration, 0);

  const alerts = tasks
    .filter(t => t.currentDelay > 0)
    .map(t => {
      const impactCost = t.currentDelay * (t.baseCost * 0.005); 
      return {
        taskId: t.id,
        message: `Alerta: Vas ${t.currentDelay} días atrasado en ${t.name}. Impacto proyectado: pérdida de $${impactCost.toLocaleString('es-CO')} en el flujo de caja`,
        projectedImpactCost: impactCost
      };
    });

  const baseCurveS: { day: number; cumulativeCost: number }[] = [];
  const scenarioA_CurveS: { day: number; cumulativeCost: number }[] = [];
  const scenarioB_CurveS: { day: number; cumulativeCost: number }[] = [];

  let cumBase = 0;
  let cumA = 0;
  let cumB = 0;

  let currentDay = 0;
  
  // To avoid too many data points, we can group by day
  tasks.forEach(t => {
    const pertDur = Math.round((t.optimistic + 4 * t.probable + t.pessimistic) / 6);
    const dailyBaseCost = t.baseCost / pertDur;
    
    // Scenario A: 12% Incremento en costos de materiales (general)
    const dailyCostA = dailyBaseCost * 1.12;
    
    // Scenario B: 25% Incremento en insumos importados (Cisne Negro)
    const importedPortion = dailyBaseCost * t.importedCostRatio;
    const localPortion = dailyBaseCost * (1 - t.importedCostRatio);
    const dailyCostB = localPortion + (importedPortion * 1.25);

    for (let i = 1; i <= pertDur; i++) {
      currentDay++;
      cumBase += dailyBaseCost;
      cumA += dailyCostA;
      cumB += dailyCostB;

      baseCurveS.push({ day: currentDay, cumulativeCost: Math.round(cumBase) });
      scenarioA_CurveS.push({ day: currentDay, cumulativeCost: Math.round(cumA) });
      scenarioB_CurveS.push({ day: currentDay, cumulativeCost: Math.round(cumB) });
    }
  });

  return {
    metadata: {
      projectName: "Mega Vía - Naska Infraestructura",
      location: "Colombia",
      generatedAt: new Date().toISOString()
    },
    estimation5D: {
      quantities: qMap,
      unitPrices: pMap,
      baseBudget
    },
    control4D: {
      tasks: pertTasks,
      expectedProjectDuration: parseFloat(expectedProjectDuration.toFixed(2)),
      alerts
    },
    stressSimulations: {
      baseCurveS,
      scenarioA_CurveS,
      scenarioB_CurveS
    }
  };
}
