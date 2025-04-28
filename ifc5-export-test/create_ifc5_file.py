#!/usr/bin/env python3
import json
import uuid
import math

def generate_id(prefix="N"):
    return prefix + uuid.uuid4().hex

def generate_ref(ref_id):
    return f"</{ref_id}>"

def create_disclaimer(text):
    return {"disclaimer": text}

def create_class(name, class_type=None, children=None, extra=None):
    entry = {"def": "class", "name": name}
    if class_type:
        entry["type"] = class_type
    if children:
        entry["children"] = children
    if extra:
        entry.update(extra)
    return entry

def create_def(name, def_type=None, children=None, inherits=None, extra=None):
    entry = {"def": "def", "name": name}
    if def_type:
        entry["type"] = def_type
    if children:
        entry["children"] = children
    if inherits:
        entry["inherits"] = inherits
    if extra:
        entry.update(extra)
    return entry

def create_over(name, attributes):
    return {"def": "over", "name": name, "attributes": attributes}

def generate_sphere_mesh(num_lat=20, num_lon=40, radius=1.0):
    pts = []
    inds = []
    # Top pole
    pts.append([0.0, 0.0, radius])
    top = 0
    # Rings
    for i in range(1, num_lat):
        theta = math.pi * i / num_lat
        for j in range(num_lon):
            phi = 2 * math.pi * j / num_lon
            x = radius * math.sin(theta) * math.cos(phi)
            y = radius * math.sin(theta) * math.sin(phi)
            z = radius * math.cos(theta)
            pts.append([x, y, z])
    bottom = len(pts)
    pts.append([0.0, 0.0, -radius])
    # Top cap
    for j in range(num_lon):
        a = top
        b = 1 + j
        c = 1 + ((j+1) % num_lon)
        inds.extend([a, b, c])
    # Middle
    for i in range(1, num_lat-1):
        for j in range(num_lon):
            current = 1 + (i-1)*num_lon + j
            nxt = current + num_lon
            current_next = 1 + (i-1)*num_lon + ((j+1) % num_lon)
            nxt_next = current_next + num_lon
            inds.extend([current, nxt, current_next])
            inds.extend([current_next, nxt, nxt_next])
    # Bottom cap
    offset = 1 + (num_lat-2)*num_lon
    for j in range(num_lon):
        a = bottom
        b = offset + ((j+1) % num_lon)
        c = offset + j
        inds.extend([a, b, c])
    return pts, inds

