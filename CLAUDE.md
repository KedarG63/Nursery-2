# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Plant Nursery Management System - A full-stack application for managing plant nursery operations including inventory tracking, customer management, orders, payments, delivery, and WhatsApp integration.

## Architecture

**Monorepo Structure:**
- `backend/` - Node.js/Express REST API
- `frontend/` - React application (Create React App or Vite)

**Technology Stack:**
- **Backend:** Node.js, Express.js, PostgreSQL with pg library (connection pooling, max 20 connections)
- **Frontend:** React with react-i18next for i18n
- **Database:** PostgreSQL with node-pg-migrate for migrations
- **Authentication:** JWT-based with role-based access control (RBAC)
- **QR Codes:** For lot/tray tracking
- **Messaging:** WhatsApp Business API integration
- **Languages:** Multi-language support (English/Hindi)

## Development Commands

**Database Migrations:**
```bash
npm run migrate:up      # Run pending migrations
npm run migrate:down    # Rollback last migration
```

**Development:**
```bash
# Backend
cd backend
npm run dev            # Start with nodemon hot reload

# Frontend
cd frontend
npm start              # Development server
npm run build          # Production build
```

## Core System Components

### Authentication & Authorization
- JWT-based authentication system
- Role-based access control with roles: Admin, Manager, Sales, Warehouse, Delivery
- User sessions with refresh token rotation
- Password reset via email/WhatsApp OTP

### Inventory Management
- **Products** - Plant species/varieties with descriptions, categories, pricing
- **SKUs** - Specific product variants (size, pot type, price tiers)
- **Lots** - Physical trays/batches with QR codes for tracking
- **Lot Movements** - History tracking for warehouse operations
- Inventory adjustments with audit logging

### Customer Management (CRM)
- Customer profiles with multiple delivery addresses
- Credit limit management and payment terms
- Customer portal for order placement and history
- GST/tax number tracking

### Order Management
- Multi-item orders with customizable status workflow
- Order status history tracking
- Partial deliveries support
- Manual and automated order assignment to delivery personnel

### Payment Processing
- Multiple payment methods (Cash, UPI, Card, Bank Transfer, Credit)
- Payment reconciliation
- Credit note management
- Payment reminders via WhatsApp

### Delivery Management
- Route optimization for delivery planning
- GPS tracking integration
- Delivery status updates with timestamps
- Proof of delivery (signatures, photos)
- Failed delivery handling with re-attempt scheduling

### WhatsApp Integration
- Order confirmations and updates
- Payment reminders
- Delivery notifications with tracking links
- Customer support via WhatsApp
- Automated daily summaries to admin

### Reports & Analytics
- Sales reports (daily, weekly, monthly, custom)
- Inventory aging reports
- Customer purchase history
- Payment collection reports
- Delivery performance metrics
- Low stock alerts

## Database Architecture

**Key Tables:**
- `users` - User accounts with role-based access
- `products` - Plant species/varieties
- `skus` - Product variants
- `lots` - Physical inventory batches with QR codes
- `lot_movements` - Inventory movement history
- `customers` - Customer information
- `customer_addresses` - Delivery addresses
- `orders` - Order headers
- `order_items` - Line items
- `order_status_history` - Status tracking
- `payments` - Payment records
- `deliveries` - Delivery assignments and tracking

**Important Patterns:**
- All tables use UUID primary keys
- Soft deletes with `deleted_at` timestamp
- Audit columns: `created_at`, `updated_at`, `created_by`, `updated_by`
- Migration files stored in `backend/migrations/`
- Migrations must be idempotent

## Configuration

**Environment Variables:**
- Backend: `backend/.env` (see `backend/.env.example`)
  - Database connection (PostgreSQL)
  - JWT secrets
  - WhatsApp API credentials
  - Email service credentials

- Frontend: `frontend/.env` (see `frontend/.env.example`)
  - API base URL
  - Environment-specific settings

**CORS:** Configured for local development in backend

## Code Standards

- ESLint and Prettier configured at root level
- Git hooks for pre-commit checks
- Connection retry logic for database failures
- Comprehensive error handling and logging
- Database connection health check endpoint required

## Deployment

- **Backend:** Node 18 Alpine Docker image
- **Frontend:** Build with Node, serve with nginx
- Separate staging and production environments
- Automated backups and CI/CD pipeline planned
