import { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Chip, Paper, Avatar,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel,
  Alert, CircularProgress, IconButton, Tooltip,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import LockResetIcon from '@mui/icons-material/LockReset';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import useAuth from '../../hooks/useAuth';
import userService from '../../services/userService';

const ROLES = ['Admin', 'Manager', 'Sales', 'Warehouse', 'Delivery'];

const ROLE_STYLE = {
  Admin:     { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  Manager:   { color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  Sales:     { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  Warehouse: { color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  Delivery:  { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
};

const ROLE_FILTERS = ['All', ...ROLES];

const validatePassword = (pwd) => {
  if (pwd.length < 8) return 'Minimum 8 characters';
  if (!/[A-Z]/.test(pwd)) return 'At least 1 uppercase letter required';
  if (!/[a-z]/.test(pwd)) return 'At least 1 lowercase letter required';
  if (!/[0-9]/.test(pwd)) return 'At least 1 number required';
  return null;
};

const initCreateForm = () => ({ email: '', password: '', full_name: '', phone: '', role: 'Sales' });
const initEditForm = () => ({ full_name: '', phone: '', role: '' });

export default function UsersList() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.roles?.includes('Admin');

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Forms
  const [createForm, setCreateForm] = useState(initCreateForm());
  const [editForm, setEditForm] = useState(initEditForm());
  const [newPassword, setNewPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await userService.getUsers();
      setUsers(data.users || []);
    } catch (err) {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  const flash = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // ── CREATE ──────────────────────────────────────────────────────────────
  const handleCreateSubmit = async () => {
    setFormError('');
    if (!createForm.email || !createForm.full_name || !createForm.role) {
      return setFormError('Email, full name and role are required.');
    }
    const pwdErr = validatePassword(createForm.password);
    if (pwdErr) return setFormError(pwdErr);

    try {
      setSubmitting(true);
      await userService.createUser(createForm);
      setCreateOpen(false);
      setCreateForm(initCreateForm());
      await loadUsers();
      flash('User created successfully.');
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create user.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── EDIT ─────────────────────────────────────────────────────────────────
  const openEdit = (u) => {
    setEditTarget(u);
    setEditForm({ full_name: u.fullName, phone: u.phone || '', role: u.roles[0] || '' });
    setFormError('');
  };

  const handleEditSubmit = async () => {
    setFormError('');
    if (!editForm.full_name) return setFormError('Full name is required.');
    try {
      setSubmitting(true);
      await userService.updateUser(editTarget.id, { full_name: editForm.full_name, phone: editForm.phone });
      if (isAdmin && editForm.role && editForm.role !== editTarget.roles[0]) {
        await userService.updateRole(editTarget.id, editForm.role);
      }
      setEditTarget(null);
      await loadUsers();
      flash('User updated successfully.');
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to update user.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── RESET PASSWORD ────────────────────────────────────────────────────────
  const handleResetPassword = async () => {
    setFormError('');
    const pwdErr = validatePassword(newPassword);
    if (pwdErr) return setFormError(pwdErr);
    try {
      setSubmitting(true);
      await userService.resetPassword(resetTarget.id, newPassword);
      setResetTarget(null);
      setNewPassword('');
      flash(`Password reset for ${resetTarget.fullName}.`);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── TOGGLE STATUS ────────────────────────────────────────────────────────
  const handleToggleStatus = async (u) => {
    const newStatus = u.status === 'active' ? 'inactive' : 'active';
    try {
      await userService.toggleStatus(u.id, newStatus);
      await loadUsers();
      flash(`${u.fullName} ${newStatus === 'active' ? 'activated' : 'deactivated'}.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status.');
    }
  };

  // ── DELETE ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      setSubmitting(true);
      await userService.deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      await loadUsers();
      flash('User removed.');
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to remove user.');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = roleFilter === 'All'
    ? users
    : users.filter(u => u.roles.includes(roleFilter));

  const getInitials = (name) => name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
      <CircularProgress />
    </Box>
  );

  return (
    <Box sx={{ pb: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>User Management</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {users.length} account{users.length !== 1 ? 's' : ''} · Manage login credentials and access roles
          </Typography>
        </Box>
        {isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setCreateOpen(true); setFormError(''); setCreateForm(initCreateForm()); }}>
            Add User
          </Button>
        )}
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Role filter chips */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
        {ROLE_FILTERS.map(r => (
          <Chip
            key={r}
            label={r === 'All' ? `All (${users.length})` : `${r} (${users.filter(u => u.roles.includes(r)).length})`}
            onClick={() => setRoleFilter(r)}
            variant={roleFilter === r ? 'filled' : 'outlined'}
            color={roleFilter === r ? 'primary' : 'default'}
            size="small"
          />
        ))}
      </Box>

      {/* Users table */}
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>User</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Created</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    No users found
                  </TableCell>
                </TableRow>
              ) : filtered.map((u) => {
                const role = u.roles[0] || '';
                const rs = ROLE_STYLE[role] || { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' };
                const isSelf = u.id === currentUser?.id;
                return (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ width: 36, height: 36, bgcolor: rs.bg, color: rs.color, fontSize: '0.8rem', fontWeight: 700, border: `1px solid ${rs.border}` }}>
                          {getInitials(u.fullName)}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {u.fullName}
                            {isSelf && <Chip label="You" size="small" sx={{ ml: 0.75, height: 18, fontSize: '0.65rem' }} />}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {u.roles.filter(Boolean).map(r => {
                        const s = ROLE_STYLE[r] || { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' };
                        return (
                          <Chip
                            key={r}
                            label={r}
                            size="small"
                            sx={{ bgcolor: s.bg, color: s.color, border: `1px solid ${s.border}`, fontWeight: 600, fontSize: '0.7rem' }}
                          />
                        );
                      })}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={u.status === 'active' ? 'Active' : 'Inactive'}
                        size="small"
                        sx={{
                          bgcolor: u.status === 'active' ? '#f0fdf4' : '#fef2f2',
                          color: u.status === 'active' ? '#15803d' : '#b91c1c',
                          border: `1px solid ${u.status === 'active' ? '#bbf7d0' : '#fecaca'}`,
                          fontWeight: 600,
                          fontSize: '0.7rem',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(u)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {isAdmin && (
                          <>
                            <Tooltip title="Reset password">
                              <IconButton size="small" onClick={() => { setResetTarget(u); setNewPassword(''); setFormError(''); }}>
                                <LockResetIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {!isSelf && (
                              <Tooltip title={u.status === 'active' ? 'Deactivate' : 'Activate'}>
                                <IconButton size="small" onClick={() => handleToggleStatus(u)} color={u.status === 'active' ? 'warning' : 'success'}>
                                  {u.status === 'active' ? <PersonOffIcon fontSize="small" /> : <PersonIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                            )}
                            {!isSelf && (
                              <Tooltip title="Remove user">
                                <IconButton size="small" color="error" onClick={() => { setDeleteTarget(u); setFormError(''); }}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ── CREATE USER DIALOG ─────────────────────────────────────────────── */}
      <Dialog open={createOpen} onClose={() => !submitting && setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Full Name *"
              value={createForm.full_name}
              onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))}
              fullWidth size="small"
            />
            <TextField
              label="Email Address *"
              type="email"
              value={createForm.email}
              onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
              fullWidth size="small"
            />
            <TextField
              label="Phone"
              value={createForm.phone}
              onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
              fullWidth size="small"
            />
            <TextField
              label="Password *"
              type={showPwd ? 'text' : 'password'}
              value={createForm.password}
              onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
              fullWidth size="small"
              helperText="Min 8 chars · 1 uppercase · 1 lowercase · 1 number"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPwd(v => !v)}>
                      {showPwd ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <FormControl fullWidth size="small">
              <InputLabel>Role *</InputLabel>
              <Select
                value={createForm.role}
                label="Role *"
                onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}
              >
                {ROLES.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)} disabled={submitting}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateSubmit} disabled={submitting}>
            {submitting ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
            Create User
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── EDIT USER DIALOG ───────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onClose={() => !submitting && setEditTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit User — {editTarget?.fullName}</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Full Name *"
              value={editForm.full_name}
              onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
              fullWidth size="small"
            />
            <TextField
              label="Phone"
              value={editForm.phone}
              onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
              fullWidth size="small"
            />
            {isAdmin && (
              <FormControl fullWidth size="small">
                <InputLabel>Role</InputLabel>
                <Select
                  value={editForm.role}
                  label="Role"
                  onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                >
                  {ROLES.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </Select>
              </FormControl>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditTarget(null)} disabled={submitting}>Cancel</Button>
          <Button variant="contained" onClick={handleEditSubmit} disabled={submitting}>
            {submitting ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── RESET PASSWORD DIALOG ──────────────────────────────────────────── */}
      <Dialog open={!!resetTarget} onClose={() => !submitting && setResetTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Setting a new password for <strong>{resetTarget?.fullName}</strong>.
            Share it with them securely.
          </Typography>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <TextField
            label="New Password *"
            type={showNewPwd ? 'text' : 'password'}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            fullWidth size="small"
            helperText="Min 8 chars · 1 uppercase · 1 lowercase · 1 number"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowNewPwd(v => !v)}>
                    {showNewPwd ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResetTarget(null)} disabled={submitting}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleResetPassword} disabled={submitting}>
            {submitting ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
            Reset Password
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── DELETE CONFIRM DIALOG ──────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onClose={() => !submitting && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Remove User</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Typography variant="body2">
            Remove <strong>{deleteTarget?.fullName}</strong> ({deleteTarget?.email})?
            They will no longer be able to log in.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={submitting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={submitting}>
            {submitting ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
