export class PropertiesPanel {
  private panelId: string;
  private panel!: HTMLElement | null;
  private noSelection!: HTMLElement | null;
  private elementInfo!: HTMLElement | null;
  private attributesList!: HTMLElement | null;
  private propertiesList: HTMLElement | null;

  constructor(panelId: string) {
    this.panelId = panelId;
    this.initializeElements();
  }

  private initializeElements(): void {
    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.findElements());
    } else {
      this.findElements();
    }
  }

  private findElements(): void {
    this.panel = document.querySelector(`#${this.panelId}`);

    if (!this.panel) {
      console.error("Failed to find properties panel");
      return;
    }

    this.noSelection = this.panel.querySelector(".no-selection");
    if (!this.noSelection) {
      console.error(`${this.panelId}: Failed to find '.no-selection'`);
    }

    this.elementInfo = this.panel.querySelector(".element-info");
    if (!this.elementInfo) {
      console.error(`${this.panelId}: Failed to find '.element-info'`);
    }

    this.attributesList = this.panel.querySelector("#element-attributes");
    if (!this.attributesList) {
      console.error(`${this.panelId}: Failed to find '#element-attributes'`);
    }

    this.propertiesList = this.panel.querySelector("#element-properties");
  }

  public setupPropertiesPanel(): void {
    // Toggle properties panel
    const propertiesPanel = this.panel.querySelector(".properties-panel");
    const propertiesToggle = this.panel.querySelector(".properties-toggle");

    if (propertiesPanel && propertiesToggle) {
      propertiesToggle.addEventListener("click", () => {
        propertiesPanel.classList.toggle("collapsed");

        // Adjust settings panel position if it exists
        const settingsPanel = this.panel.querySelector(".settings-panel");
        if (settingsPanel instanceof HTMLElement) {
          if (propertiesPanel.classList.contains("collapsed")) {
            settingsPanel.style.right = "1rem";
          } else {
            settingsPanel.style.right = "calc(300px + 1rem)";
          }
        }
      });
    }
  }

  public displayElementProperties(props: any): void {
    // Verify elements exist
    if (
      !this.panel ||
      !this.noSelection ||
      !this.elementInfo ||
      !this.attributesList
    ) {
      console.error("Missing DOM elements");
    }

    // Enhanced logging for debugging
    // console.groupCollapsed("Raw properties data");
    // console.log("Element Info:", props.elementInfo);
    // console.log("Property Sets:", props.propertysets);
    // console.log("Materials:", props.materials);
    // console.log("Quantities:", props.quantities);
    // console.groupEnd();

    try {
      // Show properties panel
      this.noSelection.style.display = "none";
      this.elementInfo.style.display = "block";
      this.panel.classList.remove("collapsed");

      this.attributesList.innerHTML = "";
      if (props.elementInfo) {
        const infoMap = new Map(Object.entries(props.elementInfo));
        infoMap.forEach((value, key) => {
          this.addPropertyItem(
            this.attributesList!,
            this.formatKey(key),
            value
          );
        });
      }

      if (!this.propertiesList) return;

      this.propertiesList.innerHTML = "";

      if (props.propertysets?.length > 0) {
        const psetContainer = this.createSectionContainer("Property Sets");
        props.propertysets.forEach((pset: any) => {
          this.displayPropertySet(psetContainer, pset);
        });
        this.propertiesList.appendChild(psetContainer);
      }

      if (props.materials?.length > 0) {
        const materialContainer = this.createSectionContainer("Materials");
        props.materials.forEach((material: any) => {
          this.displayMaterial(materialContainer, material);
        });
        this.propertiesList.appendChild(materialContainer);
      }

      if (props.quantities?.length > 0) {
        const quantityContainer = this.createSectionContainer("Quantities");
        props.quantities.forEach((qset: any) => {
          this.displayQuantitySet(quantityContainer, qset);
        });
        this.propertiesList.appendChild(quantityContainer);
      }
    } catch (error) {
      console.error("Error displaying properties:", error);
    }
  }

  private createSectionContainer(title: string): HTMLElement {
    const container = document.createElement("div");
    container.className = "property-group";
    container.innerHTML = `<h4>${title}</h4>`;
    return container;
  }

  private displayPropertySet(container: HTMLElement, pset: any): void {
    const group = document.createElement("div");
    group.className = "property-subgroup";

    if (pset.name) {
      const header = document.createElement("h5");
      header.textContent = pset.name;
      group.appendChild(header);
    }

    if (pset.properties?.length > 0) {
      pset.properties.forEach((prop: any) => {
        this.addPropertyItem(group, prop.name, prop.value, prop.type);
      });
    }

    container.appendChild(group);
  }

  private displayMaterial(container: HTMLElement, material: any): void {
    const materialDiv = document.createElement("div");
    materialDiv.className = "material-group";

    // Display material name if available
    if (material.Name?.value) {
      const header = document.createElement("h5");
      header.textContent = material.Name.value;
      materialDiv.appendChild(header);
    }

    // Check for layer set first
    if (material.ForLayerSet) {
      this.displayMaterialLayerSet(materialDiv, material.ForLayerSet);
    } else {
      // Display basic material properties
      this.addPropertyItem(
        materialDiv,
        "Category",
        material.Category || "Standard"
      );
      this.addPropertyItem(
        materialDiv,
        "Description",
        material.Description?.value || "None"
      );

      if (material.Density?.value) {
        const density = `${material.Density.value} ${
          material.Density.unit?.Prefix || ""
        }${material.Density.unit?.Name || "kg/m³"}`;
        this.addPropertyItem(materialDiv, "Density", density);
      }
    }

    container.appendChild(materialDiv);
  }

  private displayMaterialLayerSet(container: HTMLElement, layerSet: any): void {
    const layers = layerSet.MaterialLayers || [];
    layers.forEach((layer: any, index: number) => {
      const layerDiv = document.createElement("div");
      layerDiv.className = "material-layer";

      const layerHeader = document.createElement("h5");
      layerHeader.textContent = `Layer ${index + 1}: ${
        layer.Name?.value || "Unnamed Layer"
      }`;
      layerDiv.appendChild(layerHeader);

      if (layer.Material?.Name?.value) {
        this.addPropertyItem(layerDiv, "Material", layer.Material.Name.value);
      }
      if (layer.LayerThickness?.value) {
        const thickness = layer.LayerThickness.value * 1000; // Convert to mm
        this.addPropertyItem(
          layerDiv,
          "Thickness",
          `${thickness.toFixed(1)} mm`
        );
      }
      if (layer.IsVentilated !== undefined) {
        this.addPropertyItem(
          layerDiv,
          "Ventilated",
          layer.IsVentilated ? "Yes" : "No"
        );
      }

      container.appendChild(layerDiv);
    });
  }

  private displayQuantitySet(container: HTMLElement, qset: any): void {
    const quantityGroup = document.createElement("div");
    quantityGroup.className = "quantity-group";

    if (qset.name) {
      const header = document.createElement("h5");
      header.textContent = qset.name;
      quantityGroup.appendChild(header);
    }

    if (qset.quantities?.length > 0) {
      qset.quantities.forEach((qty: any) => {
        this.addPropertyItem(quantityGroup, qty.name, qty.value, qty.type);
      });
    }

    container.appendChild(quantityGroup);
  }

  private addPropertyItem(
    container: HTMLElement,
    name: string,
    value: any,
    type?: string
  ): void {
    const item = document.createElement("div");
    item.className = "property-item";

    const typeBadge = type ? `<span class="type-badge">${type}</span>` : "";
    const displayValue = this.formatValue(value);

    item.innerHTML = `
      <div class="property-header">
        <div class="property-name">${name}</div>
        ${typeBadge}
      </div>
      <div class="property-value">${displayValue}</div>
    `;

    container.appendChild(item);
  }

  private formatKey(key: string): string {
    return key.replace(/([A-Z])/g, " $1").trim();
  }

  private formatValue(value: any): string {
    if (typeof value === "number") {
      return Number(value.toFixed(3)).toString();
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return "[Complex Value]";
      }
    }
    return value.toString();
  }

  public clear(): void {
    if (!this.noSelection || !this.elementInfo) return;

    this.noSelection.style.display = "block";
    this.elementInfo.style.display = "none";
  }
}
