import * as THREE from "three";
import { IFCViewer } from "../IFCViewer";
import {
  FastIntersectionDetector,
  IntersectionVisualizer,
} from "../connection-utils";
import { IFCModel, IntersectionResult } from "../types";
import { SnapshotPanel } from "./SnapshotPanel";

interface ElementInfo {
  object: THREE.Object3D;
  modelID: number;
  expressID: number;
}

interface Connection {
  id: string;
  elements: ElementInfo[];
  type: "point" | "line" | "surface";
  measurements: {
    area?: number;
    length?: number;
  };
  geometry: {
    points?: THREE.BufferGeometry;
    lines?: THREE.BufferGeometry;
    surface?: THREE.BufferGeometry;
  };
  visualization: any;
}

interface ConnectionVisualization {
  points?: THREE.Points;
  lines?: THREE.LineSegments;
  surface?: THREE.Mesh;
}

interface ConnectionData {
  elements: ElementInfo[];
  connections: Map<string, Connection>;
}

export class Connections {
  private viewer: IFCViewer;
  private connectionDetector: FastIntersectionDetector | null;
  public connectionVisualizer: IntersectionVisualizer | null = null;
  private elementConnections: Map<number, Set<string>>;
  private connectionVisualizations: Map<string, ConnectionVisualization>;
  private connectionData: ConnectionData | null = null;
  private scene: THREE.Scene;
  private currentConnectionBbox: THREE.Box3 | null = null;
  private snapshotPanel: SnapshotPanel;

  constructor(viewer: IFCViewer) {
    this.viewer = viewer;
    this.connectionDetector = null;
    this.elementConnections = new Map();
    this.connectionVisualizations = new Map();
    this.scene = viewer.getScene();
    this.snapshotPanel = new SnapshotPanel(this.viewer);

    // Setup deselection handler
    this.setupDeselection();

    // Add custom styles
    const style = document.createElement("style");
    style.textContent = `
      .connections-panel {
        position: absolute;
        top: 0;
        right: 0;
        width: 360px; /* Increased from default width */
        height: 100%;
        background: #f8f9fa;
        overflow-y: auto;
        padding: 16px;
        box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
        z-index: 100;
      }

      .summary-export-buttons {
        display: flex;
        gap: 8px;
      }

      .summary-export-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }

      .summary-export-btn:hover {
        background: #f5f5f5;
        border-color: #999;
      }

      .summary-export-btn i {
        font-size: 14px;
      }
    `;
    document.head.appendChild(style);
  }

  public async analyzeConnections(): Promise<void> {
    try {
      // Wait a short time to ensure model is loaded
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Initialize connection detector if not already done
      if (!this.connectionDetector) {
        this.connectionDetector = new FastIntersectionDetector();
      }

      // Create visualizer if not exists
      if (!this.connectionVisualizer) {
        this.connectionVisualizer = new IntersectionVisualizer(
          this.scene,
          this.viewer.getCamera()
        );
      }

      // Get all elements from the scene
      const elements = this.getAllElements();
      if (elements.length === 0) {
        throw new Error(
          "No elements found in scene. Please load a model first."
        );
      }

      console.log(`Found ${elements.length} elements to analyze`);

      // Set model elements semi-transparent
      this.viewer.getModels().forEach((model: IFCModel) => {
        model.traverse((child: THREE.Object3D) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (!mesh.userData.originalMaterial) {
              const material = mesh.material as THREE.Material;
              mesh.userData.originalMaterial = material.clone();
            }
            (mesh.material as THREE.Material).transparent = true;
            (mesh.material as THREE.Material).opacity = 0.3;
            (mesh.material as THREE.Material).depthWrite = false;
            (mesh.material as THREE.Material).needsUpdate = true;
          }
        });
      });

      // Setup detector for each model
      this.viewer.getModels().forEach((model: IFCModel) => {
        this.setupDetectorForModel(model);
      });

      // Analyze connections between elements
      const connections = await this.findConnections(elements);

      // Store connection data
      this.connectionData = {
        elements,
        connections,
      };

      // Visualize connections
      await this.visualizeConnections(connections);

