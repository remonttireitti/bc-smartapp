-- Allow work report drafts for auto-save while filling the form

ALTER TYPE work_status ADD VALUE IF NOT EXISTS 'draft';
