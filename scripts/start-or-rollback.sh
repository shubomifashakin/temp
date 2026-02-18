#!/bin/bash
set -e

PROJECT_DIR="/home/$REMOTE_USER/projects/temp"
BACKUP_DIR="$PROJECT_DIR/backup"
SHA_FILE="$PROJECT_DIR/.last_deployment_sha"

echo "Pulling latest images..."
cd "$PROJECT_DIR"
docker compose pull

echo "Starting containers..."
docker compose up -d --force-recreate --wait --wait-timeout=120
EXIT_CODE=$?

docker compose logs --tail=50

if [ $EXIT_CODE -eq 0 ]; then
  echo "Deployment successful"
  echo "Backing up sha..."
  echo "$CURRENT_SHA" > "$SHA_FILE"
  echo "Backup complete"
  exit 0
fi

echo "Deployment failed, attempting rollback..."

if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A $BACKUP_DIR 2>/dev/null)" ]; then
  echo "No backup found, first deployment. Exiting."
  exit 1
fi

LAST_SHA=""
if [ -f "$BACKUP_DIR/.last_deployment_sha" ]; then
  LAST_SHA=$(cat "$BACKUP_DIR/.last_deployment_sha")
  echo "Last deployment SHA: $LAST_SHA"
else
  echo "No .last_deployment_sha found in backup, cannot pin image tag"
fi

echo "Restoring files from backup..."
rsync -a --exclude='backup/' "$BACKUP_DIR/" "$PROJECT_DIR/"


if [ -n "$LAST_SHA" ]; then
  echo "Pinning image tag to $LAST_SHA in docker-compose..."
  sed -i "s|$DOCKER_USERNAME/temp:latest|$DOCKER_USERNAME/temp:$LAST_SHA|g" "$PROJECT_DIR/docker-compose.yml"
fi

echo "Starting previous deployment.."
docker compose pull
docker compose up -d --force-recreate --wait --wait-timeout=120
ROLLBACK_EXIT_CODE=$?

docker compose logs --tail=50

if [ $ROLLBACK_EXIT_CODE -eq 0 ]; then
  echo "Rollback successful, previous version is running"
else
  echo "Rollback also failed, manual intervention required"
fi

exit 1