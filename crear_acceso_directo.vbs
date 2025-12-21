Set oWS = WScript.CreateObject("WScript.Shell")
desktopPath = oWS.SpecialFolders("Desktop")
projectPath = WScript.ScriptFullName
projectPath = Left(projectPath, InStrRev(projectPath, "\"))

' Crear acceso directo
Set oLink = oWS.CreateShortcut(desktopPath & "\Control de Equipos.lnk")
oLink.TargetPath = "pythonw.exe"
oLink.Arguments = """" & projectPath & "iniciar.py"""
oLink.WorkingDirectory = projectPath
oLink.Description = "Sistema de Control de Equipos"
oLink.IconLocation = "C:\Windows\System32\SHELL32.dll,144"
oLink.Save

WScript.Echo "¡Acceso directo creado en el escritorio!"
WScript.Echo "Presiona Enter para cerrar..."