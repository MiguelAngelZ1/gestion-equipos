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
# CONFIGURACIÓN DE RUTAS EXACTAS (Propuestas por el Usuario)
# ================================
IS_WINDOWS = os.name == 'nt'

# Rutas proporcionadas por el usuario
RUTAS_OBJETIVO = [
    Path(r"C:\Users\Miguel Angel Imperio\OneDrive\Exportaciones"),
    Path(r"C:\Users\Miguel Angel Imperio\Mi unidad\Exportaciones"),
    # Fallback adicional por si Google Drive usa la unidad G:
    Path(r"G:\Mi unidad\Exportaciones")
]

def formatear_especificaciones(specs):
    if not specs: return ""
    return "\n".join(f"{s.get('clave', '')}: {s.get('valor', '')}" for s in specs)

def crear_excel(equipos_data, output_path):
    print(f"[INFO] Generando Excel base...")
    try:
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
        print(f"[OK] Archivo temporal guardado.")
        return True
    except Exception as e:
        print(f"[ERROR] No se pudo crear el Excel inicial: {e}")
        return False

def copiar_a_ruta(origen, ruta_destino):
    try:
        # Asegurar que la carpeta existe
        if not ruta_destino.exists():
            print(f"[INFO] Creando carpeta: {ruta_destino}")
            ruta_destino.mkdir(parents=True, exist_ok=True)
            
        nombre_archivo = os.path.basename(origen)
        destino_final = ruta_destino / nombre_archivo
        
        shutil.copy2(origen, destino_final)
        print(f"[OK] Sincronizado en: {destino_final}")
        return True
    except Exception as e:
        print(f"[WARN] No se pudo guardar en {ruta_destino}: {e}")
        return False

def main():
    print("\n" + "="*50)
    print("🚀 INICIANDO EXPORTACIÓN A RUTAS DE NUBE")
    print("="*50)

    if len(sys.argv) < 3:
        print("[ERROR] Faltan argumentos.")
        sys.exit(1)

    temp_output = Path(sys.argv[1])
    data_source = sys.argv[2]

    # Cargar datos
    try:
        with open(data_source, 'r', encoding='utf-8') as f:
            equipos_data = json.load(f)
    except Exception as e:
        print(f"[ERROR] Fallo al leer datos: {e}")
        sys.exit(1)

    # 1. Crear el archivo Excel en la ruta temporal compartida
    if crear_excel(equipos_data, str(temp_output)):
        # 2. Si estamos en Windows, realizar las copias a las carpetas de nube
        if IS_WINDOWS:
            exitos = 0
            for ruta in RUTAS_OBJETIVO:
                if copiar_a_ruta(temp_output, ruta):
                    exitos += 1
            
            if exitos == 0:
                print("[ERROR] No se pudo guardar en NINGUNA de las carpetas de nube.")
                # Intentamos guardar en el escritorio como último recurso
                escritorio = Path(os.path.expanduser("~/Desktop")) / os.path.basename(temp_output)
                shutil.copy2(temp_output, escritorio)
                print(f"[AVISO] Se guardó una copia en el Escritorio: {escritorio}")
        else:
            print("[INFO] Entorno Linux/Nube detectado. Saltando copias locales.")
    
    print("="*50 + "\n")

if __name__ == "__main__":
    main()
