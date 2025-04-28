import * as THREE from "three";

/**
 * The interface for a node in our IFC5 file.
 * - def: "class" is used for container nodes;
 *        "def" for fully defined nodes (with geometry, etc.);
 *        "over" for override nodes.
 */
export interface ExportedIFCConnection {
  def: "class" | "def" | "over";
  name: string;
  type?: string; // e.g., "UsdGeom:Xform", "UsdGeom:Mesh", etc.
  attributes?: {
    "UsdGeom:Mesh"?: {
      points: number[][];
      faceVertexIndices: number[];
    };
    "ifc5:class"?: {
      code: string;
      uri: string;
    };
    "ifc5:properties"?: {
      [key: string]: any;
    };
    "UsdShade:MaterialBindingAPI"?: {
      "material:binding": {
        ref: string;
      };
    };
    measurement?: {
      area?: number;
      length?: number;
    };
    IfcConnectionType?: string;
    // Other components such as customdata, material bindings, etc.
    [key: string]: any;
  };
  children?: ExportedIFCConnection[];
  inherits?: string[];
}

/**
 * Generates a unique ID with an optional prefix
 */
function generateId(prefix: string = "N"): string {
  return prefix + crypto.randomUUID().replace(/-/g, "");
}

/**
 * Generates a reference to an ID
 */
function generateRef(refId: string): string {
  return `</${refId}>`;
}

/**
 * Creates a class node
 */
function createClass(
  name: string,
  type?: string,
  children?: ExportedIFCConnection[],
  extra?: any
): ExportedIFCConnection {
  const entry: ExportedIFCConnection = { def: "class", name };
  if (type) entry.type = type;
  if (children) entry.children = children;
  if (extra) entry.attributes = extra;
  return entry;
}

/**
 * Creates a def node
 */
function createDef(
  name: string,
  type?: string,
  inherits?: string[],
  children?: ExportedIFCConnection[],
  extra?: any
): ExportedIFCConnection {
  const entry: ExportedIFCConnection = { def: "def", name };
  if (type) entry.type = type;
  if (inherits) entry.inherits = inherits;
  if (children) entry.children = children;
  if (extra) entry.attributes = extra;
  return entry;
}

/**
 * Creates an over node
 */
function createOver(name: string, attributes: any): ExportedIFCConnection {
  return { def: "over", name, attributes };
}

/**
 * Converts THREE.js geometry or raw geometry data to IFC5 mesh format
 */
function geometryToIFCMesh(geometry: THREE.BufferGeometry | any): {
  points: number[][];
  faceVertexIndices: number[];
} {
  // If it's a surface geometry
  if (geometry.surface) {
    return {
      points: geometry.surface.getAttribute("position").array,
      faceVertexIndices: geometry.surface.index
        ? Array.from(geometry.surface.index.array)
        : [],
    };
  }

  // If it's a lines geometry
  if (geometry.lines) {
    return {
      points: geometry.lines.getAttribute("position").array,
      faceVertexIndices: geometry.lines.index
        ? Array.from(geometry.lines.index.array)
        : [],
    };
  }

  // If it's a THREE.BufferGeometry
  if (geometry instanceof THREE.BufferGeometry) {
    const positions = geometry.getAttribute("position");
    const points: number[][] = [];

    for (let i = 0; i < positions.count; i++) {
      points.push([positions.getX(i), positions.getY(i), positions.getZ(i)]);
    }

    const indices = geometry.index ? Array.from(geometry.index.array) : [];

    return {
      points,
      faceVertexIndices: indices,
    };
  }

  // If it's raw data
  if (geometry.points) {
    return {
      points: geometry.points,
      faceVertexIndices: geometry.faceVertexIndices || [],
    };
  }

  console.warn("Unknown geometry format:", geometry);
  return {
    points: [],
    faceVertexIndices: [],
  };
}

/**
 * Exports the connections to IFC5 format
 */
