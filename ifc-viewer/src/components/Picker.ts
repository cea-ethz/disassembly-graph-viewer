import * as THREE from "three";
import { IFCViewer } from "../IFCViewer";
import { IfcAPI } from "web-ifc/web-ifc-api";

// Added ExtendedIfcAPI to extend IfcAPI with 'properties' member
interface ExtendedIfcAPI extends IfcAPI {
  properties: {
    getItemProperties: (
      modelID: number,
      expressID: number,
      recursive: boolean
    ) => Promise<any>;
    getPropertySets: (
      modelID: number,
      expressID: number,
      recursive: boolean
    ) => Promise<any[]>;
    getMaterialsProperties: (
      modelID: number,
      expressID: number,
      recursive: boolean
    ) => Promise<any[]>;
  };
}

interface IFCPropertySet {
  Name?: { value: string };
  HasProperties?: any[];
  Quantities?: any[];
}

interface IFCMaterial {
  Name?: { value: string };
  Description?: { value: string };
  Category?: string;
  Grade?: string;
  Density?: {
    value: number;
    unit?: {
      Prefix?: string;
      Name?: string;
    };
  };
  ForLayerSet?: {
    MaterialLayers: Array<{
      Material?: { value: number };
      LayerThickness?: { value: number };
      IsVentilated?: boolean;
      Name?: string;
    }>;
    LayerSetName?: string;
  };
}

const IFCRELDEFINESBYPROPERTIES = 4186316022;
const IFCRELASSOCIATESMATERIAL = 4186635038;

export class Picker {
  private viewer: IFCViewer;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  public selectedObject: THREE.Object3D | null;
  private highlightMaterial: THREE.Material;
  private prePickMaterial: THREE.Material;
  private prePickObject: THREE.Object3D | null;
  private originalMaterials: Map<string, THREE.Material | THREE.Material[]>;

  constructor(viewer: IFCViewer) {
    this.viewer = viewer;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedObject = null;
    this.prePickObject = null;
    this.originalMaterials = new Map();

    // Material for selected objects
    this.highlightMaterial = new THREE.MeshPhongMaterial({
      color: 0xff9800,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    });

    // Material for hover effect
    this.prePickMaterial = new THREE.MeshPhongMaterial({
      color: 0x2196f3,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    });
  }

  private findElementGroupByObject(
    object: THREE.Object3D
  ): THREE.Object3D | null {
    let current: THREE.Object3D | null = object;

    while (current && !current.name.startsWith("Element_")) {
      current = current.parent;
    }

    return current;
  }

  private findElementGroupByIDs(
    modelID: number,
    expressID: number
  ): THREE.Object3D | null {
    let elementGroup: THREE.Object3D | null = null;

    this.viewer.getScene().traverse((child) => {
      if (
        child.name.startsWith("Element_") &&
        child.userData?.modelID === modelID &&
        child.userData?.expressID === expressID
      ) {
        elementGroup = child;
      }
    });

    return elementGroup;
  }

  public async selectElementGroupByIDs(modelID: number, expressID: number) {
    let elementGroup = this.findElementGroupByIDs(modelID, expressID);
    await this.selectElementGroup(elementGroup);
  }

  private async selectElementGroup(
    elementGroup: THREE.Object3D | null
  ): Promise<void> {
    if (this.selectedObject) {
      this.resetSelection();
    }

    if (elementGroup) {
      this.selectedObject = elementGroup;
      this.highlightSelection();
      await this.displayProperties(elementGroup);
    }
  }

  public async handleClick(event: MouseEvent): Promise<void> {
    try {
      const intersectedObject = this.getIntersectedObject(event);

      if (intersectedObject) {
        const elementGroup = this.findElementGroupByObject(intersectedObject);

        if (!elementGroup) {
          return;
        }

        await this.selectElementGroup(elementGroup);
      } else {
        // Clicked empty space - clear selection
        await this.selectElementGroup(null);
      }
    } catch (error) {
      console.error("Error in handleClick:", error);
    }
  }

