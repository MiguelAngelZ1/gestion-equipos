#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import json
from datetime import datetime
from pathlib import Path
import shutil
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

# ================================
# CONFIGURACIÓN Y RUTAS (Solo Windows)
# ================================
IS_WINDOWS = os.name == 'nt'
CARPETA_GOOGLE_DRIVE = Path(r"C:\Users\Miguel Angel Imperio\Mi unidad\Exportaciones") if IS_WINDOWS else None
CARPETA_ONEDRIVE = Path(r"C:\Users\Miguel Angel Imperio\OneDrive\Exportaciones") if IS_WINDOWS else None

def formatear_especificaciones(specs):
    if not specs: return ""
    return "\n".join(f"{s.get('clave', '')}: {s.get('valor', '')}" for s in specs)

def crear_excel(equipos_data, output_path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Equipos"

    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    border = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))

    headers = ['INE', 'NNE', 'Serie', 'Tipo', 'Estado', 'Responsable', 'Ubicacion', 'Especificaciones']
    for col, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.fill = header_fill
        cell.font = header_font
        cell.border = border
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for i, eq in enumerate(equipos_data, start=2):
        ws.cell(i, 1, eq.get('ine', '-'))
        ws.cell(i, 2, eq.get('nne', '-'))
        ws.cell(i, 3, eq.get('serie', '-'))
        ws.cell(i, 4, eq.get('tipo', '-'))
        ws.cell(i, 5, eq.get('estado', '-'))
        ws.cell(i, 6, eq.get('responsable', '-'))
        ws.cell(i, 7, eq.get('ubicacion', '-'))

        specs = eq.get('especificaciones', [])
        cell_specs = ws.cell(i, 8, formatear_especificaciones(specs))
        cell_specs.alignment = Alignment(wrap_text=True, vertical="top")
        cell_specs.border = border

    ws.column_dimensions['A'].width = 35
    ws.column_dimensions['H'].width = 50
    wb.save(output_path)
    return True

def copiar_archivo(origen, destino_folder, nombre_servicio):
    if not destino_folder or not destino_folder.exists(): return False
    try:
        destino = destino_folder / os.path.basename(origen)
        shutil.copy2(origen, destino)
        return True
    except:
        return False

def main():
    if len(sys.argv) < 3:
        print("Uso: python exportar_a_excel.py <ruta_output> <json_data_path o 'stdin'>")
        sys.exit(1)

    output_path = Path(sys.argv[1])
    data_source = sys.argv[2]

    if data_source == 'stdin':
        equipos_data = json.load(sys.stdin)
    else:
        with open(data_source, 'r', encoding='utf-8') as f:
            equipos_data = json.load(f)

    # Crear el Excel
    crear_excel(equipos_data, str(output_path))

    # Sincronización en la nube (Sólo si es Windows y existen las rutas)
    if IS_WINDOWS:
        if CARPETA_ONEDRIVE:
            CARPETA_ONEDRIVE.mkdir(parents=True, exist_ok=True)
            copiar_archivo(output_path, CARPETA_ONEDRIVE, "OneDrive")
        if CARPETA_GOOGLE_DRIVE:
            CARPETA_GOOGLE_DRIVE.mkdir(parents=True, exist_ok=True)
            copiar_archivo(output_path, CARPETA_GOOGLE_DRIVE, "Google Drive")

if __name__ == "__main__":
    main()
