#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/.env"

POSTGRES_CONTAINER="temp_postgres"
S3_BUCKET="545plea-projects"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="postgres_backup_${TIMESTAMP}.dump"
LOCAL_BACKUP_PATH="/tmp/${BACKUP_FILENAME}"

echo "Starting PostgreSQL backup at $(date)"

echo "Creating PostgreSQL dump..."
docker exec "${POSTGRES_CONTAINER}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc > "${LOCAL_BACKUP_PATH}"

if [ $? -eq 0 ]; then
    echo "PostgreSQL dump created successfully: ${LOCAL_BACKUP_PATH}"
else
    echo "Failed to create PostgreSQL dump"
    exit 1
fi

echo "Uploading to S3..."
aws s3 cp "${LOCAL_BACKUP_PATH}" "s3://${S3_BUCKET}/backups/postgres/temp/${BACKUP_FILENAME}"

if [ $? -eq 0 ]; then
    echo "Backup uploaded successfully to S3: s3://${S3_BUCKET}/backups/postgres/temp/${BACKUP_FILENAME}"
else
    echo "Failed to upload backup to S3"
    rm -f "${LOCAL_BACKUP_PATH}"
    exit 1
fi

echo "Cleaning up local file..."
rm -f "${LOCAL_BACKUP_PATH}"

echo "Backup completed successfully at $(date)"
echo "Backup location: s3://${S3_BUCKET}/backups/postgres/temp/${BACKUP_FILENAME}"