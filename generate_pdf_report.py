from fpdf import FPDF
import sys
import json
import os

class PDF(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 15)
        self.cell(0, 10, 'Reporte de Análisis Arquitectónico CoreBIM', 0, 1, 'C')
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Página {self.page_no()}', 0, 0, 'C')

def generate_report(content_json_path, output_pdf_path):
    with open(content_json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    narrative = data.get("narrative", "No se proporcionó análisis.")
    stats = data.get("stats", {})

    pdf = PDF()
    pdf.add_page()
    
    # Section: Summary Stats
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 10, 'Resumen del Modelo IFC:', 0, 1)
    pdf.set_font('Arial', '', 10)
    
    for key, value in stats.items():
        pdf.cell(0, 7, f"- {key}: {value}", 0, 1)
    
    pdf.ln(10)
    
    # Section: AI Analysis
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 10, 'Análisis de Diseño y Arquitectura:', 0, 1)
    pdf.set_font('Arial', '', 10)
    
    # Multi-line text for narrative
    pdf.multi_cell(0, 7, narrative)

    pdf.output(output_pdf_path)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python generate_pdf_report.py <input_json> <output_pdf>")
        sys.exit(1)

    input_json = sys.argv[1]
    output_pdf = sys.argv[2]
    
    generate_report(input_json, output_pdf)
    print(f"PDF generado exitosamente en: {output_pdf}")
