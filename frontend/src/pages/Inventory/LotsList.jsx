import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Paper,
  Typography,
  Pagination,
  Grid,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  Autocomplete,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useDebounce } from 'use-debounce';
import LotsTable from '../../components/Inventory/LotsTable';
import LotForm from '../../components/Inventory/LotForm';
import QRCodeModal from '../../components/Inventory/QRCodeModal';
import LocationChangeDialog from '../../components/Inventory/LocationChangeDialog';
import lotService from '../../services/lotService';
import skuService from '../../services/skuService';
import { canEdit } from '../../utils/roleCheck';

const LotsList = () => {
  const { user } = useSelector((state) => state.auth);
  const userRole = user?.roles;
  const [searchParams, setSearchParams] = useSearchParams();

  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 500);
  const [stageFilter, setStageFilter] = useState([]);
  const [locationFilter, setLocationFilter] = useState('');
  const [skuFilter, setSkuFilter] = useState('');
  const [showOverdue, setShowOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [lotToDelete, setLotToDelete] = useState(null);
  const [lotFormOpen, setLotFormOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedLotForQR, setSelectedLotForQR] = useState(null);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [selectedLotForLocation, setSelectedLotForLocation] = useState(null);

  // Filter data
  const [skus, setSkus] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loadingFilters, setLoadingFilters] = useState(false);

  const stages = lotService.getStages();

  // Fetch filter data
  useEffect(() => {
    fetchFilterData();
  }, []);

  // Check for action query parameter on mount
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'create' && canEdit(userRole)) {
      setLotFormOpen(true);
      // Clear the action param after opening the dialog
      searchParams.delete('action');
      setSearchParams(searchParams);
    }
  }, []);

  // Fetch lots
  useEffect(() => {
    fetchLots();
  }, [debouncedSearch, stageFilter, locationFilter, skuFilter, showOverdue, page]);

  const fetchFilterData = async () => {
    setLoadingFilters(true);
    try {
      // Fetch SKUs for filter
      const skuResponse = await skuService.getAllSKUs({ limit: 1000 });
      setSkus(skuResponse.data || skuResponse.skus || []);

      // Fetch lots to extract unique locations
      const lotsResponse = await lotService.getAllLots({ limit: 1000 });
      const lotsData = lotsResponse.data || lotsResponse.lots || [];
      const uniqueLocations = [...new Set(
        lotsData
          .map(lot => lot.current_location)
          .filter(location => location)
      )].sort();
      setLocations(uniqueLocations);
    } catch (error) {
      console.error('Failed to fetch filter data:', error);
    } finally {
      setLoadingFilters(false);
    }
  };

  const fetchLots = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
      };

      if (debouncedSearch) {
        params.search = debouncedSearch;
      }

      if (stageFilter.length > 0) {
        params.stage = stageFilter.join(',');
      }

      if (locationFilter) {
        params.location = locationFilter;
      }

      if (skuFilter) {
        params.sku_id = skuFilter;
      }

      if (showOverdue) {
        params.overdue = true;
      }

      const response = await lotService.getAllLots(params);
      setLots(response.data || response.lots || []);
      setTotalPages(response.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch lots:', error);
      toast.error('Failed to load lots');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
    setPage(1);
  };

  const handleStageFilterChange = (event) => {
    setStageFilter(event.target.value);
    setPage(1);
  };

  const handleLocationFilterChange = (event) => {
    setLocationFilter(event.target.value);
    setPage(1);
  };

  const handleSKUFilterChange = (event) => {
    setSkuFilter(event.target.value);
    setPage(1);
  };

  const handleShowOverdueChange = (event) => {
    setShowOverdue(event.target.checked);
    setPage(1);
  };

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  const handleAddLot = () => {
    setLotFormOpen(true);
  };

  const handleQRCode = (lot) => {
    setSelectedLotForQR(lot);
    setQrModalOpen(true);
  };

  const handleStageChange = async (lotId, newStage) => {
    try {
      await lotService.updateLotStage(lotId, newStage);
      toast.success('Stage updated successfully');
      fetchLots();
    } catch (error) {
      console.error('Failed to update stage:', error);
      toast.error(error.response?.data?.message || 'Failed to update stage');
    }
  };

  const handleLocationChange = (lot) => {
    setSelectedLotForLocation(lot);
    setLocationDialogOpen(true);
  };

  const handleLocationChanged = () => {
    fetchLots();
  };

  const handleDeleteClick = (lotId) => {
    setLotToDelete(lotId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await lotService.deleteLot(lotToDelete);
      toast.success('Lot deleted successfully');
      setDeleteDialogOpen(false);
      setLotToDelete(null);
      fetchLots();
    } catch (error) {
      console.error('Failed to delete lot:', error);
      toast.error(error.response?.data?.message || 'Failed to delete lot');
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setLotToDelete(null);
  };

  const handleLotFormClose = () => {
    setLotFormOpen(false);
  };

  const handleLotSaved = () => {
    fetchLots();
    fetchFilterData(); // Refresh filters in case new locations were added
    handleLotFormClose();
  };

  const handleQRModalClose = () => {
    setQrModalOpen(false);
    setSelectedLotForQR(null);
  };

  const handleLocationDialogClose = () => {
    setLocationDialogOpen(false);
    setSelectedLotForLocation(null);
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          Lots Inventory
        </Typography>
        {canEdit(userRole) && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleAddLot}
          >
            Create Lot
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          {/* Search */}
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              placeholder="Search by lot number..."
              value={searchQuery}
              onChange={handleSearchChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>

          {/* Stage Filter */}
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth>
              <InputLabel>Stage</InputLabel>
              <Select
                multiple
                value={stageFilter}
                onChange={handleStageFilterChange}
                label="Stage"
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip key={value} label={value} size="small" />
                    ))}
                  </Box>
                )}
              >
                {stages.map((stage) => (
                  <MenuItem key={stage} value={stage}>
                    {stage.charAt(0).toUpperCase() + stage.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Location Filter */}
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth>
              <InputLabel>Location</InputLabel>
              <Select
                value={locationFilter}
                onChange={handleLocationFilterChange}
                label="Location"
                disabled={loadingFilters}
              >
                <MenuItem value="">All Locations</MenuItem>
                {locations.map((location) => (
                  <MenuItem key={location} value={location}>
                    {location}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* SKU Filter */}
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth>
              <InputLabel>SKU</InputLabel>
              <Select
                value={skuFilter}
                onChange={handleSKUFilterChange}
                label="SKU"
                disabled={loadingFilters}
              >
                <MenuItem value="">All SKUs</MenuItem>
                {skus.map((sku) => (
                  <MenuItem key={sku.id} value={sku.id}>
                    {sku.product?.name} — {sku.variety || sku.sku_code}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Show Overdue */}
          <Grid item xs={12} sm={6} md={2}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={showOverdue}
                  onChange={handleShowOverdueChange}
                />
              }
              label="Show Overdue"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Lots Table */}
      <LotsTable
        lots={lots}
        loading={loading}
        onQRCode={handleQRCode}
        onStageChange={handleStageChange}
        onLocationChange={handleLocationChange}
        onDelete={handleDeleteClick}
      />

      {/* Pagination */}
      {!loading && lots.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={handlePageChange}
            color="primary"
          />
        </Box>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          Are you sure you want to delete this lot? This action cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Lot Form Dialog */}
      <LotForm
        open={lotFormOpen}
        onClose={handleLotFormClose}
        onSuccess={handleLotSaved}
      />

      {/* QR Code Modal */}
      {selectedLotForQR && (
        <QRCodeModal
          open={qrModalOpen}
          onClose={handleQRModalClose}
          lotId={selectedLotForQR.id}
          lotNumber={selectedLotForQR.lot_number}
          lotDetails={{
            skuName: selectedLotForQR.variety || selectedLotForQR.sku_code,
            productName: selectedLotForQR.product_name,
            location: selectedLotForQR.current_location,
            stage: selectedLotForQR.growth_stage,
            expected_ready_date: selectedLotForQR.expected_ready_date,
            lot_created_at: selectedLotForQR.created_at,
            seed_lot_number: selectedLotForQR.seed_lot_number,
            seed_vendor_name: selectedLotForQR.seed_vendor_name,
            seed_expiry_date: selectedLotForQR.seed_expiry_date,
            seed_purchase_date: selectedLotForQR.seed_purchase_date,
          }}
        />
      )}

      {/* Location Change Dialog */}
      {selectedLotForLocation && (
        <LocationChangeDialog
          open={locationDialogOpen}
          onClose={handleLocationDialogClose}
          lotId={selectedLotForLocation.id}
          currentLocation={selectedLotForLocation.current_location}
          onLocationChanged={handleLocationChanged}
        />
      )}
    </Box>
  );
};

export default LotsList;
