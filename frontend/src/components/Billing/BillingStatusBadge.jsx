import React from 'react';
import { Chip } from '@mui/material';

const colorMap = {
  // Invoice statuses
  draft: 'default',
  issued: 'info',
  partially_paid: 'warning',
  paid: 'success',
  void: 'error',
  // Vendor bill / seed purchase payment statuses
  pending: 'warning',
  partial: 'info',
};

const labelMap = {
  draft: 'Draft',
  issued: 'Issued',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  void: 'Void',
  pending: 'Pending',
  partial: 'Partial',
};

const BillingStatusBadge = ({ status, size = 'small', variant = 'filled' }) => {
  const color = colorMap[status] || 'default';
  const label = labelMap[status] || status;

  return (
    <Chip
      label={label}
      color={color}
      size={size}
      variant={variant}
      sx={{ fontWeight: 500, textTransform: 'capitalize' }}
    />
  );
};

export default BillingStatusBadge;
