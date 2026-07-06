@echo off
echo Starting NUIS Partner CRM...
cd backend
start cmd /c "node server.js"
cd ../frontend
start cmd /c "npm run dev"
echo Both servers started!
pause
