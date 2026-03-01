#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/.env"

POSTGRES_CONTAINER="temp_postgres"
S3_BACKUP_BUCKET="vpsinfrastack-vpsinfrabackupbucket1cf8043f-6qg3s3zt5y2r"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="postgres_backup_${TIMESTAMP}.dump"
LOCAL_BACKUP_PATH="/tmp/${BACKUP_FILENAME}"
trap 'rm -f "${LOCAL_BACKUP_PATH}"' EXIT

echo "Starting temp postgres backup at $(date)"

echo "Attempting to dump to ${LOCAL_BACKUP_PATH}"

docker exec "${POSTGRES_CONTAINER}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc > "${LOCAL_BACKUP_PATH}"

if [ $? -ne 0 ]; then
    echo "Failed to run pg dump"
    exit 1
fi

echo "Successfully dumped to ${LOCAL_BACKUP_PATH}, now attempting to upload to s3..."

aws s3 cp "${LOCAL_BACKUP_PATH}" "s3://${S3_BACKUP_BUCKET}/backups/postgres/temp/${BACKUP_FILENAME}"

if [ $? -ne 0 ]; then
    echo "Failed to upload backup to s3"
    exit 1
fi

echo "Backup completed successfully at $(date)"
echo "Backup location: s3://${S3_BACKUP_BUCKET}/backups/postgres/temp/${BACKUP_FILENAME}"