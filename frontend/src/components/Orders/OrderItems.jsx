import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Typography,
  Autocomplete,
  TextField,
  Grid,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import skuService from '../../services/skuService';
import { formatCurrency } from '../../utils/formatters';

/**
 * Order Items Component
 * Allows adding/removing SKUs with quantities
 * Issue #57: Order creation wizard - Step 2
 */
const OrderItems = ({ items, onItemsChange }) => {
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSKU, setSelectedSKU] = useState(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    fetchSKUs();
  }, []);

  const fetchSKUs = async () => {
    try {
      setLoading(true);
      const response = await skuService.getAllSKUs({ limit: 1000, active: 'true' });
      setSkus(response.data || response.skus || []);
    } catch (error) {
      console.error('Error fetching SKUs:', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    if (!selectedSKU) {
      toast.error('Please select a product');
      return;
    }

    if (quantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    // Check if item already exists
    const existingIndex = items.findIndex(item => item.sku_id === selectedSKU.id);

    if (existingIndex >= 0) {
      // Update existing item quantity
      const updatedItems = [...items];
      updatedItems[existingIndex].quantity += quantity;
      updatedItems[existingIndex].subtotal = updatedItems[existingIndex].quantity * updatedItems[existingIndex].unit_price;
      onItemsChange(updatedItems);
      toast.info('Quantity updated');
    } else {
      // Add new item
      const newItem = {
        sku_id: selectedSKU.id,
        sku_code: selectedSKU.sku_code,
        sku_name: selectedSKU.name,
        product_name: selectedSKU.product_name,
        quantity: quantity,
        unit_price: parseFloat(selectedSKU.price),
        subtotal: quantity * parseFloat(selectedSKU.price),
      };
      onItemsChange([...items, newItem]);
      toast.success('Item added');
    }

    // Reset form
    setSelectedSKU(null);
    setQuantity(1);
  };

  const handleRemoveItem = (index) => {
    const updatedItems = items.filter((_, i) => i !== index);
    onItemsChange(updatedItems);
    toast.info('Item removed');
  };

  const handleQuantityChange = (index, newQuantity) => {
    if (newQuantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    const updatedItems = [...items];
    updatedItems[index].quantity = newQuantity;
    updatedItems[index].subtotal = newQuantity * updatedItems[index].unit_price;
    onItemsChange(updatedItems);
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.subtotal, 0);
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Add Order Items
      </Typography>

      {/* Add Item Form */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="flex-end">
          <Grid item xs={12} md={6}>
            <Autocomplete
              value={selectedSKU}
              onChange={(event, newValue) => setSelectedSKU(newValue)}
              options={skus}
              getOptionLabel={(option) =>
                `${option.sku_code} - ${option.name} (${option.product_name}) - ${formatCurrency(option.price)}`
              }
              loading={loading}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Product/SKU"
                  variant="outlined"
                  fullWidth
                />
              )}
            />
          </Grid>

          <Grid item xs={12} md={3}>
            <TextField
              label="Quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              fullWidth
              InputProps={{ inputProps: { min: 1 } }}
            />
          </Grid>

          <Grid item xs={12} md={3}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddItem}
              fullWidth
              disabled={!selectedSKU}
            >
              Add Item
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Items Table */}
      {items.length > 0 ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>SKU Code</TableCell>
                <TableCell>Product</TableCell>
                <TableCell align="right">Unit Price</TableCell>
                <TableCell align="center">Quantity</TableCell>
                <TableCell align="right">Subtotal</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.sku_code}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{item.sku_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.product_name}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell align="center">
                    <TextField
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 1)}
                      size="small"
                      sx={{ width: 80 }}
                      InputProps={{ inputProps: { min: 1 } }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="bold">
                      {formatCurrency(item.subtotal)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      color="error"
                      size="small"
                      onClick={() => handleRemoveItem(index)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}

              {/* Total Row */}
              <TableRow>
                <TableCell colSpan={4} align="right">
                  <Typography variant="h6">Total:</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="h6" color="primary">
                    {formatCurrency(calculateTotal())}
                  </Typography>
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            No items added yet. Use the form above to add products to the order.
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default OrderItems;
