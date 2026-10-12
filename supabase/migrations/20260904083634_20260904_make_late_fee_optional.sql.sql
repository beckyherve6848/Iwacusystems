/*
# Make late_fee column nullable on payments

1. Modified Tables
- `payments`: Change `late_fee` from NOT NULL to nullable so it becomes optional
- Default remains 0 for existing rows

2. Notes
- This allows the payment form to omit the late fee field
- Existing data is preserved
*/

ALTER TABLE payments ALTER COLUMN late_fee DROP NOT NULL;
