import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { IfcAPI } from "web-ifc/web-ifc-api";

import { FloatingMenu } from "./components/FloatingMenu";
import { Picker } from "./components/Picker";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { Sidebar } from "./components/Sidebar";
import { SpatialTree } from "./components/SpatialTree";
import { GeometryData, IFCModel, PlacedGeometry } from "./types";
import { IFCFilterPanel } from "./components/IFCFilterPanel";
import { Neo4jViewer } from "./Neo4jViewer";

export class IFCViewer {
  private container: HTMLElement;
  private loadingOverlay: HTMLElement | null;
  private models: Map<number, IFCModel>;
  private modelCounter: number;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private ifcAPI: IfcAPI;
  private grid: THREE.GridHelper;
  private axes: THREE.AxesHelper;
  private picker: Picker;
  private propertiesPanel: PropertiesPanel;
  private spatialTree: SpatialTree;
  private meshCounter: number;
  private sectionBoxHelper: THREE.LineSegments | null;
  private isConnectionMode: boolean = false;
  private floatingMenu: FloatingMenu;
  private sidebar: Sidebar;
  private filterPanel: IFCFilterPanel;
  private pdfImagePaths: string[];
  private pdfPreviewWindow: HTMLDivElement;
  private lastHoveredModel: IFCModel | null = null;
  private neo4jViewer: Neo4jViewer;

  constructor(container: HTMLElement, neo4jViewer: Neo4jViewer) {
    this.container = container;
    this.loadingOverlay = null;
    this.models = new Map();
    this.modelCounter = 0;
    this.meshCounter = 0;
    this.sectionBoxHelper = null;
    this.neo4jViewer = neo4jViewer;

    // Initialize Three.js components
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Initialize IFC API
    this.ifcAPI = new IfcAPI();

    // Initialize scene helpers
    this.grid = new THREE.GridHelper(50, 50);
    this.axes = new THREE.AxesHelper(5);

    // Initialize UI components
    this.picker = new Picker(this);
    this.propertiesPanel = new PropertiesPanel("ifc-properties-panel");
    this.floatingMenu = new FloatingMenu(this);
    this.sidebar = new Sidebar(this);
    this.spatialTree = new SpatialTree(this);
    this.filterPanel = new IFCFilterPanel(this);

    // Initialize PDF preview window and PNG image paths.
    this.pdfImagePaths = ["/page_4_name_IW 3.1.png", "/page_3_name_AW 1.1.png"];
    this.pdfPreviewWindow = document.createElement("div");
    this.pdfPreviewWindow.style.position = "absolute";
    this.pdfPreviewWindow.style.background = "rgba(255, 255, 255, 0.9)";
    this.pdfPreviewWindow.style.border = "1px solid #ccc";
    this.pdfPreviewWindow.style.padding = "10px";
    this.pdfPreviewWindow.style.display = "none";
    this.pdfPreviewWindow.style.zIndex = "1000";
    this.pdfPreviewWindow.style.maxWidth = "400px";
    this.pdfPreviewWindow.style.boxShadow = "2px 2px 6px rgba(0,0,0,0.3)";
    this.container.appendChild(this.pdfPreviewWindow);

    // Start initialization
    this.init();
  }

