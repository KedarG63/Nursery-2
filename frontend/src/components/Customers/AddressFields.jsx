import {
  Box,
  TextField,
  IconButton,
  Checkbox,
  FormControlLabel,
  Typography,
  Paper,
  Grid
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import PropTypes from 'prop-types';

/**
 * Dynamic address fields component for customer form
 */
const AddressFields = ({ address, index, register, errors, onRemove, canRemove }) => {
  return (
    <Paper sx={{ p: 2, mb: 2, position: 'relative' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle2" color="primary">
          Address {index + 1}
        </Typography>

        {canRemove && (
          <IconButton
            size="small"
            color="error"
            onClick={() => onRemove(index)}
            aria-label="Remove address"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Address Line 1"
            {...register(`addresses.${index}.address_line1`)}
            error={!!errors?.addresses?.[index]?.address_line1}
            helperText={errors?.addresses?.[index]?.address_line1?.message}
            required
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Address Line 2"
            {...register(`addresses.${index}.address_line2`)}
            error={!!errors?.addresses?.[index]?.address_line2}
            helperText={errors?.addresses?.[index]?.address_line2?.message}
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="City"
            {...register(`addresses.${index}.city`)}
            error={!!errors?.addresses?.[index]?.city}
            helperText={errors?.addresses?.[index]?.city?.message}
            required
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="State"
            {...register(`addresses.${index}.state`)}
            error={!!errors?.addresses?.[index]?.state}
            helperText={errors?.addresses?.[index]?.state?.message}
            required
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="Pincode"
            {...register(`addresses.${index}.pincode`)}
            error={!!errors?.addresses?.[index]?.pincode}
            helperText={errors?.addresses?.[index]?.pincode?.message}
            inputProps={{ maxLength: 6 }}
          />
        </Grid>

        <Grid item xs={12}>
          <FormControlLabel
            control={
              <Checkbox
                {...register(`addresses.${index}.is_default`)}
                defaultChecked={index === 0}
              />
            }
            label="Set as default address"
          />
        </Grid>
      </Grid>
    </Paper>
  );
};

AddressFields.propTypes = {
  address: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  register: PropTypes.func.isRequired,
  errors: PropTypes.object,
  onRemove: PropTypes.func.isRequired,
  canRemove: PropTypes.bool.isRequired
};

export default AddressFields;
