import { IFCBUILDING, IFCBUILDINGSTOREY, IFCPROJECT, IFCSITE } from "web-ifc";
import { IFCViewer } from "../IFCViewer";
import { IFCModel } from "../types";

interface IFCElement {
  Name?: {
    value: string;
  };
  IsDecomposedBy?: any;
  ContainsElements?: any;
  Elevation?: {
    value: number;
  };
}

interface StoreyInfo {
  id: number;
  data: IFCElement;
}

export class SpatialTree {
  private viewer: IFCViewer;

  constructor(viewer: IFCViewer) {
    this.viewer = viewer;
  }

  private createTreeItem(
    label: string,
    icon: string,
    modelID: number,
    expressID: number
  ): HTMLElement {
    const item = document.createElement("div");
    item.className = "tree-item";

    const header = document.createElement("div");
    header.className = "tree-item-header";
    header.dataset.modelId = modelID.toString();
    header.dataset.expressId = expressID.toString();

    const toggle = document.createElement("div");
    toggle.className = "tree-item-toggle";
    toggle.innerHTML = '<i class="fas fa-chevron-right"></i>';

    const iconDiv = document.createElement("div");
    iconDiv.className = "tree-item-icon";
    iconDiv.innerHTML = `<i class="${icon}"></i>`;

    const labelDiv = document.createElement("div");
    labelDiv.className = "tree-item-label";
    labelDiv.textContent = label;
    labelDiv.title = label;

    header.appendChild(toggle);
    header.appendChild(iconDiv);
    header.appendChild(labelDiv);

    const children = document.createElement("div");
    children.className = "tree-item-children";

    item.appendChild(header);
    item.appendChild(children);

    return item;
  }

  public async buildSpatialTree(modelID: number): Promise<void> {
    try {
      console.log("Building spatial tree...");
      const modelId = Array.from(this.viewer.getModels().entries()).find(
        ([_, m]) => m.modelID === modelID
      )?.[0];
      const treeContent = document.getElementById(`model-tree-${modelId}`);
      if (!treeContent) return;

      treeContent.innerHTML = ""; // Clear existing tree

      // Get all IfcProject elements (usually just one)
      const projectLines = await this.viewer.ifcAPI.GetLineIDsWithType(
        modelID,
        IFCPROJECT
      );
      console.log(`Found ${projectLines.size()} project(s)`);

      for (let i = 0; i < projectLines.size(); i++) {
        await this.processProject(modelID, projectLines.get(i), treeContent);
      }

      this.setupTreeItemHandlers(treeContent);
    } catch (error) {
      console.error("Error building spatial tree:", error);
    }
  }

  private async processProject(
    modelID: number,
    projectID: number,
    treeContent: HTMLElement
  ): Promise<void> {
    const project = (await this.viewer.ifcAPI.GetLine(
      modelID,
      projectID,
      true
    )) as IFCElement;
    console.log("Project:", project);

    const projectNode = this.createTreeItem(
      project.Name?.value || "Project",
      "fas fa-building",
      modelID,
      projectID
    );
    treeContent.appendChild(projectNode);
    projectNode.classList.add("expanded");

    await this.processSites(modelID, projectNode);
  }

  private async processSites(
    modelID: number,
    projectNode: HTMLElement
  ): Promise<void> {
    const siteLines = await this.viewer.ifcAPI.GetLineIDsWithType(
      modelID,
      IFCSITE
    );

    for (let j = 0; j < siteLines.size(); j++) {
      const siteID = siteLines.get(j);
      const site = (await this.viewer.ifcAPI.GetLine(
        modelID,
        siteID,
        true
      )) as IFCElement;
      const siteNode = this.createTreeItem(
        site.Name?.value || "Site",
        "fas fa-map-marker-alt",
        modelID,
        siteID
      );

      const children = projectNode.querySelector(".tree-item-children");
      if (children) {
        children.appendChild(siteNode);
        siteNode.classList.add("expanded");
        await this.processBuildings(modelID, siteNode);
      }
    }
  }

