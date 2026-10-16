-- FR-22 (ADR-0009): yer imi betiği Youthall ilanlarını da okur; kaynak listesine "youthall" eklenir.
ALTER TABLE applications DROP CONSTRAINT applications_source_check;
ALTER TABLE applications
  ADD CONSTRAINT applications_source_check
  CHECK (source IN ('linkedin', 'kariyer_net', 'youthall', 'company_site', 'referral', 'other'));
