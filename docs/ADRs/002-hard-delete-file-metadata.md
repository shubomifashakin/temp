# ADR-002: Hard Delete File Metadata

## Status

Accepted

## Context

The system currently implements soft deletion for file metadata, keeping records even after files expire or users request deletion. This approach creates several issues:

1. **User Experience Problems**: Users cannot upload files with the same name as previously deleted files due to unique constraints on `name`, `userId`, and `contentType`
2. **Storage Waste**: Retaining metadata for deleted files consumes database storage without providing value
3. **Data Bloat**: Accumulation of deleted records impacts query performance over time

The soft deletion was originally implemented to maintain audit trails, but the value of retaining expired/deleted file metadata is minimal compared to the drawbacks.

## Decision

We will implement hard deletion of file metadata in the following scenarios:

1. **User-Initiated Deletion**: When a user explicitly deletes a file
2. **File Expiration**: When S3 emits object expiration events via webhook
3. **System Cleanup**: Periodic cleanup of stale pending files

## Implementation Notes

### Database Changes

- Remove `deleted_at` column from `files` table
- Maintain existing unique constraints on `filename`, `userId`, and `contentType`

### Application Changes

- Update file service to perform hard deletes instead of soft deletes
- Modify S3 webhook handler to delete metadata upon file expiration

## Consequences

### Positive Outcomes

- **Improved User Experience**: Users can reuse filenames after deletion
- **Reduced Storage**: Eliminates unnecessary metadata storage
- **Better Performance**: Smaller dataset improves query performance
- **Simplified Logic**: Removes complexity of handling soft-deleted records

### Negative Outcomes

- **Lost Audit Trail**: No permanent record of deleted files
- **Limited Analytics**: Cannot analyze deletion patterns or user behavior
- **Irreversible Action**: Once deleted, file metadata cannot be recovered

## Alternatives Considered

### Alternative 1: Remove Unique Constraints

Remove unique constraints on `filename`, `userId`, and `contentType` to allow duplicate filenames.

**Rejected because**:

- Multiple files with identical names and content types would be confusing
- Could lead to user ambiguity when managing files
- Doesn't address the underlying storage waste issue

### Alternative 2: Implement Grace Period

Keep soft deletion but automatically purge records after a set period (e.g., 30 days).

**Rejected because**:

- Adds complexity with temporary retention logic
- Still creates user experience issues during grace period
- Doesn't fully resolve storage concerns
