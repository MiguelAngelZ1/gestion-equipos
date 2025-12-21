import subprocess
import sys
import time
import webbrowser
import os
import signal
import platform
import socket
import shutil
import psutil
import atexit

def print_banner():
    print("""
╔════════════════════════════════════════╗
║     Sistema de Control de Equipos      ║
╚════════════════════════════════════════╝
    """)

def get_npm_path():
    """Obtiene la ruta completa a npm"""
    npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"
    npm_path = shutil.which(npm_cmd)
    if not npm_path:
        print("❌ Error: npm no está instalado o no está en el PATH")
        print("Por favor, instala Node.js desde https://nodejs.org")
        return None
    return npm_path

def check_node():
    """Verifica si Node.js está instalado"""
    try:
        node_path = shutil.which("node")
        if not node_path:
            raise FileNotFoundError
        subprocess.run([node_path, "--version"], capture_output=True, check=True)
        print("✅ Node.js encontrado:", node_path)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ Error: Node.js no está instalado")
        print("Por favor, instala Node.js desde https://nodejs.org")
        input("Presiona Enter para salir...")
        return False

def is_port_in_use(port):
    """Verifica si el puerto está en uso"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def install_dependencies():
    """Instala las dependencias del proyecto"""
    print("\n📦 Instalando dependencias...")
    try:
        npm_path = get_npm_path()
        if not npm_path:
            return False
        print("✅ npm encontrado:", npm_path)
        subprocess.run([npm_path, "install"], check=True)
        return True
    except subprocess.CalledProcessError as e:
        print("❌ Error instalando dependencias:", e)
        return False

def wait_for_server(port, timeout=30):
    """Espera hasta que el servidor esté disponible"""
    print("\n🚀 Iniciando servidor...")
    start_time = time.time()
    while time.time() - start_time < timeout:
        if is_port_in_use(port):
            time.sleep(1)  # Dar un segundo extra para que el servidor esté completamente listo
            return True
        time.sleep(1)
    return False

def run_server():
    """Ejecuta el servidor Node.js"""
    # Usar node directamente en lugar de npm para evitar problemas de PowerShell
    node_path = shutil.which("node")
    if not node_path:
        print("❌ Error: Node.js no está instalado o no está en el PATH")
        return None

    # Determinar el sistema operativo para manejar la terminal correctamente
    if platform.system() == "Windows":
        # Cambiar al directorio del script antes de ejecutar
        script_dir = os.path.dirname(os.path.abspath(__file__))
        return subprocess.Popen(
            ["node", "backend/server.js"],
            cwd=script_dir,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        return subprocess.Popen(
            ["node", "backend/server.js"],
            cwd=script_dir
        )

def kill_process_and_children(proc):
    try:
        parent = psutil.Process(proc.pid)
        children = parent.children(recursive=True)
        for child in children:
            child.kill()
        parent.kill()
    except psutil.NoSuchProcess:
        pass

def cleanup(server_process=None):
    if server_process:
        kill_process_and_children(server_process)
    
    # Cerrar Chrome en la página específica
    if platform.system() == "Windows":
        try:
            os.system('taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq Control de Equipos*"')
        except:
            pass

def main():
    port = 3000
    print_banner()
    print("❗ Para detener el servidor y cerrar la aplicación, presiona Ctrl+C")
    print()

    # Verificar si el puerto está en uso
    if is_port_in_use(port):
        print(f"❌ Error: El puerto {port} ya está en uso")
        print("Por favor, cierra cualquier aplicación que pueda estar usando este puerto")
        input("Presiona Enter para salir...")
        return

    # Verificar Node.js
    if not check_node():
        return

    # Verificar que estamos en el directorio correcto
    if not os.path.exists("package.json"):
        print("❌ Error: No se encuentra package.json")
        print("Por favor, ejecuta este script desde el directorio del proyecto")
        input("Presiona Enter para salir...")
        return

    # Instalar dependencias
    if not install_dependencies():
        input("Presiona Enter para salir...")
        return

    # Iniciar el servidor
    server_process = run_server()
    if not server_process:
        print("❌ Error: No se pudo iniciar el servidor")
        input("Presiona Enter para salir...")
        return
    
    # Registrar la función de limpieza
    atexit.register(cleanup, server_process)
    
    # Esperar a que el servidor esté listo
    if wait_for_server(port):
        print("\n✅ Servidor iniciado correctamente")
        print(f"\n🌐 Abriendo http://localhost:{port} en tu navegador...")
        # Abrir Chrome con un título específico
        if platform.system() == "Windows":
            chrome_path = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
            if os.path.exists(chrome_path):
                subprocess.Popen([
                    chrome_path,
                    "--new-window",
                    f"--app=http://localhost:{port}",
                    "--window-name=Control de Equipos"
                ])
            else:
                webbrowser.open(f"http://localhost:{port}")
        else:
            webbrowser.open(f"http://localhost:{port}")
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n\n🛑 Deteniendo el servidor...")
            cleanup(server_process)
            print("✅ Servidor detenido correctamente")
    else:
        print("\n❌ Error: El servidor no pudo iniciarse")
        cleanup(server_process)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 ¡Hasta luego!")
        sys.exit(0)