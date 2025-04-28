import { Neo4jViewer } from "@/Neo4jViewer";
import { FilterPanel } from "./FilterPanel";

export class Neo4jFilterPanel extends FilterPanel {
  private viewer: Neo4jViewer;
  private prevShouldDisassemblyApply: boolean = false;
  private prevShouldIfcApply: boolean = false;

  constructor(viewer: Neo4jViewer) {
    super("neo4j-filter-panel", "neo4j-properties-panel");
    this.viewer = viewer;
  }

  protected applyFilters(): void {
    console.log("[Neo4jFilterPanel] Applying filters:", this.activeFilters);

    const shouldDisassemblyApply = this.activeFilters.has(
      "Only Disassembly Graph"
    );
    const shouldIfcApply = this.activeFilters.has("Only IFC Graph");

    if (this.prevShouldDisassemblyApply !== shouldDisassemblyApply) {
      this.prevShouldDisassemblyApply = shouldDisassemblyApply;
      this.viewer.toggleOnlyDisassemblyGraphFilter(shouldDisassemblyApply);
    }

    if (this.prevShouldIfcApply !== shouldIfcApply) {
      this.prevShouldIfcApply = shouldIfcApply;
      this.viewer.toggleOnlyIFCGraphFilter(shouldIfcApply);
    }
  }
}
