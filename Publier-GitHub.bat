@echo off
cd /d "%~dp0"
set "GIT=C:\Program Files\Git\cmd\git.exe"

echo Recuperation des dernieres modifications distantes...
"%GIT%" pull

set /p msg="Message de commit (vide = message automatique) : "
if "%msg%"=="" set "msg=maj %date% %time%"

"%GIT%" add -A
"%GIT%" commit -m "%msg%"
"%GIT%" push

echo.
echo Termine.
pause
