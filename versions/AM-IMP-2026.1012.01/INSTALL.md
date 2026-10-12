# Install

Use reviewed current main in the original root AM runtime; retain the existing dedicated task-service configuration and all calendar keys. Apply core/leaf-tasks.js, core/attachment-retrieval.js, core/central-archive/index.js and file-lookup.js plus server.js. No schema migration or mass group binding is needed. Never deploy an old dirty checkout. Merge only after CI and verify the production commit, lineTasks.groupScope and attachmentRetrieval.groupScope. DailyLog deployment is not needed.
