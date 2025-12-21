#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Exportador de equipos a Excel
Sin guardado local: solo OneDrive y Google Drive
"""

import sqlite3
import os
import sys
from datetime import datetime
from pathlib import Path
import shutil

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side


# ================================
# RUTAS DE EXPORTACIÓN
# ================================

CARPETA_GOOGLE_DRIVE = Path(r"C:\Users\Miguel Angel Imperio\Mi unidad\Exportaciones")
CARPETA_ONEDRIVE = Path(r"C:\Users\Miguel Angel Imperio\OneDrive\Exportaciones")


# ================================
# FUNCIONES DE BASE DE DATOS
# ================================

def obtener_ruta_db():
    script_dir = Path(__file__).parent
    return str(script_dir / "equipos.db")


def conectar_db(db_path):
    if not os.path.exists(db_path):
        print(f"[ERROR] No se encontró la base de datos: {db_path}")
        input("\nPresiona Enter para salir...")
        sys.exit(1)

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn
    except Exception as e:
        print(f"[ERROR] Error al conectar a la base de datos: {e}")
        input("\nPresiona Enter para salir...")
        sys.exit(1)


def obtener_equipos(conn):
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM equipos ORDER BY ine")
        return cursor.fetchall()
    except Exception as e:
        print(f"[ERROR] {e}")
        return []


def obtener_especificaciones(conn, equipo_id):
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT clave, valor FROM especificaciones WHERE equipo_id = ? ORDER BY id",
            (equipo_id,)
        )
        return cursor.fetchall()
    except Exception:
        return []


# ================================
# EXCEL
# ================================

def formatear_especificaciones(specs):
    if not specs:
        return ""
    return "\n".join(f"{s['clave']}: {s['valor']}" for s in specs)


def crear_excel(equipos, conn, output_path):
    print("\n[INFO] Creando archivo Excel...")

    wb = Workbook()
    ws = wb.active
    ws.title = "Equipos"

    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )

    headers = ['INE', 'NNE', 'Serie', 'Tipo', 'Estado', 'Responsable', 'Ubicacion', 'Especificaciones']

    for col, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.fill = header_fill
        cell.font = header_font
        cell.border = border
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for i, eq in enumerate(equipos, start=2):
        ws.cell(i, 1, eq['ine'])
        ws.cell(i, 2, eq['nne'])
        ws.cell(i, 3, eq['serie'])
        ws.cell(i, 4, eq['tipo'])
        ws.cell(i, 5, eq['estado'])
        ws.cell(i, 6, eq['responsable'])
        ws.cell(i, 7, eq['ubicacion'])

        specs = obtener_especificaciones(conn, eq['id'])
        cell_specs = ws.cell(i, 8, formatear_especificaciones(specs))
        cell_specs.alignment = Alignment(wrap_text=True, vertical="top")
        cell_specs.border = border

    ws.column_dimensions['A'].width = 35
    ws.column_dimensions['H'].width = 50

    try:
        wb.save(output_path)
        print("[OK] Excel creado correctamente")
        return True
    except Exception as e:
        print(f"[ERROR] No se pudo guardar: {e}")
        return False


# ================================
# COPIAS A ONEDRIVE / GOOGLE DRIVE
# ================================

def copiar_archivo(origen, destino_folder, nombre_servicio):
    try:
        destino = destino_folder / os.path.basename(origen)
        shutil.copy2(origen, destino)
        print(f"[OK] Copiado a {nombre_servicio}: {destino}")
        return True
    except Exception as e:
        print(f"[ERROR] No se pudo copiar a {nombre_servicio}: {e}")
        return False


# ================================
# MAIN
# ================================

def main():
    print("=" * 60)
    print("[INFO] EXPORTADOR DE EQUIPOS A EXCEL")
    print("=" * 60)

    db_path = obtener_ruta_db()
    conn = conectar_db(db_path)

    equipos = obtener_equipos(conn)
    print(f"[OK] {len(equipos)} equipos detectados.")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Guardar directamente en OneDrive (no se guarda localmente)
    output_path = CARPETA_ONEDRIVE / f"Equipos_Export_{timestamp}.xlsx"

    exito = crear_excel(equipos, conn, str(output_path))
    conn.close()

    print(f"\n[OK] Archivo guardado en OneDrive: {output_path}")

    # Copiar a Google Drive
    copiar_archivo(output_path, CARPETA_GOOGLE_DRIVE, "Google Drive")

    print("\n[INFO] Exportacion completada.")


if __name__ == "__main__":
    main()
