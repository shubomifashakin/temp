#!/bin/bash
set -e  

echo "Pulling migration image..."
docker pull $DOCKER_USERNAME/temp:$CURRENT_SHA

echo "Running migrations..."
docker run --rm \
  --network system_wide_network \
  --env-file /home/$REMOTE_USER/projects/temp/.env \
  $DOCKER_USERNAME/temp:$CURRENT_SHA \
  npx prisma migrate deploy

echo "Migrations completed successfully"