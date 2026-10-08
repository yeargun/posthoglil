// Keep observed optimizer work separate from the permissions in a config.
// Analysis visits can count the same allocation on multiple rule rounds.
export function summarizeOptimization(report, objective) {
  const index=['raw','gzip','brotli'].indexOf(objective)
  if(index<0)throw Error(`Unknown objective: ${objective}`)
  const winner=report.artifacts?.[report.winners?.[index]]
  if(!winner)throw Error(`Compiler report has no ${objective} winner`)
  const rules=report.phases_ns?.rules??{}
  return {
    effort:report.javascript_policy?.effort,
    shape:report.shape,
    rules:{
      inlinedCalls:rules.inlined_calls??0,
      scalarizedAllocations:rules.scalarized_allocations??0,
      scalarFields:rules.scalar_fields??0,
      foldedFields:rules.folded_fields??0,
      aggregateVisits:rules.aggregate_site_visits??{},
    },
    search:{
      structuralSearchEnabled:report.javascript_policy?.objective?.walk?.starts??false,
      inventoryReached:report.search?.structural_opportunities?.inventory_reached??false,
      inventoryTruncated:report.search?.structural_opportunities?.inventory_truncated??false,
      proposals:report.search?.proposals??0,
      structures:report.search?.structures??0,
      stop:report.search?.stop??null,
      // The top-level counters do not include protected lower-tier runs.
      protectedCheckpoints:report.search?.terminal?.effort_checkpoints??[],
    },
    selected:{
      propertyMangling:winner.details?.output?.property_mangling??false,
      structuralRewrites:winner.details?.semantic?.rewrites?.length??0,
    },
    seconds:report.total_ns/1e9,
  }
}
