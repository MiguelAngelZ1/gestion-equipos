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
USER_PROFILE = os.environ.get("USERPROFILE", r"C:\Users\Miguel Angel Imperio")

def get_cloud_paths():
    if not IS_WINDOWS: return None, None
    
    home = Path(os.path.expanduser("~"))
    od_final = None
    gd_final = None
    
    print(f"[DEBUG] Buscando carpetas en perfil de usuario: {home}")
    
    try:
        # 1. Buscar OneDrive (puede ser "OneDrive", "OneDrive - Personal", etc.)
        for folder in home.iterdir():
            if folder.is_dir() and "onedrive" in folder.name.lower():
                print(f"[DEBUG] Encontrado posible OneDrive: {folder.name}")
                od_final = folder / "Exportaciones"
                break
        
        # 2. Buscar Google Drive (G:\ o carpeta local)
        # Primero probar la letra de unidad común G:
        drive_g = Path("G:/Mi unidad/Exportaciones")
        if drive_g.parent.exists():
            print("[DEBUG] Google Drive detectado en Unidad G:")
            gd_final = drive_g
        else:
            # Si no es G:, buscar carpeta en el home (Backup and Sync style)
            for folder in home.iterdir():
                if folder.is_dir() and "google drive" in folder.name.lower():
                    # Buscar Mi Unidad dentro
                    for sub in folder.iterdir():
                        if sub.is_dir() and sub.name.lower() in ["mi unidad", "my drive"]:
                            gd_final = sub / "Exportaciones"
                            break
                    if not gd_final: gd_final = folder / "Exportaciones"
                    break
    except Exception as e:
        print(f"[ERROR] Error durante la búsqueda de carpetas: {e}")

    # Fallbacks si no se encontró nada especial
    if not od_final: od_final = home / "OneDrive" / "Exportaciones"
    if not gd_final: gd_final = home / "Google Drive" / "Exportaciones"
    
    print(f"[DEBUG] Ruta final OneDrive: {od_final}")
    print(f"[DEBUG] Ruta final Google Drive: {gd_final}")
    
    return od_final, gd_final

CARPETA_ONEDRIVE, CARPETA_GOOGLE_DRIVE = get_cloud_paths()

def formatear_especificaciones(specs):
    if not specs: return ""
    return "\n".join(f"{s.get('clave', '')}: {s.get('valor', '')}" for s in specs)

def crear_excel(equipos_data, output_path):
    print(f"[INFO] Generando Excel con {len(equipos_data)} registros...")
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
        print(f"[OK] Excel guardado en: {output_path}")
        return True
    except Exception as e:
        print(f"[ERROR] Error creando Excel: {e}")
        return False

def copiar_archivo(origen, destino_folder, nombre_servicio):
    print(f"[INFO] Intentando copiar a {nombre_servicio}...")
    if not destino_folder:
        print(f"[WARN] Ruta de {nombre_servicio} no definida.")
        return False
    
    try:
        if not destino_folder.exists():
            print(f"[INFO] Creando carpeta: {destino_folder}")
            destino_folder.mkdir(parents=True, exist_ok=True)
            
        destino = destino_folder / os.path.basename(origen)
        shutil.copy2(origen, destino)
        print(f"[OK] Copiado exitosamente a: {destino}")
        return True
    except Exception as e:
        print(f"[ERROR] No se pudo copiar a {nombre_servicio}: {e}")
        return False

def main():
    print("=" * 40)
    print("🚀 INICIANDO PROCESO DE EXPORTACIÓN")
    print("=" * 40)
    
    if len(sys.argv) < 3:
        print("[ERROR] Argumentos insuficientes.")
        sys.exit(1)

    output_path = Path(sys.argv[1])
    data_source = sys.argv[2]
    
    print(f"[INFO] Sistema Operativo: {os.name}")

    if data_source == 'stdin':
        equipos_data = json.load(sys.stdin)
    else:
        with open(data_source, 'r', encoding='utf-8') as f:
            equipos_data = json.load(f)

    # Crear el Excel
    if crear_excel(equipos_data, str(output_path)):
        # Sincronización en la nube (Sólo si es Windows)
        if IS_WINDOWS:
            print("[INFO] Detectado Windows. Iniciando sincronización de carpetas locales...")
            copiar_archivo(output_path, CARPETA_ONEDRIVE, "OneDrive")
            copiar_archivo(output_path, CARPETA_GOOGLE_DRIVE, "Google Drive")
        else:
            print("[INFO] No es Windows o entorno de nube. Se omite la copia a carpetas locales.")
    else:
        print("[ERROR] No se pudo completar la exportación.")
        sys.exit(1)

    print("=" * 40)
    print("🏁 PROCESO FINALIZADO")
    print("=" * 40)

if __name__ == "__main__":
    main()
