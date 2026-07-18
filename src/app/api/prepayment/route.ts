export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/api-middleware';
import { addMoney, toMoneyNumber } from '@/lib/money';

const prepaymentSchema = z.object({
  customerId: z.string().cuid(),
  amount: z.coerce.number().positive().transform((value) => toMoneyNumber(value)),
});

/**
 * @swagger
 * /api/prepayment:
 *   post:
 *     summary: Add a prepaid balance to a customer's account
 *     description: Adds a specified amount to a customer's prepaid balance and creates a corresponding ledger entry.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customerId:
 *                 type: string
 *                 description: The unique identifier for the customer.
 *               amount:
 *                 type: number
 *                 description: The positive amount to add to the prepaid balance.
 *     responses:
 *       200:
 *         description: Successfully added prepayment. Returns the updated customer object.
 *         content:
 *           application/json:

/**
 * @swagger
 * /api/prepayment:
 *   post:
 *     summary: Add a prepaid balance to a customer's account
 *     description: Adds a specified amount to a customer's prepaid balance and creates a corresponding ledger entry.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customerId:
 *                 type: string
 *                 description: The unique identifier for the customer.
 *               amount:
 *                 type: number
 *                 description: The positive amount to add to the prepaid balance.
 *     responses:
 *       200:
 *         description: Successfully added prepayment. Returns the updated customer object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Customer'
 *       400:
 *         description: Bad request due to invalid input data.
 *       404:
 *         description: Customer not found.
 *       500:
 *         description: Internal server error.
 */
export async function POST(req: NextRequest) {
    try {
        const authError = await requirePermission(req, 'customers.edit');
        if (authError) return authError;

        const body = await req.json();
        const validation = prepaymentSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ success: false, error: validation.error.format() }, { status: 400 });
        }

        const { customerId, amount } = validation.data;

        const updatedCustomer = await db.$transaction(async (tx) => {
            const customerRaw = await tx.$queryRaw<any[]>`
              SELECT id, "total_due" as "totalDue", "prepaid_balance" as "prepaidBalance"
              FROM customers
              WHERE id = ${customerId}
              FOR UPDATE
            `;
            const customer = customerRaw[0];

            if (!customer) {
                throw new Error('Customer not found');
            }

            const newPrepaidBalance = addMoney(customer.prepaidBalance, amount);

            const updated = await tx.customer.update({
                where: { id: customerId },
                data: {
                    prepaidBalance: newPrepaidBalance,
                },
            });

            await tx.ledgerEntry.create({
                data: {
                    customerId: customerId,
                    entryType: 'prepayment-added',
                    amount: amount,
                    balanceAfter: customer.totalDue, // Prepaid balance is separate from due balance
                    description: 'Prepayment added',
                    referenceId: `PREPAY-${Date.now()}`,
                },
            });

            return updated;
        });

        return NextResponse.json({ success: true, data: updatedCustomer });

    } catch (error: unknown) {
        console.error('Error adding prepayment:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        const statusCode = errorMessage === 'Customer not found' ? 404 : 500;
        return NextResponse.json({ success: false, error: errorMessage }, { status: statusCode });
    }
}