export function exportConnectionsToIFC5(
  connections: Map<string, any> | any[]
): string {
  const ifc5File: any[] = [];

  // 1. Add disclaimer
  ifc5File.push({
    disclaimer:
      "2024-11-12 update of the examples. (C) buildingSMART International. Published under CC BY-ND 4.0.",
  });

  // 2. Generate IDs for main structure
  const projectId = generateId();
  const siteId = generateId();
  const buildingId = generateId();
  const storeyId = generateId();
  const spaceId = generateId();

  // 3. Create project hierarchy
  const projectClass = createClass(projectId, "UsdGeom:Xform", [
    createDef("My_Site", undefined, [generateRef(siteId)]),
  ]);
  ifc5File.push(projectClass);

  // Create site class before project def
  const siteClass = createClass(siteId, "UsdGeom:Xform", [
    createDef("My_Building", undefined, [generateRef(buildingId)]),
  ]);
  ifc5File.push(siteClass);

  // Add project def after site class
  ifc5File.push(
    createDef("My_Project", "UsdGeom:Xform", [generateRef(projectId)])
  );

  // Create building class
  const buildingClass = createClass(buildingId, "UsdGeom:Xform", [
    createDef("My_Storey", undefined, [generateRef(storeyId)]),
  ]);
  ifc5File.push(buildingClass);

  // Create space class before storey class
  const spaceClass = createClass(spaceId, "UsdGeom:Xform");
  ifc5File.push(spaceClass);

  // Process connections to create walls - convert Map or array to array
  const connectionsArray = Array.isArray(connections)
    ? connections
    : Array.from(connections.values());

  console.log("Total connections:", connectionsArray.length);
  console.log(
    "Connection types:",
    connectionsArray.map((c) => c.type)
  );

  // Create separate elements for each body
  const connectionElements = connectionsArray
    .filter((connection) => connection.type === "surface")
    .flatMap((connection) => {
      console.log("Processing connection:", {
        type: connection.type,
        hasGeometry: !!connection.geometry?.surface,
        label: connection.label,
        measurement: connection.measurementText,
      });

      if (!connection.geometry?.surface) return [];

      const elementId = generateId();
      const bodyId = `${elementId}_Body`;
      return [
        {
          elementId,
          bodyId,
          geometry: connection.geometry.surface,
          connection,
        },
      ];
    });

  console.log("Connection elements:", connectionElements.length);

  // Create storey class with space and individual connections
  const storeyClass = createClass(storeyId, "UsdGeom:Xform", [
    createDef("My_Space", undefined, [generateRef(spaceId)]),
    ...connectionElements.map(({ elementId, connection }, index) => {
      // Clean up and format the connection label
      const elements = connection.label
        ?.split("↔")
        .map((e: string) => e.trim());
      const formattedName = elements
        ? elements
            .filter((e: string) => e)
            .join("--") // Join with --
            .replace(/[\s\/]/g, "_") // Replace spaces and slashes with underscore
            .replace(/[^a-zA-Z0-9_]/g, "") // Remove any other special characters
        : `Connection_${index + 1}`;

      return createDef(formattedName, undefined, [generateRef(elementId)]);
    }),
  ]);
  ifc5File.push(storeyClass);

  // Process each connection element
  for (const {
    elementId,
    bodyId,
    geometry,
    connection,
  } of connectionElements) {
    const meshData = geometryToIFCMesh(geometry);

    // Parse measurement value if it exists
    let measurementValue = null;
    if (connection.measurementText) {
      const match = connection.measurementText.match(/(\d+\.?\d*)\s*m²/);
      if (match) {
        measurementValue = parseFloat(match[1]);
      }
    }

    // Create element class
    const elementClass = createClass(elementId, "UsdGeom:Xform", [
      createDef("Body", "UsdGeom:Mesh", [generateRef(bodyId)]),
    ]);
    ifc5File.push(elementClass);

    // Create body class
    ifc5File.push(createClass(bodyId, "UsdGeom:Mesh"));

    // Add geometry override
    ifc5File.push(
      createOver(bodyId, {
        "UsdGeom:Mesh": meshData,
      })
    );

    // Add IFC class information with properties
    ifc5File.push(
      createOver(elementId, {
        "ifc5:class": {
          code: "IfcAnnotation",
          uri: "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcAnnotation",
        },
        PredefinedType: "NOTDEFINED",
        "ifc5:properties": {
          elements: connection.label,
          connectionType: "surface",
          ...(measurementValue && {
            area: {
              value: measurementValue,
              unit: "SQUARE_METRE",
            },
          }),
        },
      })
    );

    // Add material binding
    ifc5File.push(
      createOver(elementId, {
        "UsdShade:MaterialBindingAPI": {
          "material:binding": { ref: generateRef("ConnectionMaterial") },
        },
      })
    );
  }

  // Add connection material definition
  ifc5File.push({
    def: "def",
    type: "UsdShade:Material",
    name: "ConnectionMaterial",
    children: [
      {
        def: "def",
        type: "UsdShade:Shader",
        name: "Shader",
        attributes: {
          "info:id": "UsdPreviewSurface",
          "inputs:diffuseColor": [1.0, 0.0, 0.0], // Red color
          "inputs:opacity": 0.5, // Made it semi-transparent
          "outputs:surface": null,
        },
      },
    ],
  });

  return JSON.stringify(ifc5File, null, 2);
}
