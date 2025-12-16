@echo off
REM InfluxDB Setup Batch Script for AirSquawk
REM This script provides basic InfluxDB setup commands

echo === AirSquawk InfluxDB Setup ===
echo.

set INFLUXDB_PATH=C:\influxdb3-core-3.7.0-windows_amd64\influxdb3.exe
set DATA_DIR=%~dp0influxdb_data
set NODE_ID=airsquawk
set DATABASE=airsquawk

echo InfluxDB Path: %INFLUXDB_PATH%
echo Data Directory: %DATA_DIR%
echo Node ID: %NODE_ID%
echo Database: %DATABASE%
echo.

if not exist "%INFLUXDB_PATH%" (
    echo ERROR: InfluxDB executable not found at %INFLUXDB_PATH%
    echo Please update INFLUXDB_PATH in this script or install InfluxDB 3
    pause
    exit /b 1
)

echo Creating data directory if needed...
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

echo.
echo Starting InfluxDB server...
echo Command: "%INFLUXDB_PATH%" serve --node-id %NODE_ID% --data-dir "%DATA_DIR%"
echo.
echo InfluxDB is starting in a new window. Press any key to continue with token creation...
start "InfluxDB Server" cmd /k "%INFLUXDB_PATH%" serve --node-id %NODE_ID% --data-dir "%DATA_DIR%"

timeout /t 5 /nobreak > nul

echo.
echo === Token Creation ===
echo When InfluxDB has started (you should see it listening on port 8181),
echo run the following command in a new terminal window:
echo.
echo %INFLUXDB_PATH% create token --admin
echo.
echo Then copy the generated token and update your config.json file.
echo.
echo Press any key to exit...
pause > nul