  private showLoading(): void {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.add("active");
    }
  }

  private hideLoading(): void {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.remove("active");
    }
  }

  private async init(): Promise<void> {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.setup());
    } else {
      await this.setup();
    }
  }

  private async setup(): Promise<void> {
    try {
      this.loadingOverlay = document.querySelector(".loading-overlay");
      this.showLoading();

      // Initialize scene
      this.scene.background = new THREE.Color(0xf0f0f0);

      // Setup camera
      this.camera.position.set(10, 10, 10);
      this.camera.lookAt(0, 0, 0);

      // Setup renderer
      this.renderer.setSize(window.innerWidth, window.innerHeight / 2);
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.renderer.shadowMap.enabled = false;
      this.container.appendChild(this.renderer.domElement);

      // Setup controls
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;

      // Setup grid and axes
      this.grid.visible = false;
      this.scene.add(this.grid);

      this.axes.visible = false;
      this.scene.add(this.axes);

      // Setup lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      this.scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(5, 10, 5);
      directionalLight.castShadow = true;
      this.scene.add(directionalLight);

      // Initialize IFC API
      await this.ifcAPI.Init();

      // Setup UI components
      this.propertiesPanel.setupPropertiesPanel();
      this.setupPicking();
      this.setupKeyboardShortcuts();
      this.setupPanels();
      this.setupFloatingMenu();

      // Setup window resize handler
      window.addEventListener("resize", () => this.onWindowResize());

      // Start animation loop
      this.animate();

      console.log("IFC viewer initialized successfully");
    } catch (error) {
      console.error("Error initializing IFC viewer:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.stack);
      }
    } finally {
      this.hideLoading();
    }
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
  public async loadIFC(file: File): Promise<void> {
    try {
      console.log("Starting to load IFC file:", file.name);
      this.showLoading();

      const data = await file.arrayBuffer();
      console.log("File read as ArrayBuffer");

      const modelID = this.ifcAPI.OpenModel(new Uint8Array(data), {
        COORDINATE_TO_ORIGIN: true,
        USE_FAST_BOOLS: true,
      });
      console.log("Model opened with ID:", modelID);

      const model = new THREE.Group() as IFCModel;
      model.name = file.name;
      model.modelID = modelID;
      model.userData.viewerModel = true;

      let elementCount = 0;
      let geometryCount = 0;

      const ifcTypes: Set<string> = new Set();
      this.ifcAPI.StreamAllMeshes(modelID, (mesh: any) => {
        const placedGeometries = mesh.geometries;
        const expressID = mesh.expressID;

        // Get the IFC type name
        const typeCode = this.ifcAPI.GetLineType(modelID, expressID);
        const ifcType = this.ifcAPI.GetNameFromTypeCode(typeCode);
        if (ifcType) ifcTypes.add(ifcType);
        console.log(`Processing element ${expressID} of type ${ifcType}`);

        const elementGroup = this.createElementGroup(
          expressID,
          modelID,
          ifcType
        );

        for (let i = 0; i < placedGeometries.size(); i++) {
          const placedGeometry = placedGeometries.get(i) as PlacedGeometry;

          try {
            const geometry = this.getBufferGeometry(modelID, placedGeometry);
            geometryCount++;

            const matrix = new THREE.Matrix4();
            matrix.fromArray(placedGeometry.flatTransformation);
            geometry.applyMatrix4(matrix);

            const color = placedGeometry.color;
            const material = new THREE.MeshPhongMaterial({
              color: new THREE.Color(color.x, color.y, color.z),
              opacity: color.w,
              transparent: color.w !== 1,
              side: THREE.DoubleSide,
            });

            const mesh = this.createMesh(
              geometry,
              material,
              expressID,
              modelID
            );

            elementGroup.add(mesh);
          } catch (error) {
            console.error(
              `Error processing geometry ${i} for element ${expressID}:`,
              error
            );
          }
        }

        model.add(elementGroup);
        elementCount++;
      });
      console.log(
        `Processed ${elementCount} elements with ${geometryCount} geometries`
      );

      this.scene.add(model);
      const modelId = ++this.modelCounter;
      this.models.set(modelId, model);

      this.createModelListItem(modelId, file.name, model);
      await this.spatialTree.buildSpatialTree(modelID);

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      console.log("Model bounds:", {
        size: size.toArray(),
        center: center.toArray(),
      });

      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = this.camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;

      this.camera.position.set(
        center.x + cameraZ * 0.5,
        center.y + cameraZ * 0.5,
        center.z + cameraZ
      );
      this.controls.target.copy(center);
      this.camera.lookAt(center);
      this.controls.update();

      console.log("IFC file loaded successfully");

      this.filterPanel.updateFilters(
        new Map(Array.from(ifcTypes).map((type) => [type, true]))
      );
    } catch (error) {
      console.error("Error loading IFC file:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.stack);
      }
    } finally {
      this.hideLoading();
    }
  }

  private getBufferGeometry(
    modelID: number,
    placedGeometry: PlacedGeometry
  ): THREE.BufferGeometry {
    const geometry = this.ifcAPI.GetGeometry(
      modelID,
      placedGeometry.geometryExpressID
    ) as GeometryData;

    const verts = this.ifcAPI.GetVertexArray(
      geometry.GetVertexData(),
      geometry.GetVertexDataSize()
    );
    const indices = this.ifcAPI.GetIndexArray(
      geometry.GetIndexData(),
      geometry.GetIndexDataSize()
    );

    const bufferGeometry = new THREE.BufferGeometry();
    const posFloats = new Float32Array(verts.length / 2);
    const normFloats = new Float32Array(verts.length / 2);

    for (let i = 0; i < verts.length; i += 6) {
      posFloats[i / 2] = verts[i];
      posFloats[i / 2 + 1] = verts[i + 1];
      posFloats[i / 2 + 2] = verts[i + 2];

      normFloats[i / 2] = verts[i + 3];
      normFloats[i / 2 + 1] = verts[i + 4];
      normFloats[i / 2 + 2] = verts[i + 5];
    }

    bufferGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(posFloats, 3)
    );
    bufferGeometry.setAttribute(
      "normal",
      new THREE.BufferAttribute(normFloats, 3)
    );
    bufferGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

    geometry.delete();
    return bufferGeometry;
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener("keydown", (event: KeyboardEvent) => {
      if (
        event.code === "Space" &&
        this.picker.selectedObject &&
        !(event.target as HTMLElement).closest("input, textarea")
      ) {
        event.preventDefault();
        this.toggleSelectedVisibility();
      }
    });
  }

  public toggleSelectedVisibility(): void {
    if (!this.picker.selectedObject) return;

    const isVisible = this.picker.selectedObject.visible;
    this.picker.selectedObject.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Mesh).isMesh) {
        child.visible = !isVisible;
      }
    });
  }

  public isolateSelected(): void {
    if (!this.picker.selectedObject) return;

    this.models.forEach((model) => {
      model.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh) {
          child.visible = false;
        }
      });
    });

    this.picker.selectedObject.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Mesh).isMesh) {
        child.visible = true;
      }
    });
  }

  public showAll(): void {
    this.models.forEach((model) => {
      model.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh) {
          child.visible = true;
        }
      });
    });
  }

  private setupPicking(): void {
    this.container.addEventListener("click", (event: MouseEvent) => {
      this.handleClick(event);
    });

    this.container.addEventListener("mousemove", (event: MouseEvent) => {
      this.handleMouseMove(event);
    });
  }

  private createModelListItem(
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

    // PDF Upload button
    const pdfUploadBtn = document.createElement("button");
    pdfUploadBtn.className = "model-control-btn";
    pdfUploadBtn.innerHTML = '<i class="fas fa-file-pdf"></i>';
    pdfUploadBtn.title = "Upload PDF";
    pdfUploadBtn.addEventListener("click", () => {
      pdfInput.click();
    });

    // Hidden PDF input for uploading PDFs
    const pdfInput = document.createElement("input");
    pdfInput.type = "file";
    pdfInput.accept = "application/pdf";
    pdfInput.style.display = "none";
    pdfInput.addEventListener("change", (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        console.log(`PDF uploaded for model ${modelId}:`, file.name);
        // Mark this model as having a PDF loaded and store a single random preview image.
        model.userData.hasPDF = true;
        model.userData.pdfPreviewImage = this.getRandomPdfImage();

        // PDF upload confirmation message with enhanced styling
        let confirmation = modelItem.querySelector(".pdf-upload-confirmation");
        if (!confirmation) {
          confirmation = document.createElement("div");
          confirmation.className = "pdf-upload-confirmation";
          // Styling similar to the model tree / app alerts
          confirmation.style.marginTop = "5px";
          confirmation.style.fontSize = "14px";
          confirmation.style.color = "#155724";
          confirmation.style.backgroundColor = "#d4edda";
          confirmation.style.border = "1px solid #c3e6cb";
          confirmation.style.borderRadius = "4px";
          confirmation.style.padding = "4px 8px";
          confirmation.style.maxWidth = "80%";
          confirmation.style.margin = "5px auto";
          modelItem.appendChild(confirmation);
        }
        confirmation.textContent = `PDF uploaded successfully: ${file.name}`;

        // Handle the PDF file as needed (e.g., store or display it)
      }
    });

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "model-control-btn";
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.title = "Delete Model";
    deleteBtn.addEventListener("click", async () => {
      this.scene.remove(model);
      this.models.delete(modelId);
      modelItem.remove();
    });

    // Append the buttons to the controls container
    modelControls.appendChild(visibilityBtn);
    modelControls.appendChild(pdfUploadBtn);
    modelControls.appendChild(deleteBtn);
    modelHeader.appendChild(modelName);
    modelHeader.appendChild(modelControls);
    modelItem.appendChild(modelHeader);
    // Append the hidden PDF input to the model card
    modelItem.appendChild(pdfInput);

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

  private setupPanels(): void {
    // Models panel toggle
    const modelsPanel = document.querySelector(".models-panel");
    const modelsToggle = document.querySelector(".models-toggle");

    if (modelsPanel && modelsToggle) {
      modelsToggle.addEventListener("click", () => {
        modelsPanel.classList.toggle("collapsed");
      });
    }

    // Settings panel functionality
    const gridToggle = document.getElementById(
      "grid-toggle"
    ) as HTMLInputElement;
    const axesToggle = document.getElementById(
      "axes-toggle"
    ) as HTMLInputElement;
    const shadowsToggle = document.getElementById(
      "shadows-toggle"
    ) as HTMLInputElement;
    const opacitySlider = document.getElementById(
      "opacity-slider"
    ) as HTMLInputElement;

    if (gridToggle) {
      gridToggle.addEventListener("change", () => {
        if (this.grid) {
          this.grid.visible = gridToggle.checked;
        }
      });
    }

    if (axesToggle) {
      axesToggle.addEventListener("change", () => {
        if (this.axes) {
          this.axes.visible = axesToggle.checked;
        }
      });
    }

    if (shadowsToggle) {
      shadowsToggle.addEventListener("change", () => {
        this.renderer.shadowMap.enabled = shadowsToggle.checked;
        this.models.forEach((model) => {
          model.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = shadowsToggle.checked;
              child.receiveShadow = shadowsToggle.checked;
            }
          });
        });
      });
    }

    if (opacitySlider) {
      opacitySlider.addEventListener("input", () => {
        const opacity = Number(opacitySlider.value) / 100;
        this.models.forEach((model) => {
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

  private setupFloatingMenu(): void {
    // Implement floating menu setup logic
  }

  private createElementGroup(
    expressID: number,
    modelID: number,
    ifcType: string
  ): THREE.Group {
    const elementGroup = new THREE.Group();
    elementGroup.name = `Element_${expressID}`;
    elementGroup.userData = {
      modelID,
      expressID,
      type: "element",
      ifcType,
    };
    return elementGroup;
  }

  private createMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    expressID: number,
    modelID: number
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Mesh_${expressID}_${this.meshCounter++}`;
    mesh.userData = {
      modelID,
      expressID,
      type: "mesh",
    };
    return mesh;
  }

  // Add these getter methods to the IFCViewer class
  public getModels(): Map<number, IFCModel> {
    return this.models;
  }

  public getCamera(): THREE.Camera {
    return this.camera;
  }

  public getControls(): any {
    return this.controls;
  }

  public getScene(): THREE.Scene {
    return this.scene;
  }

  public getIfcAPI(): IfcAPI {
    return this.ifcAPI;
  }

  public getPropertiesPanel(): PropertiesPanel {
    return this.propertiesPanel;
  }

  public setSectionBox(bbox: THREE.Box3 | null): void {
    // Remove existing section box if bbox is null
    if (!bbox) {
      if (this.sectionBoxHelper) {
        this.scene.remove(this.sectionBoxHelper);
        this.sectionBoxHelper = null;
      }
      // Reset clipping planes
      this.renderer.clippingPlanes = [];
      this.renderer.localClippingEnabled = false;
      return;
    }

    // Remove existing helper
    if (this.sectionBoxHelper) {
      this.scene.remove(this.sectionBoxHelper);
    }

    // Create custom material for dotted lines
    const material = new THREE.LineDashedMaterial({
      color: 0x000000, // Black color
      dashSize: 0.2, // Length of the dashes
      gapSize: 0.1, // Length of the gaps
      linewidth: 1,
      scale: 1, // Scale of the dashes
    });

    // Create box geometry
    const geometry = new THREE.BoxGeometry(
      bbox.max.x - bbox.min.x,
      bbox.max.y - bbox.min.y,
      bbox.max.z - bbox.min.z
    );
    const edges = new THREE.EdgesGeometry(geometry);

    this.sectionBoxHelper = new THREE.LineSegments(edges, material);

    // Position the box at center of bounds
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    this.sectionBoxHelper.position.copy(center);

    // Compute line distances (required for dashed lines)
    this.sectionBoxHelper.computeLineDistances();

    this.scene.add(this.sectionBoxHelper);

    // Update clipping planes
    const planes = [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), bbox.max.x),
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -bbox.min.x),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), bbox.max.y),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -bbox.min.y),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), bbox.max.z),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -bbox.min.z),
    ];

    this.renderer.clippingPlanes = planes;
    this.renderer.localClippingEnabled = true;

    // Zoom to fit section box
    this.zoomToBox(bbox);
  }

  private zoomToBox(bbox: THREE.Box3): void {
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bbox.getCenter(center);
    bbox.getSize(size);

    // Calculate the required camera position
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / Math.tan(fov / 2));
    cameraZ *= 2.5; // Increased padding for better view

    // Get current distance to target
    const currentDistance = this.camera.position.distanceTo(center);

    // Check if box is already in good view
    const currentDir = new THREE.Vector3()
      .subVectors(this.camera.position, center)
      .normalize();
    const boxInView = this.isBoxInGoodView(bbox, currentDir, currentDistance);

    // Calculate new camera position
    let newPosition: THREE.Vector3;

    if (!boxInView) {
      // If box isn't in good view, calculate best viewing angle
      const direction = new THREE.Vector3();

      // Try to maintain similar horizontal angle but adjust vertical angle
      direction.copy(currentDir);
      direction.y = 0.5; // Look down at 45 degrees
      direction.normalize();

      newPosition = center.clone().add(direction.multiplyScalar(cameraZ));
    } else {
      // If box is in good view, just adjust distance
      newPosition = center.clone().add(currentDir.multiplyScalar(cameraZ));
    }

    // Animate camera movement
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const startTime = performance.now();
    const duration = 1500; // 1.5 seconds

    const animate = (currentTime: number): void => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth ease-out function
      const ease = 1 - Math.pow(1 - progress, 3);

      // Update camera position
      this.camera.position.lerpVectors(startPos, newPosition, ease);

      // Update controls target
      this.controls.target.lerpVectors(startTarget, center, ease);
      this.controls.update();

      // Continue animation if not complete
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  private isBoxInGoodView(
    bbox: THREE.Box3,
    cameraDir: THREE.Vector3,
    distance: number
  ): boolean {
    // Get box dimensions
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    // Calculate ideal viewing distance
    const fov = this.camera.fov * (Math.PI / 180);
    const idealDistance = Math.abs(maxDim / Math.tan(fov / 2)) * 2.5;

    // Check if current distance is close to ideal
    const distanceOK = Math.abs(distance - idealDistance) < idealDistance * 0.5;

    // Check if camera has good vertical angle (between 30 and 60 degrees)
    const verticalAngleOK = cameraDir.y > 0.3 && cameraDir.y < 0.7;

    return distanceOK && verticalAngleOK;
  }

  public getContainer(): HTMLElement {
    return this.container;
  }

  // Add method to toggle connection mode
  public setConnectionMode(active: boolean): void {
    this.isConnectionMode = active;
    this.picker.setConnectionMode(active);

    if (active) {
      this.clearSelection();
      this.traverse((object: THREE.Object3D) => {
        if ((object as THREE.Mesh).isMesh) {
          const material = (object as THREE.Mesh)
            .material as THREE.MeshPhongMaterial;
          if (material) {
            material.transparent = true;
            material.opacity = 0.3;
            material.depthWrite = false;
          }
        }
      });
    } else {
      this.traverse((object: THREE.Object3D) => {
        if ((object as THREE.Mesh).isMesh) {
          const material = (object as THREE.Mesh)
            .material as THREE.MeshPhongMaterial;
          if (material) {
            if (!object.userData.selected) {
              material.transparent = false;
              material.opacity = 1;
            }
            material.depthWrite = true;
          }
        }
      });
    }
  }

  // Modify the handleMouseMove method
  private handleMouseMove(event: MouseEvent): void {
    if (this.isConnectionMode) return; // Skip hover effects in connection mode

    // Update mouse position
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update the picking ray with the camera and mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Find intersected objects
    let intersects: THREE.Intersection[] = [];
    this.models.forEach((model) => {
      const modelIntersects = this.raycaster.intersectObject(model, true);
      intersects = intersects.concat(modelIntersects);
    });

    // Check if an object is being hovered and if its model has a PDF loaded.
    if (intersects.length > 0) {
      const intersect = intersects[0]; // take the nearest intersect
      const model = this.getModelFromObject(intersect.object);
      if (model && model.userData.hasPDF) {
        if (this.lastHoveredModel !== model) {
          // New hover event for this model: update (cycle) the displayed image.
          if (typeof model.userData.pdfPreviewImageIndex !== "number") {
            model.userData.pdfPreviewImageIndex = 0;
          } else {
            model.userData.pdfPreviewImageIndex =
              (model.userData.pdfPreviewImageIndex + 1) %
              this.pdfImagePaths.length;
          }
          model.userData.pdfPreviewImage =
            this.pdfImagePaths[model.userData.pdfPreviewImageIndex];
          this.lastHoveredModel = model;
        }
        this.showPdfPreview(intersect, model);
      } else {
        this.hidePdfPreview();
        this.lastHoveredModel = null;
      }
    } else {
      this.hidePdfPreview();
      this.lastHoveredModel = null;
    }

    // Pass the event to the picker
    this.picker.handleMouseMove(event);
  }

  // Modify the handleClick method
  private handleClick(event: MouseEvent): void {
    if (this.isConnectionMode) return; // Skip selection in connection mode

    // Update mouse position
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update the picking ray with the camera and mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Find intersected objects
    let intersects: THREE.Intersection[] = [];
    this.models.forEach((model) => {
      const modelIntersects = this.raycaster.intersectObject(model, true);
      intersects = intersects.concat(modelIntersects);
    });

    // Only show adjacent nodes for the selected graph node
    if (intersects.length > 0) {
      const intersect = intersects[0];
      this.picker.getGlobalId(intersect.object).then((globalId) => {
        this.neo4jViewer.loadSubgraph(globalId);
      });
    } else {
      this.neo4jViewer.loadGraph();
    }

    // Pass the event to the picker
    this.picker.handleClick(event);
  }

  public traverse(callback: (object: THREE.Object3D) => void): void {
    this.models.forEach((model) => model.traverse(callback));
  }

  public clearSelection(): void {
    this.picker.clearSelection();
  }

  // Add these getter methods
  public getGrid(): THREE.GridHelper {
    return this.grid;
  }

  public getAxes(): THREE.AxesHelper {
    return this.axes;
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  public getModelMap(): Map<number, IFCModel> {
    return this.models;
  }

  private getRandomPdfImage(): string {
    const randomIndex = Math.floor(Math.random() * this.pdfImagePaths.length);
    return this.pdfImagePaths[randomIndex];
  }

  private getModelFromObject(object: THREE.Object3D): IFCModel | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current.userData && current.userData.viewerModel) {
        return current as IFCModel;
      }
      current = current.parent;
    }
    return null;
  }

  private showPdfPreview(intersect: THREE.Intersection, model: IFCModel): void {
    if (!model.userData.hasPDF) {
      this.hidePdfPreview();
      return;
    }
    let image: string;
    if (model.userData.pdfPreviewImage) {
      image = model.userData.pdfPreviewImage;
    } else {
      image = this.getRandomPdfImage();
      model.userData.pdfPreviewImage = image;
    }
    console.log("Showing PDF preview image at path:", image);

    // Populate preview window content with a single PNG image.
    this.pdfPreviewWindow.innerHTML = "";
    const img = document.createElement("img");
    img.src = image;
    img.style.width = "100%";
    img.style.height = "auto";
    this.pdfPreviewWindow.appendChild(img);

    // Compute the screen coordinates of the intersect point.
    const pos = intersect.point.clone();
    pos.project(this.camera); // convert to normalized device coordinates
    const halfWidth = window.innerWidth / 2;
    const halfHeight = window.innerHeight / 2;
    const x = pos.x * halfWidth + halfWidth;
    const y = -(pos.y * halfHeight) + halfHeight;

    // Offset the preview window so it does not obscure the object.
    this.pdfPreviewWindow.style.left = `${x + 10}px`;
    this.pdfPreviewWindow.style.top = `${y - 10}px`;
    this.pdfPreviewWindow.style.display = "block";
  }

  private hidePdfPreview(): void {
    this.pdfPreviewWindow.style.display = "none";
    this.lastHoveredModel = null;
  }

  public async selectElementByGUID(guid: string): Promise<void> {
    try {
      let modelID: number | null = null;
      let expressID: number | null = null;

      this.models.forEach((model) => {
        modelID = model.modelID;
        expressID = this.ifcAPI.GetExpressIdFromGuid(modelID, guid);
        if (modelID && expressID) {
          return;
        }
      });

      if (!modelID && !expressID) {
        console.error("Element not found in any model:", guid);
        return;
      }

      await this.picker.selectElementGroupByIDs(modelID, expressID);
    } catch (error) {
      console.error("Error selecting element by GUID:", error);
    }
  }
}