  public handleMouseMove(event: MouseEvent): void {
    const intersectedObject = this.getIntersectedObject(event);

    // Reset previous pre-pick state if it's not the selected object
    if (this.prePickObject && this.prePickObject !== this.selectedObject) {
      this.resetPrePick();
    }

    if (intersectedObject) {
      const elementGroup = this.findElementGroupByObject(intersectedObject);

      if (elementGroup && elementGroup !== this.selectedObject) {
        // Store pre-pick state
        this.prePickObject = elementGroup;
        this.applyPrePickMaterial(elementGroup);
        this.viewer.getContainer().style.cursor = "pointer";
      }
    } else {
      this.resetPrePick();
      this.viewer.getContainer().style.cursor = "default";
    }
  }

  private getIntersectedObject(event: MouseEvent): THREE.Object3D | null {
    const rect = this.viewer.getContainer().getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.viewer.getCamera());

    const meshes: THREE.Mesh[] = [];
    this.viewer.getScene().traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshes.push(child as THREE.Mesh);
      }
    });

    const intersects = this.raycaster.intersectObjects(meshes, false);
    return intersects.length > 0 ? intersects[0].object : null;
  }

  private applyPrePickMaterial(object: THREE.Object3D): void {
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const meshId = mesh.uuid;

        // Store original material if not already stored
        if (!this.originalMaterials.has(meshId)) {
          this.originalMaterials.set(
            meshId,
            Array.isArray(mesh.material) ? [...mesh.material] : mesh.material
          );
        }

        mesh.material = this.prePickMaterial;
      }
    });
  }

  private resetPrePick(): void {
    if (this.prePickObject && this.prePickObject !== this.selectedObject) {
      this.prePickObject.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const originalMaterial = this.originalMaterials.get(mesh.uuid);
          if (originalMaterial && !mesh.userData.isSelected) {
            mesh.material = originalMaterial;
          }
        }
      });
      this.prePickObject = null;
    }
  }

  private highlightSelection(): void {
    if (!this.selectedObject) return;

    this.selectedObject.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const meshId = mesh.uuid;

        // Store original material if not already stored
        if (!this.originalMaterials.has(meshId)) {
          this.originalMaterials.set(
            meshId,
            Array.isArray(mesh.material) ? [...mesh.material] : mesh.material
          );
        }

        mesh.material = this.highlightMaterial;
        mesh.userData.isSelected = true;
      }
    });
  }

  private resetSelection(): void {
    if (!this.selectedObject) return;

    this.selectedObject.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const originalMaterial = this.originalMaterials.get(mesh.uuid);
        if (originalMaterial) {
          mesh.material = originalMaterial;
          delete mesh.userData.isSelected;
        }
      }
    });

    this.selectedObject = null;
  }

  private extractModelAndExpressId(selected: THREE.Object3D): {
    modelID: number;
    expressID: number;
  } {
    const modelID = selected.userData?.modelID ?? null;
    const expressID = selected.userData?.expressID ?? null;

    if (
      modelID === null ||
      expressID === null ||
      modelID === undefined ||
      expressID === undefined
    ) {
      console.warn("Missing IDs:", { modelID, expressID });
      return { modelID: 0, expressID: 0 };
    }

    return { modelID, expressID };
  }

  private async getElementProperties(
    selected: THREE.Object3D
  ): Promise<{ props: any; psets: IFCPropertySet[] }> {
    try {
      const { modelID, expressID } = this.extractModelAndExpressId(selected);
      const ifcAPI = this.viewer.getIfcAPI() as ExtendedIfcAPI;
      const props = await ifcAPI.properties.getItemProperties(
        modelID,
        expressID,
        true
      );
      const psets = await ifcAPI.properties.getPropertySets(
        modelID,
        expressID,
        true
      );
      return { props, psets };
    } catch (error) {
      console.error("Error in getIfcAPIProperties:", error);
      return null;
    }
  }

  public async getGlobalId(selected: THREE.Object3D): Promise<string | null> {
    try {
      const { props } = await this.getElementProperties(selected);
      return props.GlobalId?.value || null;
    } catch (error) {
      console.error("Error in getGlobalId:", error);
      return null;
    }
  }

  public async displayProperties(selected: THREE.Object3D): Promise<void> {
    try {
      const { modelID, expressID } = this.extractModelAndExpressId(selected);
      const { props, psets } = await this.getElementProperties(selected);
      if (!props) {
        console.warn("No properties found");
        return;
      }

      const quantities = await this.getQuantities(modelID, expressID);

      // Format properties for display
      const formattedProps = {
        elementInfo: {
          "IFC Type": props.constructor.name.replace("IFC", "") || "Unknown",
          "Global ID": props.GlobalId?.value || "Unknown",
          Name: props.Name?.value || "Unnamed",
          Description: props.Description?.value || "No description",
          "Object Type": props.ObjectType?.value || "Unknown",
          Tag: props.Tag?.value || "No tag",
          "Express ID": expressID,
          "Model ID": modelID,
        },
        propertysets: psets
          .filter(
            (pset: IFCPropertySet) => pset.Name?.value !== "BaseQuantities"
          )
          .map((pset: IFCPropertySet) => ({
            name: pset.Name?.value || "Unnamed Property Set",
            properties: this.formatPsetProperties(
              pset.HasProperties || pset.Quantities
            ),
          })),
        materials: await this.getMaterials(modelID, expressID),
        quantities: quantities.map((qset: IFCPropertySet) => ({
          name: qset.Name?.value || "Unnamed Quantity Set",
          quantities: this.formatQuantities(qset.Quantities),
        })),
      };

      console.log("Formatted properties:", formattedProps);

      this.viewer.getPropertiesPanel().displayElementProperties(formattedProps);
    } catch (error) {
      console.error("Error getting IFC properties:", error);
    }
  }

  private getPropertyValue(prop: any): any {
    if (prop.NominalValue) {
      return prop.NominalValue.value;
    } else if (prop.Value) {
      return prop.Value.value;
    } else if (prop.EnumValues) {
      return prop.EnumValues.map((v: any) => v.value).join(", ");
    }
    return null;
  }

  private async getPropertySets(
    modelID: number,
    expressID: number
  ): Promise<any[]> {
    const ifcAPI = this.viewer.getIfcAPI() as ExtendedIfcAPI;
    return ifcAPI.properties.getPropertySets(modelID, expressID, true);
  }

  private async getMaterials(
    modelID: number,
    expressID: number
  ): Promise<IFCMaterial[]> {
    const ifcAPI = this.viewer.getIfcAPI() as ExtendedIfcAPI;

    console.groupCollapsed("[DEBUG] Material lookup for element", expressID);

    try {
      // First get material associations
      const associations =
        (await ifcAPI.properties.getMaterialsProperties(
          modelID,
          expressID,
          true
        )) ?? [];
      if (associations.length === 0) {
        console.warn("No material associations returned.");
      }
      console.log("Found associations:", associations);

      // Then get full material definitions
      const materials: IFCMaterial[] = [];

      for (const association of associations) {
        console.log("Processing association:", association);

        // Handle layer set materials
        if (association.ForLayerSet?.MaterialLayers) {
          console.log("Found layer set material");
          for (const layer of association.ForLayerSet.MaterialLayers ?? []) {
            if (layer.Material) {
              let material: IFCMaterial | null = null;
              // If layer.Material.value is a number, fetch material properties
              if (typeof layer.Material.value === "number") {
                material = (await ifcAPI.properties.getItemProperties(
                  modelID,
                  layer.Material.value,
                  true
                )) as IFCMaterial;
              } else {
                // Otherwise, assume layer.Material is already the full material object
                material = layer.Material as IFCMaterial;
              }
              if (material) {
                console.log("Retrieved layer material:", material);
                // Ensure the material has a Name property
                if (!material.Name) {
                  material.Name = { value: "Unknown Material" };
                }
                // Add layer information to the material with properly wrapped layer name
                material.ForLayerSet = {
                  MaterialLayers: [
                    {
                      Material: layer.Material,
                      LayerThickness: layer.LayerThickness,
                      IsVentilated: layer.IsVentilated,
                      Name: { value: layer.Name?.value || "Unnamed Layer" },
                    },
                  ],
                  LayerSetName: association.ForLayerSet.LayerSetName,
                };
                materials.push(material);
                console.log("Material name (layer set):", material.Name?.value);
              } else {
                console.warn(
                  "Failed to retrieve material for layer with Material value:",
                  layer.Material?.value
                );
              }
            }
          }
        }
        // Handle direct material associations
        else if (association.RelatingMaterial?.value) {
          console.log(
            "Fetching direct material ID:",
            association.RelatingMaterial.value
          );
          const material = (await ifcAPI.properties.getItemProperties(
            modelID,
            association.RelatingMaterial.value,
            true
          )) as IFCMaterial;
          if (material) {
            console.log("Retrieved direct material:", material);
            materials.push(material);
            console.log("Material name (direct):", material.Name?.value);
          } else {
            console.warn(
              "Failed to retrieve direct material for value:",
              association.RelatingMaterial.value
            );
          }
        }
      }

      // Log all collected material names
      console.log("All retrieved material names:");
      materials.forEach((mat, idx) => {
        console.log(idx, mat.Name?.value);
      });

      console.groupEnd();
      return materials;
    } catch (error) {
      console.groupEnd();
      console.error("Error retrieving materials:", error);
      return [];
    }
  }

  private async getQuantities(
    modelID: number,
    expressID: number
  ): Promise<any[]> {
    // Use the same getPropertySets but filter for quantities
    const psets = await this.getPropertySets(modelID, expressID);
    return psets.filter((pset) => pset.Quantities);
  }

  public setConnectionMode(active: boolean): void {
    if (active) {
      this.resetSelection();
      this.resetPrePick();
    }
  }

  public clearSelection(): void {
    this.resetSelection();
    this.resetPrePick();
  }

  private formatPsetProperties(
    properties: any[]
  ): Array<{ name: string; value: any }> {
    return (
      properties?.map((prop) => {
        // Handle different property types
        let value;
        if (prop.NominalValue) {
          value = prop.NominalValue.value;
        } else if (prop.EnumValues) {
          value = prop.EnumValues.map((v: any) => v.value).join(", ");
        } else if (prop.Value) {
          value = prop.Value.value;
        } else {
          value = "N/A";
        }

        return {
          name: prop.Name?.value || "Unnamed Property",
          value: value,
          type: prop.constructor.name.replace("IFC", ""),
        };
      }) || []
    );
  }

  private formatMaterialProperties(
    material: any
  ): Array<{ name: string; value: any }> {
    return [
      { name: "Name", value: material.Name?.value || "Unnamed Material" },
      { name: "Category", value: material.Category || "Standard" },
      {
        name: "Description",
        value: material.Description?.value || "No description",
      },
      { name: "Grade", value: material.Grade || "N/A" },
      {
        name: "Density",
        value: material.Density?.value
          ? `${material.Density.value} ${material.Density.unit?.Prefix || ""}${
              material.Density.unit?.Name || "kg/m³"
            }`
          : "N/A",
      },
    ].filter((item) => item.value);
  }

  private formatQuantities(
    quantities: any[]
  ): Array<{ name: string; value: string }> {
    return (quantities || []).map((q) => {
      let value = "";
      if (q.LengthValue) value = `${q.LengthValue.value} m`;
      if (q.AreaValue) value = `${q.AreaValue.value} m²`;
      if (q.VolumeValue) value = `${q.VolumeValue.value} m³`;
      if (q.WeightValue) value = `${q.WeightValue.value} kg`;

      return {
        name: q.Name?.value || "Unnamed Quantity",
        value: value || "N/A",
        type: q.constructor.name.replace("IFC", ""),
      };
    });
  }
}
