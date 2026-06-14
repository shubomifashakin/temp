#!/bin/bash
set -e  

echo "Pulling migration image..."
docker pull $DOCKER_USERNAME/temp:$CURRENT_SHA

echo "Running migrations with Doppler secrets..."
doppler run --token "$DOPPLER_TOKEN" -- \
  docker run --rm \
    --network system_wide_network \
    $DOCKER_USERNAME/temp:$CURRENT_SHA \
    npx prisma migrate deploy

echo "Migrations completed successfully"