import * as THREE from "three";

export interface IFCModel extends THREE.Group {
  modelID: number;
  name: string;
}

export interface IFCMesh extends THREE.Mesh {
  modelID?: number;
  expressID?: number;
  userData: {
    modelID: number;
    expressID: number;
    originalMaterial?: THREE.Material;
    type: "mesh";
    isSelected?: boolean;
  };
}

export interface IFCElementGroup extends THREE.Group {
  modelID: number;
  expressID: number;
  userData: {
    modelID: number;
    expressID: number;
    type: "element";
  };
}

export interface IFCViewerOptions {
  container: HTMLElement;
}

export interface ModelInfo {
  id: number;
  name: string;
  model: IFCModel;
}

export interface GeometryData {
  GetVertexData: () => any;
  GetVertexDataSize: () => number;
  GetIndexData: () => any;
  GetIndexDataSize: () => number;
  delete: () => void;
}

export interface PlacedGeometry {
  color: { x: number; y: number; z: number; w: number };
  geometryExpressID: number;
  flatTransformation: number[];
}

export interface IFCLoadingResult {
  modelId: number;
  model: IFCModel;
}

export interface IntersectionResult {
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
}

export interface Node {
  id: string;
  labels: string[];
  properties: Record<string, any>;
  x: number;
  y: number;
  disassemblyLevel?: number;
}

export interface Link {
  source: string | Node;
  target: string | Node;
  type: string;
  properties: Record<string, any>;
}

export interface GraphData {
  nodes: Node[];
  links: Link[];
}
