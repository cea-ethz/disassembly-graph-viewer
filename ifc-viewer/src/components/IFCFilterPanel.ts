import { IFCViewer } from "../IFCViewer";
import { FilterPanel } from "./FilterPanel";

export class IFCFilterPanel extends FilterPanel {
  private viewer: IFCViewer;

  constructor(viewer: IFCViewer) {
    super("ifc-filter-panel", "ifc-properties-panel");
    this.viewer = viewer;
  }

  protected applyFilters(): void {
    console.log("[IFCFilterPanel] Applying filters:", this.activeFilters);

    this.viewer.traverse((object: THREE.Object3D) => {
      try {
        if (object.userData?.type === "element") {
          const type = object.userData.ifcType;
          const visible = this.activeFilters.has(type);
          object.visible = visible;

          object.traverse((child) => {
            if (child.userData?.type === "connection") child.visible = visible;
          });
        } else if (object.userData?.type === "connection") {
          const parent = object.parent;
          if (parent?.userData?.type === "element") {
            object.visible = this.activeFilters.has(parent.userData.ifcType);
          }
        }
      } catch (e) {
        console.error("Error applying filter to object:", object, e);
      }
    });
  }
}
