-- Keep synthetic full-chain acceptance records auditable without allowing them
-- to appear as operational evidence in Insights or Analytics.
UPDATE records AS record
SET collection_purpose = 'system_validation',
    updated_at = now()
FROM tasks AS task
WHERE record.task_id = task.id
  AND record.collection_purpose = 'operational'
  AND task.configuration ? 'e2eRunKey';
