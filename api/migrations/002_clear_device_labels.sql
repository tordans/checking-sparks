-- Device labels and last-success timestamps are no longer written or read: clear old values so the
-- server keeps no device names (docs/privacy.md).
UPDATE subscriptions SET label = '', last_success_at = NULL;
