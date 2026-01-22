import subprocess
import sys
import time
import webbrowser
import os
import platform

def print_banner():
    print("""
╔════════════════════════════════════════╗
║     Sistema de Control de Equipos      ║
╚════════════════════════════════════════╝
    """)

def wait_for_server(port=3000, timeout=30):
    """Espera hasta que el servidor esté disponible"""
    print("\n🚀 Esperando a que el servidor esté listo...")
    import socket
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(('localhost', port)) == 0:
                    time.sleep(1)  # Dar un segundo extra
                    return True
        except:
            pass
        time.sleep(1)
    return False

def run_sync():
    """Ejecuta la sincronización si está configurada"""
    print("\n🔄 Verificando sincronización...")
    
    # Verificar si existe .env con DATABASE_URL
    if os.path.exists(".env"):
        with open(".env", "r") as f:
            content = f.read()
            if "DATABASE_URL=postgresql" in content:
                print("   Sincronizando con Railway...")
                try:
                    result = subprocess.run(["npm", "run", "sync"], 
                                          capture_output=True, 
                                          text=True, 
                                          timeout=30)
                    if result.returncode == 0:
                        print("   ✅ Sincronización completada")
                    else:
                        print("   ⚠️  Sincronización falló, continuando con base local")
                except Exception as e:
                    print(f"   ⚠️  Error en sincronización: {e}")
                    print("   Continuando con base de datos local")
                return
    
    print("   ℹ️  Usando base de datos local (Railway no configurado)")

def run_server():
    """Ejecuta el servidor Node.js"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    if platform.system() == "Windows":
        return subprocess.Popen(
            ["node", "backend/server.js"],
            cwd=script_dir,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
    else:
        return subprocess.Popen(
            ["node", "backend/server.js"],
            cwd=script_dir
        )

def main():
    port = 3000
    print_banner()
    print("❗ Para detener el servidor, cierra la ventana del servidor o presiona Ctrl+C")
    print()

    # Ejecutar sincronización
    run_sync()

    # Iniciar el servidor
    print("\n🖥️  Iniciando servidor...")
    server_process = run_server()
    if not server_process:
        print("❌ Error: No se pudo iniciar el servidor")
        input("Presiona Enter para salir...")
        return

    # Esperar a que el servidor esté listo
    if wait_for_server(port):
        print(f"\n✅ Servidor iniciado correctamente en puerto {port}")
        print(f"\n🌐 Abriendo http://localhost:{port} en tu navegador...")
        time.sleep(1)
        webbrowser.open(f"http://localhost:{port}")
        
        print("\n" + "="*50)
        print("✅ Sistema iniciado correctamente")
        print("="*50)
        print("\n💡 Consejos:")
        print("   • El navegador se abrió automáticamente")
        print("   • Para detener: cierra la ventana del servidor")
        print("   • URL: http://localhost:3000")
        print("\n" + "="*50)
    else:
        print("\n❌ Error: El servidor no pudo iniciarse en el tiempo esperado")
        print("   Verifica que el puerto 3000 no esté en uso")
        server_process.terminate()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 ¡Hasta luego!")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error inesperado: {e}")
        input("Presiona Enter para salir...")
        sys.exit(1)