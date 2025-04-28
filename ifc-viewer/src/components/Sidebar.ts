import * as THREE from "three";
import { IFCViewer } from "../IFCViewer";
import { IFCModel } from "../types";

// Assume a Connection interface is available or define it here
interface Connection {
  sourceId: number;
  targetId: number;
  description: string;
  sourceName: string;
  targetName: string;
}

export class Sidebar {
  private viewer: IFCViewer;

  // This container should be in your sidebar HTML (e.g., a div with id="connections-container")
  private connectionsContainer: HTMLElement;

  constructor(viewer: IFCViewer) {
    this.viewer = viewer;

    // Add custom styles for wider sidebar
    const style = document.createElement("style");
    style.textContent = `
      .models-panel {
        width: 360px !important;  /* Increased from default */
        min-width: 360px !important;
        position: relative; /* To position the collapse button */
        font-family: "Segoe UI", system-ui, sans-serif !important;
      }
      
      .settings-panel {
        width: 360px !important;
        min-width: 360px !important;
        font-family: "Segoe UI", system-ui, sans-serif !important;
      }
      
      .models-panel.collapsed {
        width: 60px !important;
        min-width: 60px !important;
      }
      
      .model-info {
        padding: 8px 12px;
        font-size: 13px;
      }
      
      .sidebar-collapse-btn {
        position: absolute;
        top: 10px;
        right: -25px;
        width: 25px;
        height: 25px;
        border-radius: 50%;
        border: none;
        background: #ccc;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);

    this.setupSettingsPanel();
    this.setupModelsPanel();

    // Initialize the container for connections list
    this.connectionsContainer = document.getElementById(
      "connections-container"
    ) as HTMLElement;
  }

  private setupSettingsPanel(): void {
    // Grid toggle
    const gridToggle = document.getElementById(
      "grid-toggle"
    ) as HTMLInputElement;
    if (gridToggle) {
      gridToggle.addEventListener("change", () => {
        const grid = this.viewer.getGrid();
        if (grid) {
          grid.visible = gridToggle.checked;
        }
      });
    }

    // Axes toggle
    const axesToggle = document.getElementById(
      "axes-toggle"
    ) as HTMLInputElement;
    if (axesToggle) {
      axesToggle.addEventListener("change", () => {
        const axes = this.viewer.getAxes();
        if (axes) {
          axes.visible = axesToggle.checked;
        }
      });
    }

    // Shadows toggle
    const shadowsToggle = document.getElementById(
      "shadows-toggle"
    ) as HTMLInputElement;
    if (shadowsToggle) {
      shadowsToggle.addEventListener("change", () => {
        const renderer = this.viewer.getRenderer();
        renderer.shadowMap.enabled = shadowsToggle.checked;
        this.viewer.getModelMap().forEach((model) => {
          model.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = shadowsToggle.checked;
              child.receiveShadow = shadowsToggle.checked;
            }
          });
        });
      });
    }

    // Opacity slider
    const opacitySlider = document.getElementById(
      "opacity-slider"
    ) as HTMLInputElement;
    if (opacitySlider) {
      opacitySlider.addEventListener("input", () => {
        const opacity = Number(opacitySlider.value) / 100;
        this.viewer.getModelMap().forEach((model) => {
          model.traverse((child: THREE.Object3D) => {
            if (
              (child as THREE.Mesh).isMesh &&
              (child as THREE.Mesh).material
            ) {
              const material = (child as THREE.Mesh).material as THREE.Material;
              if (Array.isArray(material)) {
                material.forEach((m) => {
                  m.opacity = opacity;
                  m.transparent = opacity < 1;
                  m.needsUpdate = true;
                });
              } else {
                material.opacity = opacity;
                material.transparent = opacity < 1;
                material.needsUpdate = true;
              }
            }
          });
        });
      });
    }
  }

  private setupModelsPanel(): void {
    // Attach collapse toggle event if an existing handle is present.
    const modelsPanel = document.querySelector(".models-panel") as HTMLElement;
    if (!modelsPanel) return;

    // Look for an existing collapse toggle button in the panel.
    const collapseBtn = modelsPanel.querySelector(
      ".sidebar-collapse-btn"
    ) as HTMLButtonElement;
    if (collapseBtn) {
      collapseBtn.addEventListener("click", () => {
        if (modelsPanel.classList.contains("collapsed")) {
          modelsPanel.classList.remove("collapsed");
          collapseBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        } else {
          modelsPanel.classList.add("collapsed");
          collapseBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        }
      });
    }
  }

  public createModelListItem(
    modelId: number,
    fileName: string,
    model: IFCModel
  ): void {
    const modelsList = document.getElementById("models-list");
    if (!modelsList) return;

    const modelItem = document.createElement("div");
    modelItem.className = "model-item";
    modelItem.id = `model-${modelId}`;

    const modelHeader = document.createElement("div");
    modelHeader.className = "model-header";

    const modelName = document.createElement("div");
    modelName.className = "model-name";
    modelName.textContent = fileName;

    const modelControls = document.createElement("div");
    modelControls.className = "model-controls";

    // Visibility toggle button
    const visibilityBtn = document.createElement("button");
    visibilityBtn.className = "model-control-btn";
    visibilityBtn.innerHTML = '<i class="fas fa-eye"></i>';
    visibilityBtn.title = "Toggle Visibility";
    visibilityBtn.addEventListener("click", () => {
      model.visible = !model.visible;
      visibilityBtn.innerHTML = model.visible
        ? '<i class="fas fa-eye"></i>'
        : '<i class="fas fa-eye-slash"></i>';
    });

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "model-control-btn";
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.title = "Delete Model";
    deleteBtn.addEventListener("click", async () => {
      this.viewer.getScene().remove(model);
      this.viewer.getModelMap().delete(modelId);
      modelItem.remove();
    });

    modelControls.appendChild(visibilityBtn);
    modelControls.appendChild(deleteBtn);
    modelHeader.appendChild(modelName);
    modelHeader.appendChild(modelControls);
    modelItem.appendChild(modelHeader);

    // Model info section
    const modelInfo = document.createElement("div");
    modelInfo.className = "model-info";

    // Get model information
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    modelInfo.innerHTML = `
      <div>Size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(
      2
    )}</div>
      <div>Center: (${center.x.toFixed(2)}, ${center.y.toFixed(
      2
    )}, ${center.z.toFixed(2)})</div>
    `;

    // Add spatial tree section to model card
    const treeSection = document.createElement("div");
    treeSection.className = "model-tree-section";
    const treeContent = document.createElement("div");
    treeContent.className = "model-tree-content";
    treeContent.id = `model-tree-${modelId}`;
    treeSection.appendChild(treeContent);

    modelItem.appendChild(modelInfo);
    modelItem.appendChild(treeSection);
    modelsList.appendChild(modelItem);
  }

  // New method to group the connections into clusters based on the connecting element IDs.
  private groupConnections(
    connections: Connection[]
  ): Map<string, Connection[]> {
    const groups = new Map<string, Connection[]>();
    connections.forEach((conn) => {
      const key = this.getConnectionKey(conn);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)?.push(conn);
    });
    return groups;
  }

  // Helper method to generate a unique key by sorting the source and target IDs.
  private getConnectionKey(connection: Connection): string {
    const sortedIds = [connection.sourceId, connection.targetId].sort(
      (a, b) => a - b
    );
    return sortedIds.join("-");
  }

  // Updated render method to display grouped (clustered) connections with collapse functionality.
  public renderConnections(connections: Connection[]): void {
    // Clear previous content
    this.connectionsContainer.innerHTML = "";

    // Group connections into clusters
    const groups = this.groupConnections(connections);

    // Sort groups by connection names (alphabetically)
    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      const nameA = `${a[0].sourceName} - ${a[0].targetName}`;
      const nameB = `${b[0].sourceName} - ${b[0].targetName}`;
      return nameA.localeCompare(nameB);
    });

    sortedGroups.forEach((group) => {
      // Create a container for the cluster
      const clusterDiv = document.createElement("div");
      clusterDiv.className = "connection-cluster";

      // Create a header for the cluster that shows connection names and count
      const header = document.createElement("div");
      header.className = "cluster-header";
      header.textContent = `Connection between ${group[0].sourceName} and ${group[0].targetName} (${group.length})`;

      if (group.length > 1) {
        // Only if more than one connection exists (identical names) style header as red and make it clickable
        header.style.backgroundColor = "red";
        header.style.color = "white";
        header.style.cursor = "pointer";
        // Toggle collapse/expand on header click
        header.addEventListener("click", () => {
          const details = clusterDiv.querySelector(
            ".cluster-details"
          ) as HTMLElement;
          if (details) {
            details.style.display =
              details.style.display === "none" ? "block" : "none";
          }
        });
      }

      clusterDiv.appendChild(header);

      // Create a div to hold all connection items for this cluster
      const detailsDiv = document.createElement("div");
      detailsDiv.className = "cluster-details";
      // For clusters of one connection, details are always visible.
      if (group.length === 1) {
        detailsDiv.style.display = "block";
      }

      // Append each connection in this cluster
      group.forEach((conn) => {
        const item = document.createElement("div");
        item.className = "connection-item";
        item.textContent = conn.description;
        detailsDiv.appendChild(item);
      });

      clusterDiv.appendChild(detailsDiv);
      this.connectionsContainer.appendChild(clusterDiv);
    });
  }
}