  private async processBuildings(
    modelID: number,
    siteNode: HTMLElement
  ): Promise<void> {
    const buildingLines = await this.viewer.ifcAPI.GetLineIDsWithType(
      modelID,
      IFCBUILDING
    );

    for (let k = 0; k < buildingLines.size(); k++) {
      const buildingID = buildingLines.get(k);
      const building = (await this.viewer.ifcAPI.GetLine(
        modelID,
        buildingID,
        true
      )) as IFCElement;
      const buildingNode = this.createTreeItem(
        building.Name?.value || "Building",
        "fas fa-building",
        modelID,
        buildingID
      );

      const children = siteNode.querySelector(".tree-item-children");
      if (children) {
        children.appendChild(buildingNode);
        buildingNode.classList.add("expanded");
        await this.processStoreys(modelID, buildingNode);
      }
    }
  }

  private async processStoreys(
    modelID: number,
    buildingNode: HTMLElement
  ): Promise<void> {
    const storeyLines = await this.viewer.ifcAPI.GetLineIDsWithType(
      modelID,
      IFCBUILDINGSTOREY
    );
    const storeys: StoreyInfo[] = [];

    for (let l = 0; l < storeyLines.size(); l++) {
      const storeyID = storeyLines.get(l);
      const storey = (await this.viewer.ifcAPI.GetLine(
        modelID,
        storeyID,
        true
      )) as IFCElement;
      storeys.push({ id: storeyID, data: storey });
    }

    // Sort storeys by elevation
    storeys.sort((a, b) => {
      const elevA = a.data.Elevation?.value || 0;
      const elevB = b.data.Elevation?.value || 0;
      return elevA - elevB;
    });

    // Add sorted storeys to building
    for (const storey of storeys) {
      const storeyNode = this.createTreeItem(
        storey.data.Name?.value || "Storey",
        "fas fa-layer-group",
        modelID,
        storey.id
      );

      const children = buildingNode.querySelector(".tree-item-children");
      if (children) {
        children.appendChild(storeyNode);
        storeyNode.classList.add("expanded");

        if (storey.data.ContainsElements) {
          await this.processContainment(
            modelID,
            storey.data.ContainsElements,
            storeyNode.querySelector(".tree-item-children") as HTMLElement
          );
        }
      }
    }
  }

  private setupTreeItemHandlers(treeContent: HTMLElement): void {
    const treeItems = treeContent.querySelectorAll(".tree-item-header");
    treeItems.forEach((item) => {
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        const treeItem = item.parentElement;

        if (!treeItem) return;

        // Toggle expansion
        if (
          event.target instanceof Element &&
          event.target.closest(".tree-item-toggle")
        ) {
          treeItem.classList.toggle("expanded");
          const icon = item.querySelector(".tree-item-toggle i");
          if (icon) {
            icon.classList.toggle("fa-chevron-right");
            icon.classList.toggle("fa-chevron-down");
          }
        } else {
          // Handle selection
          const modelID = parseInt(item.dataset.modelId || "0");
          const expressID = parseInt(item.dataset.expressId || "0");

          // Remove previous selection
          const prevSelected = treeContent.querySelector(
            ".tree-item-header.selected"
          );
          if (prevSelected) {
            prevSelected.classList.remove("selected");
          }

          // Add new selection
          item.classList.add("selected");

          // Find and highlight the element in the 3D view
          const object = this.findElementInScene(modelID, expressID);
          if (object) {
            const event = {
              clientX: 0,
              clientY: 0,
              target: object,
              type: "click",
              preventDefault: () => {},
              stopPropagation: () => {},
            } as unknown as MouseEvent;

            this.viewer.picker.handleClick(event);
          }
        }
      });
    });
  }

  private findElementInScene(
    modelID: number,
    expressID: number
  ): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;

    this.viewer.getScene().traverse((object) => {
      if (
        object.userData?.modelID === modelID &&
        object.userData?.expressID === expressID
      ) {
        found = object;
      }
    });

    return found;
  }
}
