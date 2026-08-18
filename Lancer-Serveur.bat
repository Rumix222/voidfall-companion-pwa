@echo off
cd /d "%~dp0"
echo Demarrage du serveur local Voidfall Companion sur http://localhost:5173
start "" http://localhost:5173
"C:\Users\Rumix\AppData\Local\Programs\Python\Python312\python.exe" -m http.server 5173
pause
