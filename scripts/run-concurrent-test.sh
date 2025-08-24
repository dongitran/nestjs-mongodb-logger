#!/bin/bash

# Navigate to the script's own directory to make it runnable from anywhere
cd "$(dirname "$0")"

# Navigate to the sample project directory from the scripts directory
cd ../sample

# Start the NestJS application in the background
echo "Starting NestJS server..."
npm run start &

# Get the process ID (PID) of the background server process
SERVER_PID=$!

# Give the server a moment to start up
sleep 5

# Check if the server is still running
if ! ps -p $SERVER_PID > /dev/null
then
    echo "Server failed to start. Exiting."
    exit 1
fi

echo "Server started with PID: $SERVER_PID. Sending requests..."

# Send 10 concurrent requests to the /info endpoint, hiding output
for i in {1..10}
do
  curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
       -d "{\"message\": \"Concurrent request $i\"}" \
       http://localhost:3000/info &
done

# Wait for all background curl processes to finish
wait

echo "\nAll requests sent."

# Clean up by killing the server process
echo "Stopping NestJS server (PID: $SERVER_PID)..."
kill $SERVER_PID

echo "Script finished."

