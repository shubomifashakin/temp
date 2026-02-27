# Presigned POST URL

## Status

Accepted

## Context

Initially, files were uploaded directly to our server before being forwarded to S3. This approach increased server load, consumed server bandwidth, and degraded upload performance for large files. We need a solution that allows users to upload files directly to S3 from their browsers without routing file data through our servers.

## Decision

We will use AWS S3's presigned POST URL functionality to generate temporary upload URLs. The URLs will include form fields for file metadata and will be valid for 30 minutes. The backend will:

1. Generate presigned POST URLs using AWS SDK
2. Include content-type, file size, and tag constraints
3. Store file metadata in database before returning URL
4. Handle cleanup of orphaned records if upload fails

## Implementation Notes

- Use AWS SDK v3 `@aws-sdk/s3-presigned-post` package
- Include `content-length-range` condition for file size validation
- Include `content-type` condition to ensure correct file type
- Add `tagging` field to include lifetime tag for automatic cleanup
- Cron job to clean up orphaned records after 24 hours

## Consequences

- **Pros:**
  - Reduced server load (files go directly to S3)
  - Better upload performance for large files
  - Automatic file size validation via S3
  - Built-in security through expiration

- **Cons:**
  - Additional complexity in URL generation
  - URLs expire in 30minutes, requiring users to restart the upload process if the file failed to be uploaded during that window.
  - Files may fail to upload after file metadata has already been created in db

## Alternatives

- Using a traditional upload endpoint where files are uploaded to our server first and then forwarded to S3. This was rejected because it would increase server load and reduce upload performance.