      // Update UI
      this.updateConnectionsUI();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to analyze connections:", errorMessage);
      this.showError(errorMessage);
    }
  }

  private showError(message: string): void {
    const connectionsPanel = document.querySelector(".connections-panel");
    if (!connectionsPanel) return;

    const errorDiv = document.createElement("div");
    errorDiv.className = "connections-error";
    errorDiv.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <span>Failed to analyze connections: ${message}</span>
      </div>
      <button class="retry-button">
        <i class="fas fa-redo"></i>
        Retry Analysis
      </button>
    `;

    // Add retry handler
    const retryButton = errorDiv.querySelector(".retry-button");
    if (retryButton) {
      retryButton.addEventListener("click", () => {
        errorDiv.remove();
        this.analyzeConnections();
      });
    }

    // Clear existing content and show error
    connectionsPanel.innerHTML = "";
    connectionsPanel.appendChild(errorDiv);
  }

  private getAllElements(): THREE.Object3D[] {
    const elements: THREE.Object3D[] = [];
    this.viewer.traverse((object: THREE.Object3D) => {
      // Check both visibility and element type
      if (object.visible && object.userData?.type === "element") {
        elements.push(object);
      }
    });
    return elements;
  }

  private setupDetectorForModel(model: IFCModel): void {
    model.traverse((child: THREE.Object3D) => {
      if (
        this.connectionDetector &&
        child.visible &&
        child.userData?.type === "element"
      ) {
        this.connectionDetector.setupBoundingBoxes(child);
      }
    });
  }

  private async findConnections(
    elements: THREE.Object3D[]
  ): Promise<Map<string, Connection>> {
    const connections = new Map<string, Connection>();

    // Compare each element with every other element
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const element1 = elements[i];
        const element2 = elements[j];

        // Find intersection between the two elements
        const intersection = await this.findIntersection(element1, element2);

        if (intersection) {
          // Create a unique ID for this connection
          const connectionId = `${element1.userData.expressID}-${element2.userData.expressID}`;

          // Create connection object
          const connection: Connection = {
            id: connectionId,
            elements: [
              {
                object: element1,
                modelID: element1.userData.modelID,
                expressID: element1.userData.expressID,
              },
              {
                object: element2,
                modelID: element2.userData.modelID,
                expressID: element2.userData.expressID,
              },
            ],
            type: intersection.type,
            measurements: intersection.measurements,
            geometry: intersection.geometry,
            visualization: null,
          };

          // Store the connection
          connections.set(connectionId, connection);

          // Update element-connection mappings
          this.updateElementConnections(
            element1.userData.expressID,
            element2.userData.expressID,
            connectionId
          );
        }
      }
    }

    return connections;
  }

  private async findIntersection(
    object1: THREE.Object3D,
    object2: THREE.Object3D
  ): Promise<IntersectionResult | null> {
    if (!this.connectionDetector) return null;
    return this.connectionDetector.findIntersection(object1, object2);
  }

  private updateConnectionsUI(): void {
    const connectionsList = document.querySelector(".connections-list");
    if (!connectionsList || !this.connectionData) return;

    // Clear existing content
    connectionsList.innerHTML = "";

    // Create connection type groups with unique connections
    const connectionsByType = {
      surface: [] as Connection[],
      line: [] as Connection[],
      point: [] as Connection[],
    };

    // Group connections by type
    this.connectionData.connections.forEach((connection) => {
      connectionsByType[connection.type].push(connection);
    });

    // Create summary section
    this.createSummarySection(connectionsList, connectionsByType);

    // Create type sections in specific order
    const typeOrder = ["surface", "line", "point"] as const;
    const createdSections = new Set<string>();

    typeOrder.forEach((type) => {
      const connections = connectionsByType[type];
      if (connections.length > 0) {
        this.createTypeSection(
          connectionsList as HTMLElement,
          type,
          connections
        );
        createdSections.add(type);
      }
    });
  }

  private async exportConnectionsCSV(): Promise<void> {
    if (!this.connectionData) return;

    // Create CSV header
    const headers = [
      "Connection Type",
      "Element 1 ID",
      "Element 1 Name",
      "Element 2 ID",
      "Element 2 Name",
      "Measurement Type",
      "Measurement Value",
      "Unit",
    ];

    // Prepare rows
    const rows: string[][] = [];

    for (const connection of this.connectionData.connections.values()) {
      const element1Name = await this.getElementName(
        connection.elements[0].modelID,
        connection.elements[0].expressID
      );
      const element2Name = await this.getElementName(
        connection.elements[1].modelID,
        connection.elements[1].expressID
      );

      let measurementType = "";
      let measurementValue = "";
      let unit = "";

      if (connection.type === "surface" && connection.measurements?.area) {
        measurementType = "Area";
        measurementValue = connection.measurements.area.toFixed(2);
        unit = "m²";
      } else if (
        connection.type === "line" &&
        connection.measurements?.length
      ) {
        measurementType = "Length";
        measurementValue = connection.measurements.length.toFixed(2);
        unit = "m";
      } else if (connection.type === "point") {
        measurementType = "Point";
        measurementValue = "N/A";
        unit = "N/A";
      }

      rows.push([
        connection.type,
        connection.elements[0].expressID.toString(),
        element1Name,
        connection.elements[1].expressID.toString(),
        element2Name,
        measurementType,
        measurementValue,
        unit,
      ]);
    }

    // Convert to CSV string
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    // Create and trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "connections.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private updateElementConnections(
    expressId1: number,
    expressId2: number,
    connectionId: string
  ): void {
    if (!this.elementConnections.has(expressId1)) {
      this.elementConnections.set(expressId1, new Set());
    }
    if (!this.elementConnections.has(expressId2)) {
      this.elementConnections.set(expressId2, new Set());
    }
    this.elementConnections.get(expressId1)?.add(connectionId);
    this.elementConnections.get(expressId2)?.add(connectionId);
  }

  public exitConnectionMode(): void {
    console.log("Exiting connection mode");

    // Reset section box
    this.clearSectionBox();

    // Reset model materials and make them fully opaque
    this.viewer.getModels().forEach((model: IFCModel) => {
      model.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.userData.originalMaterial) {
            mesh.material = mesh.userData.originalMaterial;
            delete mesh.userData.originalMaterial;
          }
          (mesh.material as THREE.Material).transparent = false;
          (mesh.material as THREE.Material).opacity = 1;
          (mesh.material as THREE.Material).depthWrite = true;
          (mesh.material as THREE.Material).needsUpdate = true;
        }
      });
    });

    // Clean up visualizer without moving camera
    if (this.connectionVisualizer) {
      console.log("Clearing connection visualizer");
      this.connectionVisualizer.clear();
      this.connectionVisualizer.setConnectionMode(false);
      // Removed camera reset
    }

    // Clear stored data
    this.connectionData = null;
    this.connectionVisualizations.clear();

    // Clear UI selections
    const connectionItems = document.querySelectorAll(".connection-item");
    connectionItems.forEach((item) => {
      item.classList.remove("selected", "sectioned");
      const sectionBtn = item.querySelector(".section-btn");
      if (sectionBtn) {
        sectionBtn.classList.remove("active");
      }
    });

    // Disable connection mode
    this.viewer.setConnectionMode(false);
    this.connectionVisualizer?.setConnectionMode(false);
  }

  private clearSectionBox(): void {
    this.viewer.setSectionBox(null);

    // Clear sectioned state from all connection items
    const connectionItems = document.querySelectorAll(".connection-item");
    connectionItems.forEach((item) => {
      item.classList.remove("sectioned");
      const sectionBtn = item.querySelector(".section-btn");
      if (sectionBtn) {
        sectionBtn.classList.remove("active");
      }
    });

    this.removeSnapshotButton();
    this.currentConnectionBbox = null;
  }

  // Add this method to handle toolbar interactions
  public handleToolbarAction(action: string): void {
    if (action === "showAll") {
      this.clearSectionBox();
    }
  }

  private async visualizeConnections(
    connections: Map<string, Connection>
  ): Promise<void> {
    if (!this.connectionVisualizer) return;

    this.connectionVisualizer.clear();
    this.connectionVisualizer.setConnectionMode(true);
    this.connectionVisualizations.clear();

    for (const [id, connection] of connections) {
      try {
        if (!connection.geometry) continue;

        const visualization = this.connectionVisualizer.createVisualization({
          id,
          type: connection.type,
          geometry: connection.geometry,
          measurements: connection.measurements,
        });

        if (visualization) {
          this.connectionVisualizations.set(id, visualization);
          connection.visualization = visualization;
        }
      } catch (error) {
        console.error(`Failed to visualize connection ${id}:`, error);
      }
    }
  }

  private createSummarySection(
    container: Element,
    connectionsByType: Record<string, Connection[]>
  ): void {
    // Statistics section
    const summary = document.createElement("div");
    summary.className = "connections-summary";
    summary.style.cssText = `
      padding: 16px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      margin-bottom: 12px;
    `;

    // Create statistics content
    const content = document.createElement("div");
    content.className = "summary-content";
    content.style.cssText = `
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    `;

    const types = [
      {
        type: "surface",
        icon: "square",
        label: "Surface",
        color: this.connectionVisualizer?.colors.surface || "#4CAF50",
      },
      {
        type: "line",
        icon: "minus",
        label: "Line",
        color: this.connectionVisualizer?.colors.line || "#2196F3",
      },
      {
        type: "point",
        icon: "circle",
        label: "Point",
        color: this.connectionVisualizer?.colors.point || "#FFC107",
      },
    ];

    types.forEach(({ type, icon, label, color }) => {
      const count = connectionsByType[type].length;
      const item = document.createElement("div");
      item.className = "summary-item";
      item.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 16px;
        background: ${color}08;
        border: 1px solid ${color}20;
        border-radius: 12px;
        transition: all 0.2s ease;
        cursor: default;
        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px ${color}15;
        }
      `;

      item.innerHTML = `
        <div class="summary-icon" style="
          color: ${color};
          font-size: 24px;
          height: 48px;
          width: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: ${color}15;
          border-radius: 50%;
        ">
          <i class="fas fa-${icon}"></i>
        </div>
        <div class="summary-count" style="
          font-size: 28px;
          font-weight: 600;
          color: #1a1a1a;
          line-height: 1;
        ">${count}</div>
        <div class="summary-label" style="
          color: #666;
          font-size: 14px;
          font-weight: 500;
        ">${label}</div>
      `;
      content.appendChild(item);
    });

    summary.appendChild(content);
    container.appendChild(summary);

    // Export buttons section
    const exportSection = document.createElement("div");
    exportSection.className = "export-section";
    exportSection.style.cssText = `
      padding: 16px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      margin-bottom: 12px;
    `;

    // Common button styles
    const buttonStyles = `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px;
      width: 100%;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-bottom: 8px;
    `;

    // CSV Export button
    const csvExportButton = document.createElement("button");
    csvExportButton.className = "summary-export-btn";
    csvExportButton.style.cssText = `
      ${buttonStyles}
      background: #f0f2f5;
      color: #1a1a1a;
      &:hover {
        background: #e4e6e9;
      }
    `;
    csvExportButton.innerHTML = `
      <i class="fas fa-file-export" style="font-size: 16px;"></i>
      Export CSV
    `;
    csvExportButton.addEventListener("click", () =>
      this.exportConnectionsCSV()
    );

    // IFC5 Export button
    const ifc5ExportButton = document.createElement("button");
    ifc5ExportButton.className = "summary-export-btn";
    ifc5ExportButton.style.cssText = `
      ${buttonStyles}
      background: #1a73e8;
      color: white;
      margin-bottom: 0;
      &:hover {
        background: #1557b0;
      }
    `;
    ifc5ExportButton.innerHTML = `
      <i class="fas fa-file-code" style="font-size: 16px;"></i>
      Export IFC5
    `;
    ifc5ExportButton.addEventListener("click", () => {
      if (this.connectionVisualizer) {
        this.connectionVisualizer.exportToIFC5();
      }
    });

    exportSection.appendChild(csvExportButton);
    exportSection.appendChild(ifc5ExportButton);
    container.appendChild(exportSection);
  }

  private async createTypeSection(
    container: HTMLElement,
    type: string,
    connections: Connection[]
  ): Promise<void> {
    // Group the given connections by a primary element name using normalized names.
    // If a name contains "hollow core slab", any trailing numbers are removed.
    const groups = await this.groupConnectionsByElements(connections);
    // Sort clusters alphabetically by the cluster key.
    const sortedClusters = Array.from(groups.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    const section = document.createElement("div");
    section.className = "connection-type-section";

    // Create a type header for the entire type section.
    const typeHeader = document.createElement("div");
    typeHeader.className = "type-header";
    typeHeader.innerHTML = `
      <div class="type-title">
        <span class="collapse-icon">
          <i class="fas fa-chevron-down"></i>
        </span>
        <span class="type-icon" style="color: ${
          this.connectionVisualizer?.colors[
            type as keyof typeof this.connectionVisualizer.colors
          ]
        }">
          <i class="fas fa-${
            type === "point" ? "circle" : type === "line" ? "minus" : "square"
          }"></i>
        </span>
        <span>${type.charAt(0).toUpperCase() + type.slice(1)} Connections</span>
      </div>
      <span class="type-count">${connections.length}</span>
    `;
    section.appendChild(typeHeader);

    // Enable collapse/expand functionality for the type header.
    typeHeader.addEventListener("click", () => {
      section.classList.toggle("collapsed");
      const icon = typeHeader.querySelector(".collapse-icon i");
      if (icon) {
        icon.classList.toggle("fa-chevron-right");
        icon.classList.toggle("fa-chevron-down");
      }
    });

    const clustersContainer = document.createElement("div");
    clustersContainer.className = "type-content";

    for (const [groupKey, clusterConnections] of sortedClusters) {
      const clusterDiv = document.createElement("div");
      clusterDiv.className = "connection-cluster";

      // Create the cluster header and apply a pastel background based on its key.
      const clusterHeader = document.createElement("div");
      clusterHeader.className = "cluster-header";
      clusterHeader.textContent = `${groupKey} (${clusterConnections.length})`;
      const bgColor = this.getClusterColor(groupKey);
      clusterHeader.style.backgroundColor = bgColor;
      clusterHeader.style.color = "#333"; // dark text for contrast
      clusterHeader.style.cursor = "pointer";
      // Improve UI with padding, margin, border radius, and a smooth transition.
      clusterHeader.style.padding = "8px 12px";
      clusterHeader.style.marginBottom = "4px";
      clusterHeader.style.borderRadius = "4px";
      clusterHeader.style.transition =
        "background-color 0.3s ease, opacity 0.3s ease";
      clusterHeader.addEventListener("click", () => {
        const detailsEl = clusterDiv.querySelector(
          ".cluster-details"
        ) as HTMLElement;
        if (detailsEl) {
          detailsEl.style.display =
            detailsEl.style.display === "none" ? "block" : "none";
        }
      });
      clusterHeader.addEventListener("mouseenter", () => {
        clusterHeader.style.opacity = "0.8";
      });
      clusterHeader.addEventListener("mouseleave", () => {
        clusterHeader.style.opacity = "1";
      });

      clusterDiv.appendChild(clusterHeader);

      const detailsDiv = document.createElement("div");
      detailsDiv.className = "cluster-details";
      detailsDiv.style.display = "block"; // start expanded

      // Create connection items asynchronously for each connection in the cluster.
      const promises = clusterConnections.map((conn) =>
        this.createConnectionItem(conn, type, detailsDiv)
      );
      await Promise.all(promises);

      clusterDiv.appendChild(detailsDiv);
      clustersContainer.appendChild(clusterDiv);
    }

    section.appendChild(clustersContainer);
    container.appendChild(section);
  }

  private async createConnectionItem(
    connection: Connection,
    type: string,
    content: HTMLElement
  ): Promise<void> {
    const item = document.createElement("div");
    item.className = "connection-item";
    item.dataset.connectionId = connection.id;

    // Get element names and truncate if too long
    const element1Name = await this.getElementName(
      connection.elements[0].modelID,
      connection.elements[0].expressID
    );
    const element2Name = await this.getElementName(
      connection.elements[1].modelID,
      connection.elements[1].expressID
    );

    const measurements = connection.measurements;
    let measurementText = "";

    if (type === "surface" && measurements?.area) {
      measurementText = `Area: ${measurements.area.toFixed(2)} m²`;
    } else if (type === "line" && measurements?.length) {
      measurementText = `Length: ${measurements.length.toFixed(2)} m`;
    } else if (type === "point") {
      measurementText = "Point Connection";
    }

    item.innerHTML = `
        <div class="connection-header">
          <div class="connection-info">
            <div class="connection-elements">
            <div class="element-name" title="${element1Name}">${element1Name}</div>
            <div class="connection-arrow">↔</div>
            <div class="element-name" title="${element2Name}">${element2Name}</div>
            </div>
          ${
            measurementText
              ? `<div class="connection-measurement">${measurementText}</div>`
              : ""
          }
        </div>
        <div class="connection-actions">
          <button class="action-btn section-btn" title="Create Section Box">
            <i class="fas fa-cube"></i>
          </button>
          </div>
        </div>
      `;

    // Add click handler for the entire item (zoom)
    item.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent container click from triggering deselection
      if (!(e.target as HTMLElement).closest(".section-btn")) {
        const wasSelected = item.classList.contains("selected");

        // Remove previous selection
        content
          .querySelectorAll(".connection-item")
          .forEach((i) => i.classList.remove("selected"));

        // Toggle selection
        if (!wasSelected) {
          item.classList.add("selected");
          // Reset section box
          this.viewer.setSectionBox(null);
          // Zoom to connection
          this.zoomToConnection(connection);
        } else {
          // Deselect if clicking the same item
          this.deselectAll();
        }
      }
    });

    // Add section box button handler
    const sectionBtn = item.querySelector(".section-btn");
    if (sectionBtn) {
      sectionBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        // Toggle section box
        if (item.classList.contains("sectioned")) {
          this.clearSectionBox();
        } else {
          // Remove section from other items
          content.querySelectorAll(".connection-item").forEach((i) => {
            i.classList.remove("sectioned");
            i.querySelector(".section-btn")?.classList.remove("active");
          });

          // Add section box for this connection
          this.createSectionBoxForConnection(connection);
          item.classList.add("sectioned");
          sectionBtn.classList.add("active");
        }
      });
    }

    content.appendChild(item);
  }

  public createSectionBoxForConnection(connection: Connection): void {
    console.log("Creating section box for connection:", connection.id);
    const visualization = this.connectionVisualizations.get(connection.id);

    if (!visualization) {
      console.warn(`No visualization found for connection ${connection.id}`);
      return;
    }

    // Create bounding box for the connection
    const bbox = new THREE.Box3();
    if (visualization.points) {
      console.log("Adding points to section bbox");
      visualization.points.children.forEach((sphere: THREE.Object3D) => {
        if (sphere instanceof THREE.Mesh) {
          bbox.expandByObject(sphere);
        }
      });
    }
    if (visualization.lines) {
      console.log("Adding lines to section bbox");
      bbox.expandByObject(visualization.lines);
    }
    if (visualization.surface) {
      console.log("Adding surface to section bbox");
      bbox.expandByObject(visualization.surface);
    }

    // Add padding
    const padding = 0.5;
    bbox.min.subScalar(padding);
    bbox.max.addScalar(padding);
    console.log("Final bbox with padding:", bbox);

    // Create section box
    console.log("Setting section box");
    this.viewer.setSectionBox(bbox);

    // Store the current bounding box for snapshot cropping
    this.currentConnectionBbox = bbox;
    // Add snapshot button overlay on canvas
    this.addSnapshotButton();
  }

  private zoomToConnection(connection: Connection): void {
    console.log("Attempting to zoom to connection:", connection.id);
    if (!this.connectionVisualizer) {
      console.warn("No connection visualizer available");
      return;
    }

    const visualization = this.connectionVisualizations.get(connection.id);
    console.log("Found visualization:", visualization ? "yes" : "no");

    if (!visualization) {
      console.warn(`No visualization found for connection ${connection.id}`);
      return;
    }

    // Create bounding box for the connection
    const bbox = new THREE.Box3();

    // Add visualization geometry to bbox
    if (visualization.points) {
      console.log("Adding points to bbox");
      visualization.points.children.forEach((sphere: THREE.Object3D) => {
        if (sphere instanceof THREE.Mesh) {
          bbox.expandByObject(sphere);
        }
      });
    }
    if (visualization.lines) {
      console.log("Adding lines to bbox");
      bbox.expandByObject(visualization.lines);
    }
    if (visualization.surface) {
      console.log("Adding surface to bbox");
      bbox.expandByObject(visualization.surface);
    }

    // Highlight the connection
    this.connectionVisualizer.highlight(visualization);
    if (this.connectionVisualizer.showLabelsGlobal) {
      // this.connectionVisualizer.showLabels(visualization);
      // this.connectionVisualizer.updateLabels();
    }

    // Get bbox center and size
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bbox.getCenter(center);
    bbox.getSize(size);

    // Calculate camera position
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov =
      (this.viewer.getCamera() as THREE.PerspectiveCamera).fov *
      (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / Math.tan(fov / 2));

    // Add padding based on connection type
    const padding =
      connection.type === "surface"
        ? 2.0
        : connection.type === "line"
        ? 1.5
        : 4.0;
    cameraZ *= padding;

    // Calculate offset direction and camera position
    let offsetDirection = new THREE.Vector3(1, 1, 1).normalize();
    let newPosition: THREE.Vector3;

    if (connection.type === "line" && visualization.lines) {
      // For lines, position camera perpendicular to line direction and centered
      const positions = visualization.lines.geometry.getAttribute("position");
      if (positions && positions.count >= 2) {
        // Get line start and end points
        const start = new THREE.Vector3();
        const end = new THREE.Vector3();
        start.fromBufferAttribute(positions, 0);
        end.fromBufferAttribute(positions, positions.count - 1);

        // Calculate line direction
        const lineDirection = end.clone().sub(start).normalize();

        // Calculate perpendicular vector (cross with up vector)
        offsetDirection = lineDirection
          .clone()
          .cross(new THREE.Vector3(0, 1, 0))
          .normalize();

        // If the cross product is zero (line is vertical), use another direction
        if (offsetDirection.lengthSq() < 0.1) {
          offsetDirection = lineDirection
            .clone()
            .cross(new THREE.Vector3(1, 0, 0))
            .normalize();
        }

        // Position camera to see full line length
        const lineLength = end.distanceTo(start);
        cameraZ = Math.max(cameraZ, lineLength * 0.75); // Ensure we can see full line

        // Calculate camera position perpendicular to line
        newPosition = center
          .clone()
          .add(offsetDirection.multiplyScalar(cameraZ));
      } else {
        newPosition = center
          .clone()
          .add(offsetDirection.multiplyScalar(cameraZ));
      }
    } else if (connection.type === "surface" && visualization.surface) {
      // Use surface normal for surfaces
      const normalAttribute =
        visualization.surface.geometry.getAttribute("normal");
      if (normalAttribute) {
        offsetDirection = new THREE.Vector3();
        offsetDirection.fromBufferAttribute(normalAttribute, 0);
        offsetDirection.transformDirection(visualization.surface.matrixWorld);
      }
      newPosition = center.clone().add(offsetDirection.multiplyScalar(cameraZ));
    } else {
      // Default position for points
      newPosition = center.clone().add(offsetDirection.multiplyScalar(cameraZ));
    }

    // Animate camera movement
    const currentPosition = this.viewer.getCamera().position.clone();
    const currentTarget = this.viewer.getControls().target.clone();

    this.animateCamera(
      currentPosition,
      newPosition,
      currentTarget,
      center,
      1000 // 1 second duration
    );

    // Unhighlight other connections
    this.connectionVisualizations.forEach((vis, id) => {
      if (id !== connection.id) {
        this.connectionVisualizer?.unhighlight(vis);
      }
    });
  }

  private animateCamera(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    startTarget: THREE.Vector3,
    endTarget: THREE.Vector3,
    duration: number
  ): void {
    const startTime = performance.now();

    const animate = (currentTime: number): void => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease function (cubic)
      const ease =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      // Update camera position
      this.viewer.getCamera().position.lerpVectors(startPos, endPos, ease);

      // Update controls target
      this.viewer
        .getControls()
        .target.lerpVectors(startTarget, endTarget, ease);
      this.viewer.getControls().update();

      // Continue animation if not complete
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  private async getElementName(
    modelID: number,
    expressID: number
  ): Promise<string> {
    try {
      if (!this.viewer.getIfcAPI()) return `Element ${expressID}`;

      const properties = await this.viewer
        .getIfcAPI()
        .properties.getItemProperties(modelID, expressID);
      return properties?.Name?.value || `Element ${expressID}`;
    } catch (error) {
      console.warn(`Failed to get name for element ${expressID}:`, error);
      return `Element ${expressID}`;
    }
  }

  // Add click handler to deselect when clicking empty space
  private setupDeselection(): void {
    console.log("Setting up deselection handler");
    const container = this.viewer.getContainer();
    container.addEventListener("click", (e: MouseEvent) => {
      console.log("Container clicked, target:", e.target);
    });
  }

  private deselectAll(): void {
    // Clear all selections
    const connectionItems = document.querySelectorAll(".connection-item");
    connectionItems.forEach((item) => {
      item.classList.remove("selected");
    });

    // Unhighlight all visualizations
    if (this.connectionVisualizer) {
      this.connectionVisualizations.forEach((vis) => {
        this.connectionVisualizer?.unhighlight(vis);
      });
    }
  }

  private addSnapshotButton(): void {
    const container = this.viewer.getContainer();
    if (container.querySelector("#snapshot-btn")) return;
    const btn = document.createElement("button");
    btn.id = "snapshot-btn";
    btn.innerText = "Snapshot";
    btn.style.position = "absolute";
    btn.style.top = "10px";
    btn.style.left = "370px"; // Position next to sidebar (360px width + 10px margin)
    btn.style.zIndex = "1000";
    btn.style.padding = "8px 12px";
    btn.style.backgroundColor = "#ffffff";
    btn.style.border = "1px solid #e0e0e0";
    btn.style.borderRadius = "4px";
    btn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => {
      this.takeSnapshot();
    });
    container.appendChild(btn);
  }

  private removeSnapshotButton(): void {
    const container = this.viewer.getContainer();
    const btn = container.querySelector("#snapshot-btn");
    if (btn) {
      container.removeChild(btn);
    }
  }

  private async takeSnapshot(): Promise<void> {
    if (!this.currentConnectionBbox) {
      alert("No connection bounding box active.");
      return;
    }

    const mainRenderer = this.viewer.getRenderer();
    const scene = this.viewer.getScene();

    // Create a separate renderer for snapshots
    const snapshotRenderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    snapshotRenderer.setPixelRatio(window.devicePixelRatio);

    // Hide snapshot renderer's canvas
    snapshotRenderer.domElement.style.display = "none";
    document.body.appendChild(snapshotRenderer.domElement);

    // Hide connection geometries for snapshot generation
    const connectionObjects: THREE.Object3D[] = [];
    this.connectionVisualizations.forEach((vis) => {
      if (vis.points) connectionObjects.push(vis.points);
      if (vis.lines) connectionObjects.push(vis.lines);
      if (vis.surface) connectionObjects.push(vis.surface);
    });
    const originalVisibility = connectionObjects.map((obj) => obj.visible);
    connectionObjects.forEach((obj) => (obj.visible = false));

    try {
      // Compute center and size of the section box
      const bbox = this.currentConnectionBbox;
      const center = bbox.getCenter(new THREE.Vector3());
      const size = bbox.getSize(new THREE.Vector3());

      // Add padding to the size
      const padding = 0.5; // 50% padding
      size.multiplyScalar(1 + padding);

      // Set desired snapshot resolution while preserving aspect ratio
      const snapshotHeight = 600;
      const snapshotWidth = snapshotHeight * (size.x / size.y);

      // Set up orthographic camera for snapshots
      const left = -size.x / 2;
      const right = size.x / 2;
      const top = size.y / 2;
      const bottom = -size.y / 2;
      const near = 0.1;
      const far = 1000;
      const offsetDistance = size.length();

      // Define view directions including axonometric
      const viewDirections = [
        new THREE.Vector3(0, 1, 0), // Top view
        new THREE.Vector3(0, 0, 1), // Front view
        new THREE.Vector3(1, 0, 0), // Side view
        new THREE.Vector3(1, 1, 1).normalize(), // Axonometric view
      ];

      const viewLabels = [
        "Top View",
        "Front View",
        "Side View",
        "Axonometric View",
      ];

      // Take snapshots from different angles
      const snapshots: string[] = [];

      for (const direction of viewDirections) {
        const orthoCamera = new THREE.OrthographicCamera(
          left,
          right,
          top,
          bottom,
          near,
          far
        );

        // Position camera
        orthoCamera.position
          .copy(center)
          .add(direction.multiplyScalar(offsetDistance));
        orthoCamera.lookAt(center);
        orthoCamera.up.set(0, 1, 0);
        orthoCamera.updateProjectionMatrix();

        // Set renderer size and take snapshot
        snapshotRenderer.setSize(snapshotWidth, snapshotHeight);
        snapshotRenderer.render(scene, orthoCamera);
        const dataURL = snapshotRenderer.domElement.toDataURL(
          "image/jpeg",
          1.0
        );
        snapshots.push(dataURL);
      }

      // Constants for padding and spacing
      const imagePadding = 20; // Padding between images
      const labelHeight = 40; // Height reserved for labels

      // Create composite image for panel view (vertical)
      const compositeCanvas = document.createElement("canvas");
      compositeCanvas.width = snapshotWidth + imagePadding * 2; // Add padding on sides
      compositeCanvas.height =
        (snapshotHeight + imagePadding) * snapshots.length + imagePadding; // Add padding between images
      const ctx = compositeCanvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      // Set white background for panel view
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);

      // Load and draw snapshots vertically with labels (for panel view)
      let y = imagePadding; // Start with padding
      for (let i = 0; i < snapshots.length; i++) {
        // Add label
        ctx.font = "bold 20px Arial";
        ctx.fillStyle = "#000000";
        ctx.textAlign = "left";
        ctx.fillText(viewLabels[i], imagePadding + 10, y + 25);

        // Draw snapshot
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = snapshots[i];
        });

        ctx.drawImage(
          img,
          imagePadding,
          y + labelHeight,
          snapshotWidth,
          snapshotHeight - labelHeight
        );
        y += snapshotHeight + imagePadding; // Add padding after each image
      }

      // Create horizontal composite for enlarged view
      const enlargedCanvas = document.createElement("canvas");
      enlargedCanvas.width =
        (snapshotWidth + imagePadding) * snapshots.length + imagePadding; // Add padding between and around images
      enlargedCanvas.height = snapshotHeight + imagePadding * 2; // Add padding top and bottom
      const enlargedCtx = enlargedCanvas.getContext("2d");

      if (!enlargedCtx) {
        throw new Error("Failed to get enlarged canvas context");
      }

      // Set white background for enlarged view
      enlargedCtx.fillStyle = "#ffffff";
      enlargedCtx.fillRect(0, 0, enlargedCanvas.width, enlargedCanvas.height);

      // Load and draw snapshots horizontally with labels (for enlarged view)
      let x = imagePadding; // Start with padding
      for (let i = 0; i < snapshots.length; i++) {
        // Add label
        enlargedCtx.font = "bold 20px Arial";
        enlargedCtx.fillStyle = "#000000";
        enlargedCtx.textAlign = "center";
        enlargedCtx.fillText(
          viewLabels[i],
          x + snapshotWidth / 2,
          imagePadding + 25
        );

        // Draw snapshot
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = snapshots[i];
        });

        enlargedCtx.drawImage(
          img,
          x,
          imagePadding + labelHeight,
          snapshotWidth,
          snapshotHeight - labelHeight
        );
        x += snapshotWidth + imagePadding; // Add padding after each image
      }

      // Get data URLs for both layouts
      const verticalCompositeDataURL = compositeCanvas.toDataURL(
        "image/jpeg",
        1.0
      );
      const horizontalCompositeDataURL = enlargedCanvas.toDataURL(
        "image/jpeg",
        1.0
      );

      // Show the vertical composite in the panel, but use horizontal for enlarged view
      this.snapshotPanel.show(
        verticalCompositeDataURL,
        horizontalCompositeDataURL
      );
    } finally {
      // Restore connection geometries visibility
      connectionObjects.forEach((obj, idx) => {
        obj.visible = originalVisibility[idx];
      });

      // Clean up snapshot renderer
      document.body.removeChild(snapshotRenderer.domElement);
      snapshotRenderer.dispose();

      // Force render with main renderer to restore view
      mainRenderer.render(scene, this.viewer.getCamera());
    }
  }

  // Group the given connections by a primary element name using normalized names.
  // If a name contains "hollow core slab", any trailing numbers are removed.
  private normalizeName(name: string): string {
    if (name.toLowerCase().includes("hollow core slab")) {
      // Remove any trailing numbers (with preceding whitespace)
      return name.replace(/\s+\d+$/, "").trim();
    }
    return name.trim();
  }

  private async groupConnectionsByElements(
    connections: Connection[]
  ): Promise<Map<string, Connection[]>> {
    const groups = new Map<string, Connection[]>();
    for (const conn of connections) {
      // Use the asynchronous getElementName to retrieve the proper display name.
      const name1 = await this.getElementName(
        conn.elements[0].modelID,
        conn.elements[0].expressID
      );
      const name2 = await this.getElementName(
        conn.elements[1].modelID,
        conn.elements[1].expressID
      );
      const normName1 = this.normalizeName(name1);
      const normName2 = this.normalizeName(name2);
      // Use the normalized names and sort them so that the order doesn't matter.
      const key = [normName1, normName2].sort().join(" ↔ ");
      console.log("Group key:", key);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)?.push(conn);
    }
    return groups;
  }

  // Compute a pastel color (soft tone) for a given string key.
  private getClusterColor(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = key.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    // Low saturation (50%) and high lightness (90%) gives a pastel tone.
    return `hsl(${hue}, 50%, 90%)`;
  }
}
