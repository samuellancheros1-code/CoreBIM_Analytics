import ifcopenshell
import json
import sys
import os

def extract_ifc_info(file_path):
    try:
        model = ifcopenshell.open(file_path)
    except Exception as e:
        return {"error": f"Could not open IFC file: {str(e)}"}

    # Basic Info
    project = model.by_type("IfcProject")[0] if model.by_type("IfcProject") else None
    sites = model.by_type("IfcSite")
    buildings = model.by_type("IfcBuilding")
    storeys = model.by_type("IfcBuildingStorey")

    data = {
        "project_name": project.Name if project else "Unknown",
        "site_name": sites[0].Name if sites else "Unknown",
        "building_name": buildings[0].Name if buildings else "Unknown",
        "number_of_levels": len(storeys),
        "levels": [s.Name for s in storeys],
        "element_counts": {},
        "architectural_summary": []
    }

    # Count elements
    element_types = [
        "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcBeam", "IfcColumn", 
        "IfcDoor", "IfcWindow", "IfcStair", "IfcRoof", "IfcCurtainWall", 
        "IfcSpace", "IfcRailing", "IfcFurnishingElement"
    ]

    for e_type in element_types:
        elements = model.by_type(e_type)
        if elements:
            type_name = e_type.replace("Ifc", "")
            data["element_counts"][type_name] = len(elements)

    # Specific architectural details
    spaces = model.by_type("IfcSpace")
    if spaces:
        total_area = 0
        for space in spaces:
            # Try to get area from properties if available
            pass # Simplified for now
        data["architectural_summary"].append(f"Found {len(spaces)} designated spaces/rooms.")

    # Design inference
    if data["element_counts"].get("CurtainWall", 0) > 0:
        data["architectural_summary"].append("The model features curtain walls, suggesting a modern or commercial architectural style.")
    
    if data["element_counts"].get("Window", 0) > 20:
        data["architectural_summary"].append("Significant number of openings detected, indicating high priority on natural lighting.")

    if len(storeys) > 5:
        data["architectural_summary"].append(f"Multi-storey building with {len(storeys)} levels detected.")

    return data

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)

    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)

    result = extract_ifc_info(file_path)
    print(json.dumps(result, indent=2))