def main():
    ifc5_file = []

    # 1. Disclaimer
    disclaimer_text = ("2024-11-12 update of the examples. (C) buildingSMART International. "
                       "Published under CC BY-ND 4.0.")
    ifc5_file.append(create_disclaimer(disclaimer_text))
    
    # 2. Main window element (unchanged)
    window_base = generate_id()
    window_void = f"{window_base}_Void"
    window_body = f"{window_base}_Body"
    main_window = create_class(
        name=window_base,
        class_type="UsdGeom:Xform",
        children=[
            create_def("Void", def_type="UsdGeom:Mesh", inherits=[generate_ref(window_void)]),
            create_def("Body", def_type="UsdGeom:Mesh", inherits=[generate_ref(window_body)])
        ]
    )
    ifc5_file.append(main_window)
    ifc5_file.append(create_class(name=window_void, class_type="UsdGeom:Mesh"))
    ifc5_file.append(create_class(name=window_body, class_type="UsdGeom:Mesh"))
    
    # 3. Build the project hierarchy.
    project_id  = generate_id()
    site_id     = generate_id()
    building_id = generate_id()
    storey_id   = generate_id()
    space_id    = generate_id()
    sphere_id   = generate_id()

    project_class = create_class(
        name=project_id,
        class_type="UsdGeom:Xform",
        children=[ create_def("My_Site", inherits=[generate_ref(site_id)]) ]
    )
    ifc5_file.append(project_class)
    ifc5_file.append(create_def("My_Project", def_type="UsdGeom:Xform", inherits=[generate_ref(project_id)]))
    
    site_class = create_class(
        name=site_id,
        class_type="UsdGeom:Xform",
        children=[
            create_def("My_Building", inherits=[generate_ref(building_id)]),
            create_def("Sphere", inherits=[generate_ref(sphere_id)])
        ]
    )
    ifc5_file.append(site_class)
    
    building_class = create_class(
        name=building_id,
        class_type="UsdGeom:Xform",
        children=[ create_def("My_Storey", inherits=[generate_ref(storey_id)]) ]
    )
    ifc5_file.append(building_class)
    
    # In the Storey, add: My_Space, ThickWall, and Surface.
    thick_wall_id = generate_id()   # Thick wall (true solid)
    space_def = create_def("My_Space", inherits=[generate_ref(space_id)])
    thick_wall_def = create_def("ThickWall", inherits=[generate_ref(thick_wall_id)])
    surface_def = create_def("Surface", inherits=[generate_ref("SurfaceMesh")])
    storey_class = create_class(
        name=storey_id,
        class_type="UsdGeom:Xform",
        children=[ space_def, thick_wall_def, surface_def ]
    )
    ifc5_file.append(storey_class)
    
    space_class = create_class(name=space_id, class_type="UsdGeom:Xform")
    ifc5_file.append(space_class)
    
    # 4. Define the ThickWall element (unchanged).
    thick_wall_body_id = thick_wall_id + "_Body"
    thick_wall_class = create_class(
        name=thick_wall_id,
        class_type="UsdGeom:Xform",
        children=[ create_def("Body", def_type="UsdGeom:Mesh", inherits=[generate_ref(thick_wall_body_id)]) ]
    )
    ifc5_file.append(thick_wall_class)
    thick_wall_body_class = create_class(name=thick_wall_body_id, class_type="UsdGeom:Mesh")
    ifc5_file.append(thick_wall_body_class)
    outer_points = [
        [0.0, 0.0, 0.0],
        [0.0, 3.0, 0.0],
        [0.0, 3.0, 3.0],
        [0.0, 0.0, 3.0],
        [0.2, 0.0, 0.0],
        [0.2, 3.0, 0.0],
        [0.2, 3.0, 3.0],
        [0.2, 0.0, 3.0]
    ]
    box_indices = [
        0,1,2, 0,2,3,
        4,6,5, 4,7,6,
        0,4,7, 0,7,3,
        1,5,6, 1,6,2,
        0,1,5, 0,5,4,
        3,2,6, 3,6,7
    ]
    inner_points = [
        [0.05, 0.05, 0.05],
        [0.05, 2.95, 0.05],
        [0.05, 2.95, 2.95],
        [0.05, 0.05, 2.95],
        [0.15, 0.05, 0.05],
        [0.15, 2.95, 0.05],
        [0.15, 2.95, 2.95],
        [0.15, 0.05, 2.95]
    ]
    outer_override = create_over(thick_wall_body_id, attributes={
        "UsdGeom:Mesh": {
            "faceVertexIndices": box_indices,
            "points": outer_points
        }
    })
    ifc5_file.append(outer_override)
    inner_override = create_over(thick_wall_id, attributes={
        "UsdGeom:Mesh": {
            "faceVertexIndices": box_indices,
            "points": inner_points
        }
    })
    ifc5_file.append(inner_override)
    thick_wall_ifc_override = create_over(thick_wall_id, attributes={
        "ifc5:class": {
            "code": "IfcWall",
            "uri": "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcWall"
        }
    })
    ifc5_file.append(thick_wall_ifc_override)
    thick_wall_properties_override = create_over(thick_wall_id, attributes={
        "ifc5:properties": {"IsExternal": 1}
    })
    ifc5_file.append(thick_wall_properties_override)
    thick_wall_material_override = create_over(thick_wall_id, attributes={
        "UsdShade:MaterialBindingAPI": {
            "material:binding": {"ref": generate_ref("WallMaterial")}
        }
    })
    ifc5_file.append(thick_wall_material_override)
    
    # 5. Define the Surface element as a proper IFC annotation.
    # We define a thin box (a rectangle extruded 1mm) to represent the surface.
    surface_id = "SurfaceMesh"
    surface_class = create_class(surface_id, class_type="UsdGeom:Mesh")
    ifc5_file.append(surface_class)
    # Define vertices for a box extruded in y by 1mm (0.001 units)
    v0 = [0.0, 0.0, 0.0]
    v1 = [4.0, 0.0, 0.0]
    v2 = [4.0, 0.0, 4.0]
    v3 = [0.0, 0.0, 4.0]
    v4 = [0.0, 0.001, 0.0]
    v5 = [4.0, 0.001, 0.0]
    v6 = [4.0, 0.001, 4.0]
    v7 = [0.0, 0.001, 4.0]
    surface_points = [v0, v1, v2, v3, v4, v5, v6, v7]
    surface_indices = [
        # Bottom face:
        0,1,2, 0,2,3,
        # Top face (reversed order for proper orientation):
        4,6,5, 4,7,6,
        # Side faces can be defined if needed. For a thin element, the top and bottom suffice.
    ]
    surface_geometry_override = create_over(surface_id, attributes={
        "UsdGeom:Mesh": {
            "faceVertexIndices": surface_indices,
            "points": surface_points
        }
    })
    ifc5_file.append(surface_geometry_override)
    # Mark the surface as an IfcAnnotation and assign it a material similar to the wall.
    surface_ifc_override = create_over(surface_id, attributes={
        "ifc5:class": {
            "code": "IfcAnnotation",
            "uri": "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcAnnotation"
        },
        "PredefinedType": "NOTDEFINED"
    })
    ifc5_file.append(surface_ifc_override)
    # Add two properties ("foo" and "bar") to the surface.
    surface_properties_override = create_over(surface_id, attributes={
        "ifc5:properties": {
            "foo": "valueFoo",
            "bar": "valueBar"
        }
    })
    ifc5_file.append(surface_properties_override)
    surface_material_override = create_over(surface_id, attributes={
        "UsdShade:MaterialBindingAPI": {
            "material:binding": {"ref": generate_ref("WallMaterial")}
        }
    })
    ifc5_file.append(surface_material_override)
    
    # 6. Define a round Sphere object.
    sphere_class = create_class(sphere_id, class_type="UsdGeom:Mesh")
    ifc5_file.append(sphere_class)
    def generate_sphere_mesh(num_lat=20, num_lon=40, radius=1.0):
        pts = []
        inds = []
        pts.append([0.0, 0.0, radius])
        top = 0
        for i in range(1, num_lat):
            theta = math.pi * i / num_lat
            for j in range(num_lon):
                phi = 2 * math.pi * j / num_lon
                x = radius * math.sin(theta) * math.cos(phi)
                y = radius * math.sin(theta) * math.sin(phi)
                z = radius * math.cos(theta)
                pts.append([x, y, z])
        bottom = len(pts)
        pts.append([0.0, 0.0, -radius])
        for j in range(num_lon):
            a = top
            b = 1 + j
            c = 1 + ((j+1) % num_lon)
            inds.extend([a, b, c])
        for i in range(1, num_lat-1):
            for j in range(num_lon):
                current = 1 + (i-1)*num_lon + j
                nxt = current + num_lon
                current_next = 1 + (i-1)*num_lon + ((j+1) % num_lon)
                nxt_next = current_next + num_lon
                inds.extend([current, nxt, current_next])
                inds.extend([current_next, nxt, nxt_next])
        offset = 1 + (num_lat-2)*num_lon
        for j in range(num_lon):
            a = bottom
            b = offset + ((j+1) % num_lon)
            c = offset + j
            inds.extend([a, b, c])
        return pts, inds

    sphere_pts, sphere_inds = generate_sphere_mesh(num_lat=20, num_lon=40, radius=1.0)
    sphere_override = create_over(sphere_id, attributes={
        "UsdGeom:Mesh": {
            "faceVertexIndices": sphere_inds,
            "points": sphere_pts
        }
    })
    ifc5_file.append(sphere_override)
    
    # 7. Define a simple material for walls.
    wall_material_def = {
        "def": "def",
        "type": "UsdShade:Material",
        "name": "WallMaterial",
        "children": [
            {
                "def": "def",
                "type": "UsdShade:Shader",
                "name": "Shader",
                "attributes": {
                    "info:id": "UsdPreviewSurface",
                    "inputs:diffuseColor": [0.8, 0.7, 0.6],
                    "inputs:opacity": 1,
                    "outputs:surface": None
                }
            }
        ]
    }
    ifc5_file.append(wall_material_def)
    
    # 8. Write the IFC5 file to disk.
    with open("output.ifcx", "w") as f:
        json.dump(ifc5_file, f, indent=2)
    
    print("IFC5 file with thick wall, annotation surface with 1mm thickness, properties foo and bar, and a round sphere generated successfully as output.ifcx")

if __name__ == "__main__":
    main()
