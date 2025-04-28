declare module "web-ifc" {
  export const IFCPROJECT: number;
  export const IFCSITE: number;
  export const IFCBUILDING: number;
  export const IFCBUILDINGSTOREY: number;

  export interface IFCLoadingSettings {
    COORDINATE_TO_ORIGIN?: boolean;
    USE_FAST_BOOLS?: boolean;
  }

  export interface IFCGeometry {
    GetVertexData(): any;
    GetVertexDataSize(): number;
    GetIndexData(): any;
    GetIndexDataSize(): number;
    delete(): void;
  }

  export interface IFCMeshData {
    geometries: {
      size(): number;
      get(index: number): {
        color: { x: number; y: number; z: number; w: number };
        geometryExpressID: number;
        flatTransformation: number[];
      };
    };
    expressID: number;
  }
}

declare module "web-ifc/web-ifc-api" {
  export class IfcAPI {
    wasmModule: any;

    constructor();
    Init(): Promise<void>;
    OpenModel(
      data: Uint8Array,
      settings?: import("web-ifc").IFCLoadingSettings
    ): number;
    GetGeometry(
      modelID: number,
      geometryExpressID: number
    ): import("web-ifc").IFCGeometry;
    GetVertexArray(ptr: any, size: number): Float32Array;
    GetIndexArray(ptr: any, size: number): Uint32Array;
    StreamAllMeshes(
      modelID: number,
      callback: (mesh: import("web-ifc").IFCMeshData) => void
    ): void;
    CloseModel(modelID: number): void;
    GetLine(
      modelID: number,
      expressID: number
    ): {
      type: string;
      [key: string]: any;
    };
  }
}
