/* eslint-disable camelcase */

/**
 * Migration: Create Payment Installments Table
 * Creates the payment_installments table with enums, indexes, constraints, triggers
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Create installment_status enum
  pgm.createType('installment_status_enum', [
    'pending',
    'paid',
    'overdue',
    'waived',
    'cancelled',
  ]);

  // Create payment_installments table
  pgm.createTable('payment_installments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },

    // References
    order_id: {
      type: 'uuid',
      notNull: true,
      references: 'orders',
      onDelete: 'CASCADE',
    },
    payment_id: {
      type: 'uuid',
      references: 'payments',
      onDelete: 'SET NULL',
    },

    // Installment details
    installment_number: {
      type: 'integer',
      notNull: true,
    },
    total_installments: {
      type: 'integer',
      notNull: true,
    },

    // Amount details
    amount: {
      type: 'decimal(12,2)',
      notNull: true,
    },
    penalty_amount: {
      type: 'decimal(10,2)',
      default: 0.0,
    },
    paid_amount: {
      type: 'decimal(12,2)',
      default: 0.0,
    },

    // Dates
    due_date: {
      type: 'date',
      notNull: true,
    },
    paid_date: {
      type: 'timestamp',
    },
    reminder_sent_at: {
      type: 'timestamp',
    },

    // Status
    status: {
      type: 'installment_status_enum',
      notNull: true,
      default: 'pending',
    },

    // Metadata
    notes: {
      type: 'text',
    },

    // Audit fields
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Add unique constraint on order_id + installment_number
  pgm.addConstraint('payment_installments', 'uq_order_installment_number', {
    unique: ['order_id', 'installment_number'],
  });

  // Add check constraints
  pgm.addConstraint('payment_installments', 'chk_installment_number_positive', {
    check:
      'installment_number > 0 AND installment_number <= total_installments',
  });

  pgm.addConstraint('payment_installments', 'chk_amount_positive', {
    check: 'amount > 0',
  });

  pgm.addConstraint('payment_installments', 'chk_penalty_positive', {
    check: 'penalty_amount >= 0',
  });

  pgm.addConstraint('payment_installments', 'chk_paid_amount_valid', {
    check: 'paid_amount >= 0 AND paid_amount <= amount + penalty_amount',
  });

  // Create indexes
  pgm.createIndex('payment_installments', 'order_id', {
    name: 'idx_installments_order_id',
  });
  pgm.createIndex('payment_installments', 'payment_id', {
    name: 'idx_installments_payment_id',
  });
  pgm.createIndex('payment_installments', 'status', {
    name: 'idx_installments_status',
  });
  pgm.createIndex('payment_installments', 'due_date', {
    name: 'idx_installments_due_date',
  });
  pgm.createIndex('payment_installments', ['status', 'due_date'], {
    name: 'idx_installments_status_due',
  });

  // Create trigger to auto-update updated_at
  pgm.createTrigger('payment_installments', 'update_installments_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // Create function to auto-update status to overdue
  pgm.createFunction(
    'update_installment_status',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql',
      replace: true,
    },
    `
    BEGIN
      IF NEW.status = 'pending' AND NEW.due_date < CURRENT_DATE THEN
        NEW.status := 'overdue';
      END IF;
      RETURN NEW;
    END;
    `
  );

  // Create trigger to check if installment is overdue
  pgm.createTrigger('payment_installments', 'check_installment_overdue', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'update_installment_status',
    level: 'ROW',
  });

  // Create function to mark installment paid when payment is linked
  pgm.createFunction(
    'mark_installment_paid',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql',
      replace: true,
    },
    `
    BEGIN
      IF NEW.payment_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.payment_id IS NULL) THEN
        NEW.status := 'paid';
        NEW.paid_date := NOW();

        -- Get paid amount from payment
        SELECT amount INTO NEW.paid_amount
        FROM payments
        WHERE id = NEW.payment_id;
      END IF;
      RETURN NEW;
    END;
    `
  );

  // Create trigger to mark installment paid
  pgm.createTrigger('payment_installments', 'trigger_mark_installment_paid', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'mark_installment_paid',
    level: 'ROW',
  });

  // Create helper function to generate installments for an order
  pgm.createFunction(
    'generate_installments',
    [
      { mode: 'IN', name: 'p_order_id', type: 'uuid' },
      { mode: 'IN', name: 'p_total_amount', type: 'decimal' },
      { mode: 'IN', name: 'p_num_installments', type: 'integer' },
      { mode: 'IN', name: 'p_first_due_date', type: 'date' },
    ],
    {
      returns: 'void',
      language: 'plpgsql',
      replace: true,
    },
    `
    DECLARE
      v_installment_amount DECIMAL;
      v_remainder DECIMAL;
      v_i INTEGER;
      v_due_date DATE;
    BEGIN
      -- Calculate installment amount
      v_installment_amount := FLOOR((p_total_amount / p_num_installments) * 100) / 100;
      v_remainder := p_total_amount - (v_installment_amount * p_num_installments);

      -- Create installments
      FOR v_i IN 1..p_num_installments LOOP
        v_due_date := p_first_due_date + ((v_i - 1) || ' months')::INTERVAL;

        INSERT INTO payment_installments (
          order_id,
          installment_number,
          total_installments,
          amount,
          due_date
        ) VALUES (
          p_order_id,
          v_i,
          p_num_installments,
          CASE
            WHEN v_i = p_num_installments THEN v_installment_amount + v_remainder
            ELSE v_installment_amount
          END,
          v_due_date
        );
      END LOOP;
    END;
    `
  );
};

exports.down = (pgm) => {
  // Drop helper function
  pgm.dropFunction(
    'generate_installments',
    [
      { mode: 'IN', name: 'p_order_id', type: 'uuid' },
      { mode: 'IN', name: 'p_total_amount', type: 'decimal' },
      { mode: 'IN', name: 'p_num_installments', type: 'integer' },
      { mode: 'IN', name: 'p_first_due_date', type: 'date' },
    ],
    { ifExists: true }
  );

  // Drop triggers
  pgm.dropTrigger('payment_installments', 'trigger_mark_installment_paid', {
    ifExists: true,
  });
  pgm.dropTrigger('payment_installments', 'check_installment_overdue', {
    ifExists: true,
  });
  pgm.dropTrigger('payment_installments', 'update_installments_updated_at', {
    ifExists: true,
  });

  // Drop functions
  pgm.dropFunction('mark_installment_paid', [], { ifExists: true });
  pgm.dropFunction('update_installment_status', [], { ifExists: true });

  // Drop table
  pgm.dropTable('payment_installments', { ifExists: true });

  // Drop enum
  pgm.dropType('installment_status_enum', { ifExists: true });
};
