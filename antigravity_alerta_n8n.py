import urllib.request
import urllib.error
import json
from datetime import datetime

def enviar_alerta_n8n():
    """
    Demostración de cómo Antigravity (este script) puede 'llamar' 
    a n8n para procesar una alerta de obra con su localización y costos.
    """
    webhook_url = "http://localhost:5678/webhook/alerta-obra"
    
    payload = {
        "proyecto": "Torre CoreBIM Analytics",
        "localizacion": "Lat: 4.6097, Lon: -74.0817 (Sector Norte)",
        "global_id": "3O$8z1k311sQn_YQZJ_y$1",
        "elemento": "IfcWall (Muro Estructural)",
        "costo_propuesto": 1875.00,
        "criticidad": "Alta",
        "timestamp": datetime.now().isoformat()
    }
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(webhook_url, data=data, headers={'Content-Type': 'application/json'})

    print(f"Enviando alerta de obra a N8N...")
    print(f"Localizacion: {payload['localizacion']}")
    print(f"Costo Calculado por el Skill 5D: ${payload['costo_propuesto']}")
    
    try:
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                print("\nExito! N8N recibio y proceso la alerta.")
                response_data = json.loads(response.read().decode())
                print("Respuesta de N8N:", json.dumps(response_data, indent=2))
    except urllib.error.HTTPError as e:
        print(f"\nEl webhook respondio con codigo: {e.code}")
        print("Asegurate de que el workflow en N8N este ACTIVO o en modo 'Test'.")
    except urllib.error.URLError as e:
        print(f"\nError de conexion: {e.reason}. Esta corriendo N8N en http://localhost:5678?")

if __name__ == "__main__":
    enviar_alerta_n8n()
