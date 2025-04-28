import { IFCViewer } from "./IFCViewer";
import { Neo4jViewer } from "./Neo4jViewer";

// Initialize the viewer when the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const ifcContainer = document.getElementById("ifc-viewer-container");
  if (!ifcContainer) {
    throw new Error("IFC Viewer container not found");
  }

  const neo4jContainer = document.getElementById("neo4j-viewer-container");
  if (!neo4jContainer) {
    throw new Error("Neo4j Viewer container not found");
  }

  // Initiate and connect the viewers
  const neo4jViewer = new Neo4jViewer(neo4jContainer);
  const ifcViewer = new IFCViewer(ifcContainer, neo4jViewer);
  neo4jViewer.setIfcViewer(ifcViewer);

  const input = document.getElementById("file-input") as HTMLInputElement;
  if (!input) {
    throw new Error("File input not found");
  }

  input.addEventListener(
    "change",
    async (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        await ifcViewer.loadIFC(file);
        await neo4jViewer.loadGraph();
      }
    },
    false
  );
});
