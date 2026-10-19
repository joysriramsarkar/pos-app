-- Expenses can be paid with a cash + UPI split ("Mixed").
-- The form has supported this for a while, but the enum never had a member,
-- so the API wrote 'MIXED' into a column typed ExpensePaymentMethod and
-- Prisma rejected the insert.
ALTER TYPE "ExpensePaymentMethod" ADD VALUE IF NOT EXISTS 'MIXED';
